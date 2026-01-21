import { env } from '../env.js';
export class InstagramService {
  private clientId: string;
  private clientSecret: string;
  
  constructor() {
    this.clientId = env.IG_CLIENT_ID || '';
    this.clientSecret = env.IG_CLIENT_SECRET || '';
  }

  /**
   * getPosts: Fetches recent media objects for the connected user.
   * Scope: instagram_basic, instagram_content_publish
   */
  async getPosts(accessToken: string, limit: number = 5) {
    if (!accessToken || accessToken === 'mock_token') {
         // TODO: Remove this check once fully live, but for now prevent real calls with bad tokens
         throw new Error("Invalid access token for Instagram.");
    }

    console.log(`[Instagram] Fetching ${limit} posts...`);
    
    // Official Graph API endpoint: https://graph.instagram.com/me/media
    const fields = "id,caption,media_type,media_url,permalink,timestamp";
    const url = `https://graph.instagram.com/me/media?fields=${fields}&access_token=${accessToken}&limit=${limit}`;
    
    const res = await fetch(url);
    if (!res.ok) {
        const error = await res.json();
        throw new Error(`Instagram API Error: ${error.error?.message || res.statusText}`);
    }
    
    const data = await res.json();
    return data.data || [];
  }

  /**
   * getComments: Fetches comments for a specific media object.
   */
  async getComments(accessToken: string, mediaId: string) {
    console.log(`[Instagram] Fetching comments for ${mediaId}...`);
    // Graph API: /{media-id}/comments
    
    const url = `https://graph.instagram.com/${mediaId}/comments?fields=id,text,username&access_token=${accessToken}`;
    const res = await fetch(url);
    
    if (!res.ok) {
        const error = await res.json() as any;
        throw new Error(`Instagram API Error: ${error.error?.message || res.statusText}`);
    }

    const data = await res.json() as any;
    return data.data || [];
  }

  async getUsername(accessToken: string): Promise<string> {
    const url = `https://graph.instagram.com/me?fields=username&access_token=${accessToken}`;
    const res = await fetch(url);
    if (!res.ok) {
        const error = await res.json() as any;
        throw new Error(`Instagram API Error: ${error.error?.message || res.statusText}`);
    }
    const data = await res.json() as any;
    return data.username || "Unknown Instagram User";
  }
}
