import { createClient, SupabaseClient } from '@supabase/supabase-js'
import fs from 'fs'

export class StorageService {
    private supabase: SupabaseClient
    private bucket: string = 'audio'

    constructor() {
        const supabaseUrl = process.env.SUPABASE_URL
        const supabaseKey = process.env.SUPABASE_SERVICE_KEY
        
        if (!supabaseUrl || !supabaseKey) {
            throw new Error("[StorageService] Failed to initialize: Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env")
        }
        
        this.supabase = createClient(supabaseUrl, supabaseKey)
    }

    /**
     * Uploads a file to Supabase Storage
     * @param file Local path (string) OR Buffer OR Stream
     * @param destinationPath Path in the bucket (e.g., 'users/123/golden.wav')
     * @param mimeType Optional mime type (required if file is not a path)
     * @returns Public URL of the uploaded file
     */
    async upload(file: string | Buffer | NodeJS.ReadableStream, destinationPath: string, mimeType?: string): Promise<string> {
        try {
            let fileContent: string | Buffer | NodeJS.ReadableStream = file
            let contentType = mimeType || 'application/octet-stream'

            if (typeof file === 'string') {
                fileContent = fs.readFileSync(file)
                if (!mimeType) {
                    if (file.endsWith('.wav')) contentType = 'audio/wav'
                    else if (file.endsWith('.mp3')) contentType = 'audio/mpeg'
                }
            }

            const { data, error } = await this.supabase
                .storage
                .from(this.bucket)
                .upload(destinationPath, fileContent, {
                    contentType,
                    upsert: true,
                    duplex: 'half' // Required for Node streams
                })

            if (error) {
                console.error("[StorageService] Upload Failed:", error)
                throw error
            }

            // Get Public URL
            const { data: publicData } = this.supabase
                .storage
                .from(this.bucket)
                .getPublicUrl(destinationPath)
            
            console.log(`[StorageService] Uploaded to ${publicData.publicUrl}`)
            return publicData.publicUrl

        } catch (e) {
            console.error("[StorageService] Wrapper Error:", e)
            throw e
        }
    }

    async delete(publicUrl: string): Promise<void> {
        if (!publicUrl) return;
        try {
            // URL format: .../storage/v1/object/public/bucket/path/to/file
            // or just ensure we get the part after bucket name
            const parts = publicUrl.split(`/${this.bucket}/`);
            if (parts.length < 2 || !parts[1]) return;
            
            const path: string = parts[1];

            const { error } = await this.supabase
                .storage
                .from(this.bucket)
                .remove([path]);
                
            if (error) {
                console.warn(`[StorageService] Failed to delete file ${path}:`, error.message || "Unknown Error");
            } else {
                console.log(`[StorageService] Deleted file ${path}`);
            }
        } catch (e) {
            console.warn(`[StorageService] Delete Exception`, e);
        }
    }

    /**
     * Helper to verify bucket exists (Dev only)
     */
    async ensureBucket() {
        const { data, error } = await this.supabase.storage.getBucket(this.bucket)
        if (error) {
            console.log("[StorageService] Creating 'audio' bucket...")
            await this.supabase.storage.createBucket(this.bucket, { public: true })
        }
    }
}

export const storageService = new StorageService()
