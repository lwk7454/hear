import 'dotenv/config';
import { AudioService } from '../services/audio.ts';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);

async function main() {
    const url = process.argv[2];
    if (!url) {
        console.error("Usage: npx tsx src/scripts/download-sample.ts [YouTube URL]");
        process.exit(1);
    }

    const audioService = new AudioService();
    const creatorId = "enrollment_temp";
    
    try {
        console.log("--- Voice Sample Downloader ---");
        // 1. Download full audio
        const fullPath = await audioService.downloadAudio(url, creatorId);
        const outputPath = path.join(process.cwd(), 'voice_sample.mp3');

        console.log(`[Script] Trimming first 120s to ${outputPath}...`);

        // 2. Trim using ffmpeg (direct command)
        // -y to overwrite, -ss 0 start, -t 120 duration, -c:a libmp3lame (ensure mp3)
        const trimCmd = `ffmpeg -y -i "${fullPath}" -ss 0 -t 120 -acodec libmp3lame -q:a 2 "${outputPath}"`;
        await execAsync(trimCmd);

        // 3. Cleanup
        if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
        }

        console.log("SUCCESS: Created voice_sample.mp3");
        console.log("You can now upload this file in the Creator Dashboard.");

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
