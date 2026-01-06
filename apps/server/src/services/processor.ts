import { LLMService } from "./llm.js";
import { z } from "zod";

// Structured output schema (simulated via prompting for now, or Structured Output if model supports)
const PersonaSchema = z.object({
  style: z.object({
    tone: z.string(),
    keywords: z.array(z.string()),
  }),
  facts: z.array(z.string()),
  beliefs: z.array(z.string())
});

export class TranscriptProcessor {
  private llm: LLMService;

  constructor() {
    this.llm = new LLMService();
  }

  async process(transcript: string) {
    const SYSTEM_PROMPT = `
      You are an expert Persona Extractor. 
      Your goal is to analyze the provided transcript and extract the speaker's personality, speaking style, and core known facts.
      
      Return JSON in this format:
      {
        "style": { "tone": "...", "keywords": ["..."] },
        "facts": ["..."],
        "beliefs": ["..."]
      }
    `;

    console.log("[Processor] Analyzing transcript with LLM...");
    try {
      const rawJson = await this.llm.analyzeText(SYSTEM_PROMPT, transcript);
      
      // Basic cleanup for markdown json blocks
      const cleaned = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
      
      const parsed = JSON.parse(cleaned);
      return PersonaSchema.parse(parsed); // Validation
    } catch (e) {
      console.error("[Processor] Extraction failed", e);
      // Fallback for demo/dev without keys
      return {
        style: { tone: "Default (LLM Failed)", keywords: [] },
        facts: ["Could not extract facts."],
        beliefs: []
      };
    }
  }
}
