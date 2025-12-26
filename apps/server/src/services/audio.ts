import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const execAsync = promisify(exec);
// ESM __filename and __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class AudioService {

  constructor() {
    // Ensure ffmpeg is installed on system or point to binary
    // ffmpeg.setFfmpegPath('/usr/bin/ffmpeg') 
  }

  private getAuthArgs(): string {
    // Priority 1: Direct browser injection (best for local dev)
    if (process.env.YOUTUBE_COOKIES_FROM_BROWSER) {
      return `--cookies-from-browser ${process.env.YOUTUBE_COOKIES_FROM_BROWSER}`;
    }

    const serverRoot = path.resolve(__dirname, '../../');
    const paths = [
      process.env.YOUTUBE_COOKIES_PATH
        ? (path.isAbsolute(process.env.YOUTUBE_COOKIES_PATH)
          ? process.env.YOUTUBE_COOKIES_PATH
          : path.join(serverRoot, process.env.YOUTUBE_COOKIES_PATH))
        : null,
      path.join(serverRoot, 'cookies.txt'),
      path.join(process.cwd(), 'cookies.txt')
    ].filter(Boolean) as string[];

    for (const p of paths) {
      if (fs.existsSync(p)) {
        console.log(`[AudioService] Using cookies from: ${p}`);
        return `--cookies "${p}"`;
      }
    }
    return "";
  }

  /**
   * Downloads audio from a video URL using system yt-dlp.
   */
  async downloadAudio(url: string, creatorId: string, format: string = 'mp3', maxDuration?: number): Promise<string> {
    console.log(`[AudioService] Downloading audio from ${url}...`);

    const serverRoot = path.resolve(__dirname, '../../');
    const tmpDir = path.join(serverRoot, 'tmp');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    // Using specific filename template to control output
    const outputTemplate = path.join(tmpDir, `${creatorId}_full.%(ext)s`);
    const finalPath = path.join(tmpDir, `${creatorId}_full.${format}`);

    if (fs.existsSync(finalPath)) {
      fs.unlinkSync(finalPath);
    }

    try {
      // Simplify flags. Forcing specific clients often breaks format selection.
      // We keep user-agent and referer as they are generally safe/helpful.
      const robustFlags = `--user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" --referer "https://www.youtube.com/"`;

      let sectionsArg = "";
      if (maxDuration) {
        sectionsArg = `--download-sections "*0-${maxDuration}"`;
      }

      const cmd = `python -m yt_dlp ${this.getAuthArgs()} ${robustFlags} ${sectionsArg} -f "bestaudio/best" -x --audio-format ${format} -o "${outputTemplate}" --no-check-certificates --no-warnings "${url}"`;
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
          // @ts-ignore
          const { YouTubeService } = await import('./youtube');
          const yt = new YouTubeService(accessToken, refreshToken);
          const details = await yt.getVideoDetails(videoId);
          if (details?.snippet) {
            return {
              title: details.snippet.title || "",
              description: details.snippet.description || "",
              language: details.snippet.defaultLanguage || details.snippet.defaultAudioLanguage || "en",
              thumbnail: details.snippet.thumbnails?.high?.url || details.snippet.thumbnails?.medium?.url || details.snippet.thumbnails?.default?.url || undefined
            };
          }
        } catch (e) {
          console.warn("[AudioService] Data API failed, falling back to yt-dlp", e);
        }
      }
    }

    try {
      const robustFlags = `--user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" --referer "https://www.youtube.com/"`;
      const cmd = `python -m yt_dlp ${this.getAuthArgs()} ${robustFlags} --dump-json --no-check-certificates --no-warnings "${url}"`;
      const { stdout } = await execAsync(cmd, { maxBuffer: 1024 * 1024 * 10 });
      const data = JSON.parse(stdout);
      return {
        title: data.title || "",
        description: data.description || "",
        language: data.language || data.original_language || "en",
        thumbnail: data.thumbnail || (data.thumbnails && data.thumbnails.length > 0 ? data.thumbnails[data.thumbnails.length - 1].url : undefined)
      };
    } catch (e) {
      console.error("[AudioService] Metadata fetch failed", e);
      return { title: "", description: "", language: "en" };
    }
  }

  async getTranscript(url: string, language: string = ".*", maxDuration?: number): Promise<string> {
    console.log(`[AudioService] Fetching transcript (${language}) for ${url}...`);
    const tmpDir = path.join(process.cwd(), 'tmp');
    const id = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const outputTemplate = path.join(tmpDir, `${id}`);

    try {
      const langCmd = language && language !== "null" ? language : ".*";
      // Use --write-auto-sub and --sub-format vtt
      const cmd = `python -m yt_dlp ${this.getAuthArgs()} --write-auto-sub --no-write-subs --sub-langs "${langCmd}" --sub-format vtt --skip-download --output "${outputTemplate}" --no-check-certificates --no-warnings "${url}"`;
      await execAsync(cmd);

      const files = fs.readdirSync(tmpDir);
      const vttFilename = files.find(f => f.startsWith(id) && f.endsWith('.vtt'));

      if (vttFilename) {
        const vttPath = path.join(tmpDir, vttFilename);
        const content = fs.readFileSync(vttPath, 'utf-8');

        const lines = content.split('\n');
        let resultLines: string[] = [];
        let currentTime = 0;
        let isWithinDuration = true;

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]?.trim();
          if (!line) continue;

          const timestampMatch = line.match(/(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})/);
          if (timestampMatch && timestampMatch[1] && timestampMatch[2]) {
            const startTimeStr = timestampMatch[1];
            const parts = startTimeStr.split(':').map(parseFloat);
            if (parts.length === 3) {
              const hh = parts[0];
              const mm = parts[1];
              const ss = parts[2];
              if (hh !== undefined && mm !== undefined && ss !== undefined) {
                currentTime = hh * 3600 + mm * 60 + ss;
                if (maxDuration !== undefined && currentTime >= maxDuration) {
                  isWithinDuration = false;
                  break;
                }
              }
            }
            continue;
          }

          if (isWithinDuration && line.length > 0 && !line.startsWith('WEBVTT') && !line.startsWith('Kind:') && !line.startsWith('Language:') && isNaN(Number(line))) {
            const cleanLine = line.replace(/<[^>]+>/g, '').trim();
            if (cleanLine.length > 0) {
              // Deduplicate lines that are prefixes of each other (common in auto-subs)
              const lastLine = resultLines[resultLines.length - 1];
              if (lastLine !== undefined && cleanLine.startsWith(lastLine)) {
                resultLines[resultLines.length - 1] = cleanLine;
              } else if (resultLines.length === 0 || lastLine !== cleanLine) {
                resultLines.push(cleanLine);
              }
            }
          }
        }

        fs.unlinkSync(vttPath);
        return resultLines.join(' ');
      }
      console.warn("[AudioService] No VTT file generated.");
      return "";
    } catch (e) {
      console.warn("[AudioService] No transcript found or download failed.", e);
      return "";
    }
  }

  /**
   * Downloads audio and extracts transcript for a YouTube URL.
   */
  async downloadAndExtractTranscript(url: string, creatorId: string): Promise<{ audioPath: string, transcript: string }> {
    // 1. Get Metadata to find language
    const metadata = await this.getVideoMetadata(url);
    const lang = metadata.language || "en";
    console.log(`[AudioService] Detected language: ${lang}`);

    // 2. Download Audio (First 3 minutes as a sample)
    // We use a shorter sample for enrollment to keep it fast
    const audioPath = await this.downloadAudio(url, creatorId, 'wav', 180);

    // 3. Get Transcript (Auto-generated in original language)
    const transcript = await this.getTranscript(url, lang, 180); // Limit to 3 minutes to match audio

    return { audioPath, transcript };
  }

  async extractSample(filePath: string, duration: number = 30): Promise<string> {
    console.log(`[AudioService] Extracting ${duration}s sample...`);
    return new Promise((resolve) => {
      const outputPath = filePath.replace('_full.mp3', '_sample.wav');
      resolve(outputPath);
    });
  }

  async extractBestSegment(filePath: string, segments: Array<{ start: number, end: number, speaker: string }>): Promise<string> {
    console.log(`[AudioService] Filtering ${segments.length} segments for best sample...`);
    const best = segments
      .filter(s => s.speaker === "SPEAKER_00")
      .sort((a, b) => (b.end - b.start) - (a.end - a.start))[0];

    if (!best) {
      console.warn("[AudioService] No SPEAKER_00 found, defaulting to start.");
      return this.extractSample(filePath, 30);
    }

    const outputPath = filePath.replace('_vocals.wav', '_best.wav');
    if (!fs.existsSync(outputPath)) {
      await fs.promises.writeFile(outputPath, "mock best sample");
    }
    return outputPath;
  }
}
