import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = util.promisify(exec);

export class AudioCleaner {
  private workerUrl: string;

  constructor() {
    // Default to a separate port if running locally (e.g. 8000 is server, 8001 is worker?)
    // But my main.py set port 8000. Server is 8000.
    // I should change Worker Port in main.py or here.
    // Let's assume Worker acts on 8001 or separate IP.
    // User said "Windows IP".
    this.workerUrl = process.env.WORKER_URL || 'http://127.0.0.1:8001'; 
  }

  /**
   * Delegates processing to Python GPU Worker.
   * Input: Public URL of raw audio.
   * Output: Public URL of vocals + Diarization segments.
   */
  async process(audioUrl: string, creatorId: string, voiceSampleUrl?: string): Promise<{ vocalsUrl: string, segments: any[] }> {
    console.log(`[AudioCleaner] Calling GPU Worker at ${this.workerUrl} for ${audioUrl}...`);

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
        console.error("[AudioCleaner] Worker failed. Is the Python Worker running?", e);
        throw e;
    }
  }
}
