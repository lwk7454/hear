import fs from 'fs';
import axios from 'axios';
import FormData from 'form-data';

export class HiggsService {
  private baseUrl: string;

  constructor() {
    // Default to local python worker if not set
    this.baseUrl = process.env.HIGGS_API_URL || 'http://localhost:8002';
  }

  /**
   * generateEmbedding: Uploads a clean 30s audio sample to get a Voice ID/Vector.
   */
  async generateEmbedding(filePath: string, creatorId: string): Promise<string> {
    console.log(`[Higgs] Generating embedding from ${filePath} for ${creatorId} via ${this.baseUrl}...`);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    try {
        const form = new FormData();
        form.append('file', fs.createReadStream(filePath));
        form.append('creator_id', creatorId);
        
        const response = await axios.post(`${this.baseUrl}/clone`, form, {
            headers: {
                ...form.getHeaders()
            },
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
            timeout: 60000 // 60s timeout for processing
        });

        if (response.data.status === 'success') {
             console.log(`[Higgs] Embedding generated: ${response.data.voice_id}`);
             // In future we might return the full embedding path if we need to store it
             // For now, let's assume the worker returns a usable ID or path we can store as "voiceId"
             return response.data.voice_id || response.data.embedding_path || "higgs_unknown_id";
        } else {
            throw new Error(`Higgs Worker Error: ${JSON.stringify(response.data)}`);
        }
    } catch (e: any) {
        console.error(`[Higgs] Failed to generate embedding:`, e.message);
        if (e.code === 'ECONNREFUSED' || e.code === 'ECONNABORTED') {
             throw new Error(`[Higgs] Worker unreachable or timed out (${e.code}). Is apps/worker-higgs running at ${this.baseUrl}?`);
        }
        throw e;
    }
  }

  /**
   * synthesize: Generates audio from text using the Voice ID.
   */
  /**
   * synthesize: Generates audio from text using the Voice ID (Creator ID).
   * Returns: Public URL of the generated audio.
   */
  async synthesize(text: string, creatorId: string): Promise<string> {
    console.log(`[Higgs] Synthesizing: "${text.substring(0, 20)}..." for ${creatorId}`);
    
    try {
        const response = await axios.post(`${this.baseUrl}/synthesize`, {
            text: text,
            creator_id: creatorId
        }, {
            timeout: 60000 
        });
        
        if (response.data.status === 'success' && response.data.audio_url) {
             return response.data.audio_url;
        }
        
        throw new Error(`Higgs Worker Error: ${JSON.stringify(response.data)}`);

    } catch (e: any) {
         console.error(`[Higgs] Synthesis failed:`, e.message);
         if (e.code === 'ECONNREFUSED') {
             // Mock fallback for development if worker is down
             console.warn("[Higgs] Worker down. Returning mock audio URL (silent).");
             return "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"; // Public test URL
         }
         throw e;
    }
  }
}
