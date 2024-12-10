import { QdrantVectorStore } from "@langchain/qdrant";
import type { Embeddings } from "@langchain/core/embeddings";

const globalForQdrant = globalThis as unknown as {
  vectorStore: QdrantVectorStore | undefined;
};

const url = process.env.QDRANT_URL || 'http://localhost:6333';
const collectionName = process.env.QDRANT_COLLECTION || 'agentkube-collection';

// Initialize Qdrant with provided embeddings
export const initQdrant = async (embeddings: Embeddings) => {
  if (!globalForQdrant.vectorStore) {
    try {
      globalForQdrant.vectorStore = await QdrantVectorStore.fromExistingCollection(
        embeddings,
        {
          url,
          collectionName,
        }
      );
    } catch (error) {
      console.error('Failed to connect to existing collection, creating new one:', error);
      globalForQdrant.vectorStore = new QdrantVectorStore(embeddings, {
        url,
        collectionName,
      });
    }
  }
  return globalForQdrant.vectorStore;
};

// Get the vector store instance
export const getVectorStore = async (embeddings: Embeddings) => {
  return await initQdrant(embeddings);
};

if (process.env.NODE_ENV !== 'production') {
  // Don't initialize in development until embeddings are provided
  globalForQdrant.vectorStore = undefined;
}

export default getVectorStore;