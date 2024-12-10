import { OpenAIEmbeddings } from "@langchain/openai";
import { MistralAIEmbeddings } from "@langchain/mistralai";
import { OllamaEmbeddings } from "@langchain/ollama";
import { type Embeddings } from "@langchain/core/embeddings";

const globalForEmbeddings = globalThis as unknown as {
  embeddings: Embeddings | undefined;
};

// Default to OpenAI if not specified
const LLM_PROVIDER = (process.env.LLM_PROVIDER || 'openai').toLowerCase();

const createEmbeddings = (): Embeddings => {
  switch (LLM_PROVIDER) {
    case 'openai':
      return new OpenAIEmbeddings({
        openAIApiKey: process.env.OPENAI_API_KEY,
        modelName: "text-embedding-3-large",
        dimensions: 1024
      });

    case 'mistral':
      return new MistralAIEmbeddings({
        apiKey: process.env.MISTRAL_API_KEY,
        model: "mistral-embed",
      });

    case 'ollama':
      return new OllamaEmbeddings({
        model: "mxbai-embed-large",
        baseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
      });

    default:
      throw new Error(`Unsupported LLM provider: ${LLM_PROVIDER}. Available options: openai, mistral, ollama`);
  }
};

export const initEmbeddings = () => {
  if (!globalForEmbeddings.embeddings) {
    globalForEmbeddings.embeddings = createEmbeddings();
  }
  return globalForEmbeddings.embeddings;
};

export const getEmbeddings = () => {
  return initEmbeddings();
};

if (process.env.NODE_ENV !== 'production') {
  globalForEmbeddings.embeddings = initEmbeddings();
}

export default getEmbeddings;