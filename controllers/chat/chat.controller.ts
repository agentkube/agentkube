import { Request, Response } from "express";
import { chatPromptTemplate } from "../../internal/prompt";
import { getEmbeddings } from "../../internal/embedding";
import { getVectorStore } from "../../connectors/qdrant";
import { commandPrompt } from "../../internal/prompt";
import { OpenAIModel, OpenAIstreamingModel } from "../../services/openai/openai.services";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { testContent2 } from "../content/content";
interface ChatRequest {
  message: string;
  accessType?: "READ_ONLY" | "READ_WRITE";
  chat_history?: Array<{ role: string; content: string }>;
  query_context?: Array<{ command: string; output: string }> | string;
}

export const chat = async (req: Request, res: Response) => {
  try {
    const {
      message,
      accessType = "READ_ONLY",
      chat_history = [],
      query_context,
    } = req.body as ChatRequest;

    if (!message) {
      res.status(400).json({ error: "Message is required" });
      return;
    }

    // Initialize embeddings and vector store
    const embeddings = getEmbeddings();
    const vectorStore = await getVectorStore(embeddings);

    // Get relevant context from vector store
    const searchResults = await vectorStore.similaritySearch(message, 3);
    const context = searchResults.map((doc) => doc.pageContent).join("\n");

    // Format the prompt with context and access type
    const prompt = await chatPromptTemplate.invoke({
      chat_history,
      input: `
Context: ${context}
Access Type: ${accessType}
Pre Executions Results: ${query_context} 

User Question: ${message}
      `,
    }, {

    });

    // Get response from OpenAI
    const result = await OpenAIModel.invoke(prompt);

    res.json({
      response: result.content,
      context: searchResults,
    });
    return;
  } catch (error) {
    console.error("Error in chat controller:", error);
    res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const chatStream = async (req: Request, res: Response) => {
  try {
    const {
      message,
      accessType = "READ_ONLY",
      chat_history = [],
      query_context,
    } = req.body as ChatRequest;

    if (!message) {
      res.status(400).json({ error: "Message is required" });
      return;
    }

    try {
      // embeddings and vector store
      const embeddings = getEmbeddings();
      const vectorStore = await getVectorStore(embeddings);

      // Get relevant context from vector store
      const searchResults = await vectorStore.similaritySearch(message, 3);
      const context = searchResults.map((doc) => doc.pageContent).join("\n");

      // Send context to client
      res.sendEvent("context", searchResults);

      console.log("------------ 🚀")
      console.log(query_context)
      console.log("------------ 🚀")
  
      // Format the prompt with context and access type
      const prompt = await chatPromptTemplate.invoke({
        chat_history,
        input: `
Context: ${context}
Access Type: ${accessType}
Outputs: ${query_context} 

Note:
Find the issue from Pre Execution Outputs. 
It contains what kubectl commands has been ran and find the issue from their output. 
Do not provide commands with variables. Provide command that can executed in cluster based on output. 
If no command and output is provided then provide variable(generalised) commands.

User Question: ${message}
        `,
      });

      // Stream the response
      let responseText = "";

      await OpenAIstreamingModel.invoke(prompt, {
        callbacks: [
          {
            handleLLMNewToken(token: string) {
              responseText += token;
              res.sendEvent("token", token);
            },
          },
        ],
      });

      // Send completion message
      res.sendEvent("end", responseText);
      res.endSSE();
    } catch (error) {
      res.sendEvent(
        "error",
        error instanceof Error ? error.message : "Unknown error"
      );
      res.endSSE();
    }
  } catch (error) {
    console.error("Error setting up stream:", error);
    res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};


export const testChatStream = async (req: Request, res: Response) => {
  try {
    const {
      message,
      accessType = "READ_ONLY",
      chat_history = [],
    } = req.body as ChatRequest;

    if (!message) {
      res.status(400).json({ error: "Message is required" });
      return;
    }

    try {
      // Simulate getting context
      const mockContext = {
        pageContent: `This is a simulated context for testing purposes ${accessType} ${chat_history}`,
        metadata: { source: "test-source" }
      };
      
      // Send mock context to client
      res.sendEvent("context", [mockContext]);

      // Split the test content into chunks to simulate streaming
      const chunks = testContent2.split(' ');
      
      // Simulate streaming with a small delay between chunks
      let responseText = '';
      
      for (const chunk of chunks) {
        // Add a space back (since we split by space) unless it's the first word
        const token = responseText ? ' ' + chunk : chunk;
        responseText += token;
        
        res.sendEvent("token", token);
        
        // Add a small delay to simulate real streaming
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Send completion message
      res.sendEvent("end", responseText);
      res.endSSE();
    } catch (error) {
      res.sendEvent(
        "error",
        error instanceof Error ? error.message : "Unknown error"
      );
      res.endSSE();
    }
  } catch (error) {
    console.error("Error setting up stream:", error);
    res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

interface ParseIntentRequest {
  message: string;
  accessType?: "READ_ONLY" | "READ_WRITE";
  chat_history?: Array<{ role: string; content: string }>;
}

export const parseIntent = async (req: Request, res: Response) => {
  try {
    const { 
      message, 
      accessType = "READ_ONLY",
      chat_history = []
    } = req.body as ParseIntentRequest;

    if (!message) {
      res.status(400).json({ error: "Message is required" });
      return;
    }

    // Format previous commands from chat history
    const previousCommands = chat_history
      .filter(msg => msg.role === "assistant")
      .map(msg => {
        try {
          const parsed = JSON.parse(msg.content);
          return parsed.command;
        } catch {
          return null;
        }
      })
      .filter(cmd => cmd)
      .join("\n");

    const systemPrompt = `
    ${commandPrompt}
    
    Access Type: ${accessType}
    - If READ_ONLY: Only allow read operations (get, describe, logs)
    - If READ_WRITE: Allow all operations
    
    Previously used commands:
    ${previousCommands || "No previous commands"}

    Consider the context of previously used commands when suggesting new commands.
    For example, if they previously looked at pods in a specific namespace,
    they might want to inspect one of those pods more closely.
    
    Only return valid kubectl commands. If the intent is unclear or unsafe, 
    return an empty command with explanation in description. 
    
    Return your response in this exact format:
    {
      "command": "the kubectl command",
      "description": "brief description of what the command does"
    }`;

    const result = await OpenAIModel.invoke([
      new SystemMessage(systemPrompt),
      ...chat_history.map(msg => 
        msg.role === "user" 
          ? new HumanMessage(msg.content)
          : new SystemMessage(msg.content)
      ),
      new HumanMessage(`Convert this request to kubectl command: ${message}`)
    ]);

    // Parse the response as JSON
    try {
      const parsedResponse = JSON.parse(result.content as any);
      res.json(parsedResponse);
    } catch (parseError) {
      res.json({
        command: "",
        description: "Failed to parse the command response"
      });
    }
    
  } catch (error) {
    console.error("Error in parse intent controller:", error);
    res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
