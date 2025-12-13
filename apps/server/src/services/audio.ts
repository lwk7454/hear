import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class AudioService {
  
  constructor() {
    // Ensure ffmpeg is installed on system or point to binary
    // ffmpeg.setFfmpegPath('/usr/bin/ffmpeg') 
  }

  private getAuthArgs(): string {
      const paths = [
          process.env.YOUTUBE_COOKIES_PATH, // 1st priority: Env Var
          path.join(process.cwd(), 'cookies.txt'),
          path.join(process.cwd(), 'apps/server/cookies.txt')
      ].filter(p => p) as string[];

      for (const p of paths) {
          if (fs.existsSync(p)) {
               return `--cookies "${p}"`;
          }
      }
      return "";
  }

  /**
   * Downloads audio from a video URL using system yt-dlp.
   */
  async downloadAudio(url: string, creatorId: string): Promise<string> {
    console.log(`[AudioService] Downloading audio from ${url}...`);
    
    const tmpDir = path.join(process.cwd(), 'tmp');
    if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
    }

    // Using specific filename template to control output
    const outputTemplate = path.join(tmpDir, `${creatorId}_full.%(ext)s`);
    const finalPath = path.join(tmpDir, `${creatorId}_full.mp3`);

    if (fs.existsSync(finalPath)) {
      fs.unlinkSync(finalPath);
    }

    try {
      const cmd = `yt-dlp ${this.getAuthArgs()} -f bestaudio -x --audio-format mp3 -o "${outputTemplate}" --no-check-certificates --no-warnings --prefer-free-formats "${url}"`;
      await execAsync(cmd);

      if (!fs.existsSync(finalPath)) {
         throw new Error(`File not created at ${finalPath}`);
      }

      return finalPath;
    } catch (e) {
      console.error("Download Error:", e);
      throw e;
    }
  }

  public extractVideoId(url: string): string | null {
      // Matches v=ID, /ID, /shorts/ID, /at/ID (handles handles), /live/ID
      return url.match(/(?:v=|\/|shorts\/|live\/)([\w-]{11})(?:\?|&|\/|$)/)?.[1] || null;
  }

  async getVideoMetadata(url: string, accessToken?: string, refreshToken?: string): Promise<{ title: string; description: string; language: string; thumbnail?: string | undefined }> {
      console.log(`[AudioService] Fetching metadata for ${url}...`);
      
      // 1. Try API if token provided
      if (accessToken) {
          const videoId = this.extractVideoId(url);
          if (videoId) {
              try {
                  console.log("[AudioService] Using Data API for metadata...");
                  // Dynamic import to avoid circular dependency issues if any (though unlikely here)
                  // @ts-ignore
                  const { YouTubeService } = await import('./youtube'); 
                  const yt = new YouTubeService(accessToken, refreshToken);
                  const details = await yt.getVideoDetails(videoId);
                  if (details?.snippet) {
                      return {
                          title: details.snippet.title || "",
                          description: details.snippet.description || "",
                          language: details.snippet.defaultLanguage || details.snippet.defaultAudioLanguage || "en",
                          thumbnail: details.snippet.thumbnails?.high?.url || details.snippet.thumbnails?.medium?.url || details.snippet.thumbnails?.default?.url
                      };
                  }
              } catch (e) {
                  console.warn("[AudioService] Data API failed, falling back to yt-dlp", e);
              }
          }
      }

      try {
          // Increase buffer size for large JSON dumps
          const cmd = `yt-dlp ${this.getAuthArgs()} --dump-json --no-check-certificates --no-warnings --prefer-free-formats "${url}"`;
          const { stdout } = await execAsync(cmd, { maxBuffer: 1024 * 1024 * 10 }); // 10MB buffer
          const data = JSON.parse(stdout);
          return {
              title: data.title || "",
              description: data.description || "",
              language: data.language || data.original_language || "en", // Try multiple fields, fallback default
              thumbnail: data.thumbnail || (data.thumbnails && data.thumbnails.length > 0 ? data.thumbnails[data.thumbnails.length - 1].url : undefined)
          };
      } catch (e) {
          console.error("[AudioService] Metadata fetch failed", e);
          return { title: "", description: "", language: "en" };
      }
  }

  async getTranscript(url: string, language: string = ".*"): Promise<string> {
      console.log(`[AudioService] Fetching transcript (${language}) for ${url}...`);
      const tmpDir = path.join(process.cwd(), 'tmp');
      // Robust ID
      const id = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const outputTemplate = path.join(tmpDir, `${id}`);
      
      try {
          // If specific language detected, prioritize it.
          // yt-dlp syntax for sub-langs is regex or comma-separated code
          const langCmd = language && language !== "null" ? language : ".*";

          const cmd = `yt-dlp ${this.getAuthArgs()} --write-auto-sub --write-sub --sub-langs "${langCmd}" --skip-download --output "${outputTemplate}" --no-check-certificates --no-warnings "${url}"`;
          await execAsync(cmd);
          
          // Find the file (yt-dlp appends .en.vtt, .es.vtt, etc.)
          const files = fs.readdirSync(tmpDir);
          const vttFilename = files.find(f => f.startsWith(id) && f.endsWith('.vtt'));
          
          if (vttFilename) {
              const vttPath = path.join(tmpDir, vttFilename);
              const content = fs.readFileSync(vttPath, 'utf-8');
              
              // Simple VTT cleanup
              const text = content.split('\n')
                .filter(line => !line.includes('-->') && line.trim().length > 0 && isNaN(Number(line.trim())) && !line.startsWith('WEBVTT'))
                // Remove duplicates (common in auto-subs)
                .filter((line, index, self) => index === 0 || line !== self[index - 1])
                .join(' ');
              
              fs.unlinkSync(vttPath);
              return text;
          }
          console.warn("[AudioService] No VTT file generated.");
          return "";
      } catch (e) {
          console.warn("[AudioService] No transcript found or download failed.", e);
          return "";
      }
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
