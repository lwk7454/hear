export class InstagramService {
  private clientId: string;
  private clientSecret: string;
  
  constructor() {
    this.clientId = process.env.IG_CLIENT_ID || 'mock_id';
    this.clientSecret = process.env.IG_CLIENT_SECRET || 'mock_secret';
  }

  /**
   * getPosts: Fetches recent media objects for the connected user.
   * Scope: instagram_basic, instagram_content_publish
   */
  async getPosts(accessToken: string, limit: number = 5) {
    console.log(`[Instagram] Fetching ${limit} posts with token ${accessToken.substring(0, 5)}...`);
    
    // Official Graph API endpoint: https://graph.instagram.com/me/media
    // Fields: id,caption,media_type,media_url,permalink,timestamp
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 600));

    return [
        {
            id: "ig_post_1",
            caption: "Chilling at the coffee shop #coding #life",
            media_type: "IMAGE",
            media_url: "https://mock.instagram/img1.jpg",
            timestamp: new Date().toISOString()
        },
        {
            id: "ig_post_2",
            caption: "New video is up on YouTube! Link in bio.",
            media_type: "CAROUSEL_ALBUM",
            media_url: "https://mock.instagram/img2.jpg",
            timestamp: new Date(Date.now() - 86400000).toISOString()
        }
    ];
  }

  /**
   * getComments: Fetches comments for a specific media object.
   */
  async getComments(accessToken: string, mediaId: string) {
    console.log(`[Instagram] Fetching comments for ${mediaId}...`);
    // Graph API: /{media-id}/comments
    
     await new Promise(resolve => setTimeout(resolve, 400));
     
     return [
         { id: "c1", text: "Love this setup!", username: "fan_1" },
         { id: "c2", text: "What keyboard is that?", username: "fan_2" }
     ];
  }
}
