import { ChatOpenAI } from "@langchain/openai";

export class LLMService {
  private model: ChatOpenAI;

  constructor() {
    // defaults to OpenAI but allows overriding for DeepSeek/Qwen
    // usage: OPENAI_BASE_URL=https://api.deepseek.com/v1 OPENAI_API_KEY=sk-ds...
    this.model = new ChatOpenAI({
      modelName: process.env.LLM_MODEL || "gpt-4o",
      temperature: 0.7,
      configuration: {
        baseURL: process.env.OPENAI_BASE_URL, 
      }
    });
  }

  async analyzeText(systemPrompt: string, userText: string): Promise<string> {
    const response = await this.model.invoke([
      { role: "system", content: systemPrompt },
      { role: "user", content: userText }
    ]);
    
    // Handle complex response types (e.g. function calls in future)
    if (typeof response.content === 'string') {
        return response.content;
    }
    return JSON.stringify(response.content);
  }
}
