import 'dotenv/config';
import { AudioService } from '../services/audio.ts';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);

async function main() {
    const url = process.argv[2];
    const format = process.argv[3] || 'mp3';
    if (!url) {
        console.error("Usage: npx tsx src/scripts/download-sample.ts [YouTube URL] [format (mp3|wav)]");
        process.exit(1);
    }

    const audioService = new AudioService();
    const creatorId = "enrollment_temp";

    try {
        console.log(`--- Voice Sample Downloader (${format}) ---`);

        // 1. Get Metadata for language
        const metadata = await audioService.getVideoMetadata(url);
        const lang = metadata.language || 'en';
        console.log(`[Script] Original language detected: ${lang}`);

        // 2. Download full audio
        const fullPath = await audioService.downloadAudio(url, creatorId, format);
        const outputPath = path.join(process.cwd(), `voice_sample.${format}`);

        console.log(`[Script] Trimming first 180s to ${outputPath}...`);

        // 2. Trim using ffmpeg (direct command)
        let trimCmd = `ffmpeg -y -i "${fullPath}" -ss 0 -t 180 `;
        if (format === 'mp3') {
            trimCmd += `-acodec libmp3lame -q:a 2 `;
        } else if (format === 'wav') {
            trimCmd += `-acodec pcm_s16le `;
        }
        trimCmd += `"${outputPath}"`;

        await execAsync(trimCmd);

        // 3. Download and trim transcript
        console.log(`[Script] Fetching and trimming transcript (${lang}) to 180s...`);
        const transcript = await audioService.getTranscript(url, lang, 180);
        const transcriptPath = path.join(process.cwd(), 'voice_sample.txt');
        fs.writeFileSync(transcriptPath, transcript);

        // 4. Cleanup
        if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
        }

        console.log(`SUCCESS: Created voice_sample.${format} and voice_sample.txt`);
        console.log("You can now upload these files in the Creator Dashboard.");

    } catch (err: any) {
        console.error("FAILURE:", err.message);
        if (err.message.includes('Sign in to confirm you’re not a bot')) {
            console.error("\n[IMPORTANT] Bot detection triggered.");
            console.error("Please update apps/server/cookies.txt with fresh cookies from your browser.");
            console.error("You can use the 'Get cookies.txt LOCALLY' extension.");
        }
        process.exit(1);
    }
}

main();
