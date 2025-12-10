import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';

export class AudioService {
  
  constructor() {
    // Ensure ffmpeg is installed on system or point to binary
    // ffmpeg.setFfmpegPath('/usr/bin/ffmpeg') 
  }

  /**
   * Simulates downloading audio from a video URL.
   * In reality, we'd use 'ytdl-core' or similar here.
   */
  async downloadAudio(url: string, creatorId: string): Promise<string> {
    console.log(`[AudioService] Downloading audio from ${url}...`);
    // Mock file creation
    const mockPath = path.join(process.cwd(), 'tmp', `${creatorId}_full.mp3`);
    // Ensure tmp exists
    if (!fs.existsSync(path.dirname(mockPath))) {
        fs.mkdirSync(path.dirname(mockPath), { recursive: true });
    }
    await fs.promises.writeFile(mockPath, "mock binary content"); 
    return mockPath;
  }

  /**
   * Extracts a 30s sample for Tier 1 Cloning.
   */
  async extractSample(filePath: string, duration: number = 30): Promise<string> {
    console.log(`[AudioService] Extracting ${duration}s sample...`);
    
    return new Promise((resolve, reject) => {
      const outputPath = filePath.replace('_full.mp3', '_sample.wav');
      
      // Verification: Check if ffmpeg is available
      // For development w/o ffmpeg installed, we mock the success
      resolve(outputPath);

      /* Real Implementation:
      ffmpeg(filePath)
        .setStartTime(30) // Skip intros
        .setDuration(duration)
        .output(outputPath)
        .on('end', () => resolve(outputPath))
        .on('error', (err) => reject(err))
        .run();
      */
    });
  }

  /**
   * extractBestSegment: Finds the longest segment for SPEAKER_00 and extracts it.
   */
  async extractBestSegment(filePath: string, segments: Array<{start: number, end: number, speaker: string}>): Promise<string> {
    console.log(`[AudioService] Filtering ${segments.length} segments for best sample...`);
    
    // Simple logic: Find longest segment for SPEAKER_00
    const best = segments
        .filter(s => s.speaker === "SPEAKER_00")
        .sort((a, b) => (b.end - b.start) - (a.end - a.start))[0];

    if (!best) {
        console.warn("[AudioService] No SPEAKER_00 found, defaulting to start.");
        return this.extractSample(filePath, 30);
    }
    
    console.log(`[AudioService] extracting segment ${best.start}-${best.end}`);
    // Reuse extract logic or mock
    const outputPath = filePath.replace('_vocals.wav', '_best.wav');
    
    // Ensure mock file exists for next step
    if (!fs.existsSync(outputPath)) {
        await fs.promises.writeFile(outputPath, "mock best sample");
    }
    
    // Mock success
    return outputPath;
  }
}
