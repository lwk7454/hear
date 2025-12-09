import { google } from 'googleapis';

const oauth2Client = new google.auth.OAuth2(
  process.env.YOUTUBE_CLIENT_ID,
  process.env.YOUTUBE_CLIENT_SECRET,
  process.env.YOUTUBE_REDIRECT_URI
);

export class YouTubeService {
  private youtube;

  constructor(accessToken: string) {
    oauth2Client.setCredentials({ access_token: accessToken });
    this.youtube = google.youtube({ version: 'v3', auth: oauth2Client });
  }

  async getVideoDetails(videoId: string) {
    const response = await this.youtube.videos.list({
      part: ['snippet', 'contentDetails'],
      id: [videoId],
    });
    return response.data.items?.[0];
  }

  async getCaptions(videoId: string) {
    // Note: This requires the OAuth scope 'https://www.googleapis.com/auth/youtube.force-ssl'
    const list = await this.youtube.captions.list({
      part: ['snippet'],
      videoId: videoId,
    });
    
    // For MVP, if no manual captions, we might fail or fallback.
    // Official API strictly controls caption downloading (tfmt=vtt).
    // This is a placeholder for the authenticated download flow.
    return list.data.items;
  }
}
