import { ChatOpenAI } from "@langchain/openai";
import { env as appEnv } from '../env.js';
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { prisma } from "../lib/db.js";
import { pipeline, env } from '@xenova/transformers';

// Configure Transformers.js environment for stability in Node.js
// This fixes the "ERR_WORKER_PATH" and "DefaultLogger" errors in dev environments like tsx/nodemon
// @ts-ignore
env.backends.onnx.wasm.proxy = false;
// @ts-ignore
env.backends.onnx.wasm.numThreads = 1;
// @ts-ignore
env.backends.onnx.wasm.simd = false;

// Silence the noisy ONNX initialization error that happens in some Node.js versions
// @ts-ignore
env.backends.onnx.logLevel = 'error';

env.allowLocalModels = false; // Allow downloading from hub if local cache is missing

// Local embedding service using Transformers.js
class LocalEmbeddings {
    private static pipe: any = null;
    private modelName = 'Xenova/all-MiniLM-L6-v2';

    private async getPipe() {
        if (!LocalEmbeddings.pipe) {
            console.log(`[RAG] Loading local embedding model: ${this.modelName}...`);
            // We use the quantized version by default for speed/memory efficiency
            LocalEmbeddings.pipe = await pipeline('feature-extraction', this.modelName);
            console.log(`[RAG] Model loaded successfully.`);
        }
        return LocalEmbeddings.pipe;
    }

    async embedQuery(text: string): Promise<number[]> {
        const pipe = await this.getPipe();
        const output = await pipe(text, { pooling: 'mean', normalize: true });
        return Array.from(output.data);
    }
}

export class RAGService {
  private embeddings: LocalEmbeddings;
  private significanceModel: ChatOpenAI;
  private textSplitter: RecursiveCharacterTextSplitter;

  constructor() {
    this.embeddings = new LocalEmbeddings();

    this.significanceModel = new ChatOpenAI({
      modelName: appEnv.LLM_MODEL,
      temperature: 0,
      configuration: {
        baseURL: appEnv.OPENAI_BASE_URL,
        apiKey: appEnv.OPENAI_API_KEY,
      }
    });

    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 500,
      chunkOverlap: 100,
    });
  }

  /**
   * Evaluates how significant a memory chunk is (1-10).
   */
  private async evaluateSignificance(text: string): Promise<number> {
    const prompt = `On a scale of 1-10, how significant or life-changing is this information? 
Examples: "I had a coffee" = 1. "I got married" = 10. "I hate brown switches" = 4.
Content: "${text}"
Only return the number.`;

    try {
      const response = await this.significanceModel.invoke([{ role: "user", content: prompt }]);
      const score = parseInt(String(response.content).trim());
      return isNaN(score) ? 3 : Math.min(10, Math.max(1, score));
    } catch {
      return 3;
    }
  }

  /**
   * Chunks text and stores it in the database with embeddings and importance scores.
   */
  async ingestContent(contentItemId: string, text: string) {
    console.log(`[RAG] Ingesting content for Item: ${contentItemId}`);
    
    // 1. Chunk the text
    const docs = await this.textSplitter.splitText(text);
    
    // 2. Generate embeddings and store
    for (const chunk of docs) {
      let embedding: number[];
      try {
        embedding = await this.embeddings.embedQuery(chunk);
      } catch (err) {
        console.error(`[RAG Error] Embedding failed for chunk: "${chunk.slice(0, 50)}..."`, err);
        continue; // Skip this chunk if embedding fails
      }
      const importance = await this.evaluateSignificance(chunk);
      
      await prisma.$executeRaw`
        INSERT INTO "MemoryChunk" ("id", "contentItemId", "content", "embedding", "importance")
        VALUES (gen_random_uuid(), ${contentItemId}, ${chunk}, ${embedding}::vector, ${importance})
      `;
    }
    
    console.log(`[RAG] Completed ingestion: ${docs.length} chunks created.`);
  }

  /**
   * Retrieves relevant chunks for a given query, filtered by creatorId.
   * Implements RIR (Recency-Importance-Relevance) weighting.
   */
  async retrieve(creatorId: string, query: string, limit: number = 5) {
    console.log(`[RAG] Retrieving context for query: "${query}" (Creator: ${creatorId})`);
    
    let queryEmbedding: number[];
    try {
      queryEmbedding = await this.embeddings.embedQuery(query);
    } catch (err) {
      console.error(`[RAG Error] Retrieval embedding failed:`, err);
      return []; // Return no context if embedding fails, but don't crash the chat
    }
    
    // RIR Scoring: Significance * Similarity / log(Age)
    // We use COALESCE and NULLIF to avoid division by zero
    // 1 - (distance) = similarity
    const results = await prisma.$queryRaw<any[]>`
      SELECT 
        mc.content,
        mc."contentItemId",
        ci.platform,
        ci."imagePath",
        mc.importance,
        mc."createdAt",
        (1 - (mc.embedding <=> ${queryEmbedding}::vector)) as similarity,
        (
          mc.importance * 
          POWER((1 - (mc.embedding <=> ${queryEmbedding}::vector)), 2) / 
          LN(EXTRACT(EPOCH FROM (now() - mc."createdAt")) / 86400 + 2)
        ) as rir_score
      FROM "MemoryChunk" mc
      JOIN "ContentItem" ci ON mc."contentItemId" = ci.id
      WHERE ci."creatorId" = ${creatorId}
      ORDER BY rir_score DESC
      LIMIT ${limit}
    `;

    return results;
  }
}
