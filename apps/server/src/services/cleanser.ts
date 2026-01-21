import { exec } from 'child_process';
import { env } from '../env.js';
import util from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = util.promisify(exec);

export class AudioCleanserService {
  private workerUrl: string;

  constructor() {
    this.workerUrl = env.CLEANSER_WORKER_URL; 
  }

  /**
   * Delegates processing to Python GPU Worker.
   * Input: Public URL of raw audio.
   * Output: Public URL of vocals + Diarization segments.
   */
  async process(audioUrl: string, creatorId: string, voiceSampleUrl?: string): Promise<{ vocalsUrl: string, segments: any[] }> {
    console.log(`[AudioCleanser] Calling GPU Worker at ${this.workerUrl} for ${audioUrl}...`);

    try {
        const res = await fetch(`${this.workerUrl}/process`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                audio_url: audioUrl,
                creator_id: creatorId,
                voice_sample_url: voiceSampleUrl
            })
        });

        if (!res.ok) {
            const err = await res.text();
            throw new Error(`Worker Error (${res.status}): ${err}`);
        }

        const data = await res.json();
        // Expecting: { status: "success", artifacts: { vocals: "url", segments: [] } }
        
        return {
            vocalsUrl: data.artifacts.vocals,
            segments: data.artifacts.segments
        };
    } catch (e) {
        console.error("[AudioCleanser] Worker failed. Is the Python Worker running?", e);
        throw e;
    }
  }
}
