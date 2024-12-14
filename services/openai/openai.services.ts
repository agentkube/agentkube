import { ChatOpenAI } from "@langchain/openai";

export const OpenAIModel = new ChatOpenAI({
  modelName: process.env.OPENAI_MODEL_NAME || "gpt-4o-mini",
  temperature: 0,
  openAIApiKey: process.env.OPENAI_API_KEY,
  maxTokens: 512,
  streaming: false,
});

export const OpenAIstreamingModel = new ChatOpenAI({
  modelName: process.env.OPENAI_MODEL_NAME || "gpt-4o-mini",
  temperature: 0,
  openAIApiKey: process.env.OPENAI_API_KEY,
  maxTokens: 512,
  streaming: true,
});