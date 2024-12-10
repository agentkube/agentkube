import { Request, Response } from "express";
import { chatPromptTemplate } from "../../internal/prompt";
import { getEmbeddings } from "../../internal/embedding";
import { getVectorStore } from "../../connectors/qdrant";
import { ChatOpenAI } from "@langchain/openai";

interface ChatRequest {
  message: string;
  accessType?: "READ_ONLY" | "READ_WRITE";
  chat_history?: Array<{ role: string; content: string }>;
}

// Initialize the OpenAI chat model
const model = new ChatOpenAI({
  modelName: process.env.OPENAI_MODEL_NAME || "gpt-4o-mini",
  temperature: 0.7,
  openAIApiKey: process.env.OPENAI_API_KEY,
  maxTokens: 4096,
  streaming: false,
});

const streamingModel = new ChatOpenAI({
  modelName: process.env.OPENAI_MODEL_NAME || "gpt-4o-mini",
  temperature: 0.7,
  openAIApiKey: process.env.OPENAI_API_KEY,
  maxTokens: 4096,
  streaming: true,
});

export const chat = async (req: Request, res: Response) => {
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

User Question: ${message}
      `,
    });

    // Get response from OpenAI
    const result = await model.invoke(prompt);

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

      // Format the prompt with context and access type
      const prompt = await chatPromptTemplate.invoke({
        chat_history,
        input: `
Context: ${context}
Access Type: ${accessType}

User Question: ${message}
        `,
      });

      // Stream the response
      let responseText = "";

      await streamingModel.invoke(prompt, {
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

const testContent = `To debug a pod that is stuck in a \`CrashLoopBackOff\` state,
you can follow these systematic steps to gather information about the pod's status, logs, 
and events. Since your access type is READ_ONLY, you will be limited to read operations.\n\n### Step 1: Check Pod Status\nFirst, 
you want to get an overview of the pod's status, including its current state and any 
restarts.\n\n\`\`\`bash\nkubectl get pods\n\`\`\`\n\nThis command will give you a list of all pods 
in the current namespace, along with their status, including the \`CrashLoopBackOff\` state.\n\n### Step 2: 
Describe the Pod\nNext, use the \`kubectl describe\` command to get more detailed information about the pod, 
including events that may provide insights into why it is crashing.\n\n\`\`\`bash\nkubectl describe pod POD_NAME\n\`\`\`\n\n
Replace \`POD_NAME\` with the name of the pod that is in \`CrashLoopBackOff\`. Look for any warning or error 
messages in the events section at the bottom of the output.\n\n### Step 3: Check Pod Logs\nTo understand what caused
the pod to crash, you can check the logs. Use the following command to retrieve the logs of 
the pod:\n\n\`\`\`bash\nkubectl logs POD_NAME\n\`\`\`\n\nIf the pod has multiple containers, specify the container 
name with the \`-c\` flag:\n\n\`\`\`bash\nkubectl logs POD_NAME -c CONTAINER_NAME\n\`\`\`\n\nReview the logs for any 
error messages or stack traces that could indicate what went wrong during startup.\n\n### Step 4: Check Previous Logs\nIf 
the pod has restarted multiple times, you might want to check the logs from the previous instance of the container to see 
if there were any additional insights.\n\n\`\`\`bash\nkubectl logs POD_NAME --previous\n\`\`\`\n\n### Step 5: Investigate
Resource Limits\nIf the pod is crashing due to resource constraints, you might want to check its resource requests and limits.
Run the following command to get the pod's specification, which includes resource configurations:\n\n\`\`\`bash\nkubectl get
pod POD_NAME -o yaml\n\`\`\`\n\nLook for the \`resources\` section in the output. If the limits are too low, it may contribute 
to the crashing behavior.\n\n### Step 6: Examine Node Conditions\nSometimes, issues with the node hosting the pod can cause
it to fail. You can check the node's conditions using:\n\n\`\`\`bash\nkubectl get nodes\n\`\`\`\n\nIdentify the node on which 
the pod is scheduled and describe it:\n\n\`\`\`bash\nkubectl describe node NODE_NAME\n\`\`\`\n\nLook for any conditions that
might indicate issues, such as \`DiskPressure\`, \`MemoryPressure\`, or \`PIDPressure\`.\n\n### Conclusion\nBy following these 
steps, you should gather enough information to diagnose the issue with the pod that is stuck in \`CrashLoopBackOff\`. The key 
is to look at the pod's events, logs, and resource configurations. Once you have identified the root cause, appropriate
remediation actions can be taken.\n\nIf you discover that the application itself has bugs or misconfigurations 
(e.g., bad environment variables, missing dependencies), you will need to address those issues accordingly.`;


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
      const chunks = testContent.split(' ');
      
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