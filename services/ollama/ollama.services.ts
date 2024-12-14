import { ChatOllama } from "@langchain/ollama";

export const OllamaModel = new ChatOllama({
  model: "llama3.2",
  temperature: 0,
})
