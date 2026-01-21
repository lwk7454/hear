import fs from 'fs';
import axios from 'axios';
import { env } from '../env.js';
import FormData from 'form-data';

export class HiggsService {
  private baseUrl: string;

  constructor() {
    // Default to local python worker if not set
    this.baseUrl = env.HIGGS_API_URL;
    console.log(`[HiggsService] Initialized with baseUrl: ${this.baseUrl}, timeout: ${this.timeout}ms`);
  }

  private get timeout(): number {
    return env.HIGGS_TIMEOUT;
  }


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
        timeout: this.timeout
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
