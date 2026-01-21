import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import { prisma } from '../lib/db.js';
import { storageService } from './storage.js';
import { env } from '../env.js';

interface CleanserSegment {
  start: number;
  end: number;
  speaker: string;
  emotion?: string;
  confidence?: number;
}



export class RefAudioGenerator {

  /**
   * Process segments from Cleanser:
   * 1. Filter for main speaker (longest total duration)
   * 2. Cut audio clips based on segments
   * 3. Insert into DB (RefAudioClip)
   * 4. Regenerate index.json and upload
   */
  async processSegments(
    vocalsPath: string, 
    segments: CleanserSegment[], 
    creatorId: string,
    baseTranscript: string
  ): Promise<void> {
    console.log(`[RefAudio] Processing ${segments.length} segments for ${creatorId}`);

    if (!segments || segments.length === 0) return;

    // 1. Identify Target Speaker (Max Duration)
    const speakerDurations: Record<string, number> = {};
    for (const s of segments) {
      const dur = s.end - s.start;
      speakerDurations[s.speaker] = (speakerDurations[s.speaker] || 0) + dur;
    }
    
    let targetSpeaker = "";
    let maxDur = 0;
    for (const [spk, dur] of Object.entries(speakerDurations)) {
      if (dur > maxDur) {
        maxDur = dur;
        targetSpeaker = spk;
      }
    }
    console.log(`[RefAudio] Target Speaker: ${targetSpeaker} (${maxDur.toFixed(1)}s)`);

    // 2. Filter & Cut
    const validSegments = segments.filter(s => s.speaker === targetSpeaker && (s.end - s.start) > 2.0); // Min 2s
    
    // Ensure temp dir
    const tempDir = path.dirname(vocalsPath);
    
    for (const [i, seg] of validSegments.entries()) {
      const emotion = seg.emotion || "neutral";
      const confidence = seg.confidence || 1.0;
      
      // Filename: {timestamp}_{emotion}_{i}.wav
      const ts = Date.now();
      const fileName = `${ts}_${emotion}_${i}.wav`;
      const localClipPath = path.join(tempDir, fileName);
      
      try {
        await this.cutSegment(vocalsPath, seg.start, seg.end, localClipPath);
        
        // Upload to Storage: ref_audio/{creatorId}/{fileName}
        const storagePath = `${creatorId}/${fileName}`;
        await storageService.uploadToBucket('ref_audio', storagePath, localClipPath);
        
        // Placeholder transcript until we implement forced alignment
        const segTranscript = `[${emotion}] speech segment`; 

        const clip = await prisma.refAudioClip.create({
          data: {
            creatorId,
            url: storagePath, // We store relative path or full URL? Worker uses path within bucket.
            path: storagePath,
            transcript: segTranscript,
            emotion: emotion,
            tags: [emotion],
            duration: seg.end - seg.start,
            confidence: confidence
          }
        });
        
        // Cleanup local
        fs.unlinkSync(localClipPath);
        
      } catch (e) {
        console.error(`[RefAudio] Failed to cut/upload segment ${i}:`, e);
      }
    }
    
    // 4. Index is now dynamically queried by Worker from DB. No need to rebuild index.json.
  }

  async cutSegment(inputFile: string, start: number, end: number, outputFile: string): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputFile)
        .setStartTime(start)
        .setDuration(end - start)
        .output(outputFile)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });
  }
}
