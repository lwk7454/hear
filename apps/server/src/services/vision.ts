import { ChatOpenAI } from "@langchain/openai";
import { env } from '../env.js';
import { HumanMessage } from "@langchain/core/messages";

export class VisionService {
  private model: ChatOpenAI;

  constructor() {
    this.model = new ChatOpenAI({
      modelName: env.VISION_MODEL,
      temperature: 0.2, // Lower temperature for more factual descriptions
      configuration: {
        baseURL: env.OPENAI_BASE_URL,
        apiKey: env.OPENAI_API_KEY,
      }
    });
  }

  /**
   * Generates a detailed description of an image from a URL.
   */
  async describeImage(imageUrl: string, creatorName?: string): Promise<string> {
    console.log(`[Vision] Describing image: ${imageUrl}`);
    
    const prompt = `Analyze this image from ${creatorName || 'a creator'}'s Instagram. Provide a detailed description including:
1. Context: Location, event, or activity (e.g., 'At a tech meetup in Austin').
2. Key Objects: Items of interest (e.g., 'Holding a custom 65% mechanical keyboard with purple switches').
3. Vibe: Lighting, mood, and fashion (e.g., 'Casual outfit, neon indoor lighting, looking excited').
4. Self-Reference: Describe it as if the person in the photo is the one speaking (e.g., 'I am standing near...').

The goal is to create a 'memory' that the Digital Twin can use to answer questions or share the photo when relevant.`;

    try {
      const response = await this.model.invoke([
        new HumanMessage({
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: { url: imageUrl },
            },
          ],
        }),
      ]);

      if (typeof response.content === 'string') {
        return response.content;
      }
      return JSON.stringify(response.content);
    } catch (error) {
      console.error("[Vision Error]", error);
      throw new Error(`Failed to describe image: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
