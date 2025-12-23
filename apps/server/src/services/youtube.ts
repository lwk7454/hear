import { google, youtube_v3 } from 'googleapis';

export class YouTubeService {
  private youtube: youtube_v3.Youtube;

  constructor(accessToken: string, refreshToken?: string) {
    const oauth2Client = new google.auth.OAuth2(
      process.env.YOUTUBE_CLIENT_ID,
      process.env.YOUTUBE_CLIENT_SECRET,
      process.env.YOUTUBE_REDIRECT_URI
    );
    
    oauth2Client.setCredentials({ 
        access_token: accessToken,
        refresh_token: refreshToken || null
    });

    this.youtube = google.youtube({ version: 'v3', auth: oauth2Client });
  }

  /**
   * Get the authenticated user's channel details
   */
  async getChannelDetails(): Promise<{ id: string, title: string }> {
      const res = await this.youtube.channels.list({
          part: ['id', 'snippet'],
          mine: true
      });
      const item = res.data.items?.[0];
      if (!item || !item.id) throw new Error("No channel found for this user");
      return {
          id: item.id,
          title: item.snippet?.title || "Unknown Channel"
      };
  }

  /**
   * Get the ID of the "uploads" playlist
   */
  async getUploadsPlaylistId(): Promise<string | null> {
    const response = await this.youtube.channels.list({
      part: ['contentDetails'],
      mine: true,
    });
    
    return response.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads || null;
  }

  async getPlaylistItems(playlistId: string, maxResults = 10) {
    const response = await this.youtube.playlistItems.list({
      part: ['snippet', 'contentDetails'],
      playlistId,
      maxResults
    });
    return response.data.items || [];
  }

  async getVideoDetails(videoId: string) {
    const response = await this.youtube.videos.list({
      part: ['snippet', 'contentDetails', 'statistics'],
      id: [videoId],
    });
    return response.data.items?.[0];
  }

  /**
   * Fetch top-level comments and their replies.
   */
  async getVideoComments(videoId: string, maxResults = 20) {
      try {
        const response = await this.youtube.commentThreads.list({
            part: ['snippet', 'replies'],
            videoId: videoId,
            maxResults: maxResults,
            order: 'relevance' 
        });
        return response.data.items || [];
      } catch (e) {
          console.warn(`Failed to fetch comments for ${videoId}:`, e);
          return [];
      }
  }

  async getCaptions(videoId: string) {
    // Note: This requires the OAuth scope 'https://www.googleapis.com/auth/youtube.force-ssl'
    try {
        const list = await this.youtube.captions.list({
        part: ['snippet'],
        videoId: videoId,
        });
        return list.data.items;
    } catch (e) {
        return [];
    }
  }
}
