import { ChatOpenAI } from "@langchain/openai";
import { prisma } from "../lib/db";
import { z } from "zod";

const FactExtractionSchema = z.object({
  facts: z.array(z.string()).describe("A list of atomic, independent facts about the creator.")
});

export class FactHistorian {
  private model: ChatOpenAI;

  constructor() {
    this.model = new ChatOpenAI({
      modelName: process.env.LLM_MODEL || "gpt-4o",
      temperature: 0,
      configuration: {
        baseURL: process.env.OPENAI_BASE_URL,
      }
    });
  }

  /**
   * Extracts atomic facts from raw text.
   */
  async distillFacts(text: string): Promise<string[]> {
    const prompt = `Extract atomic, independent facts about the creator from the following text. 
Atomic means each fact should be a single, standalone statement.
Text: "${text}"
Return as a JSON array of strings.`;

    try {
      const response = await this.model.withStructuredOutput(FactExtractionSchema).invoke([
        { role: "system", content: "You are a professional historian extracting facts for a digital twin." },
        { role: "user", content: prompt }
      ]);

      return response.facts;
    } catch (error) {
      console.error("[Historian Distill Error]", error);
      return [];
    }
  }

  /**
   * Consolidates new facts into the profile, avoiding duplicates and respecting overrides.
   */
  async consolidateFacts(creatorId: string, newFacts: string[], sourceMetadata: any) {
    const profile = await prisma.personaProfile.findUnique({
      where: { creatorId },
      include: { facts: true }
    });

    if (!profile) return;

    for (const factContent of newFacts) {
      // 1. Duplicate Detection (Basic string match for now, could use embeddings later)
      const isDuplicate = (profile.facts as any[]).some((f: any) => 
        f.content.toLowerCase().trim() === factContent.toLowerCase().trim()
      );

      if (isDuplicate) continue;

      // 2. Conflict Check with EDITED or MANUAL facts
      // For now, if it's new, we just add it as ALLOWED
      // In a more advanced version, we'd use an LLM to check if it contradicts an EDITED fact.
      
      await prisma.personaFact.create({
        data: {
          profileId: profile.id,
          content: factContent,
          status: "ALLOWED",
          isManual: false,
          sourceMetadata
        }
      });
    }
  }
}
