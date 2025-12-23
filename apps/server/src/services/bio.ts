import { ChatOpenAI } from "@langchain/openai";

export class BioService {
  private model: ChatOpenAI;

  constructor() {
    const isPerplexityCustom = !!process.env.PERPLEXITY_API_KEY;
    const baseURL = isPerplexityCustom ? "https://api.perplexity.ai" : (process.env.OPENAI_BASE_URL || "https://openrouter.ai/api/v1");
    const apiKey = isPerplexityCustom ? process.env.PERPLEXITY_API_KEY : process.env.OPENAI_API_KEY;
    
    // If using OpenRouter, we need the "perplexity/" prefix for the model
    let modelName = process.env.PERPLEXITY_MODEL || "sonar";
    if (!isPerplexityCustom && !modelName.startsWith("perplexity/")) {
      modelName = `perplexity/${modelName}`;
    }

    this.model = new ChatOpenAI({
      modelName,
      configuration: {
        baseURL,
        apiKey,
      }
    });
  }

  /**
   * Performs deep research on a creator and generates a background story.
   */
  async researchCreator(creatorName: string, category: string): Promise<string> {
    console.log(`[Bio] Researching creator: ${creatorName} (${category})`);
    
    const prompt = `Perform extensive research on the creator "${creatorName}" in the context of "${category}". 
Synthesize everything you find into a highly detailed "Background Story" for their digital twin. 

Include:
1. Early career and origins.
2. Major milestones and career achievements.
3. Signature content style, themes, and catchphrases.
4. Philosophical views onto their field or life in general.
5. Known personal anecdotes or trivia.

The tone should be factual yet evocative, suitable for grounding an AI persona.`;

    try {
      const response = await this.model.invoke([
        { role: "user", content: prompt }
      ]);

      if (typeof response.content === 'string') {
        return response.content;
      }
      return JSON.stringify(response.content);
    } catch (error) {
      console.error("[Bio Research Error]", error);
      throw new Error(`Failed to research creator: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
