export interface AIService {
  generateSummary(content: string): Promise<string>;
}

export class OpenAIService implements AIService {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generateSummary(content: string): Promise<string> {
    // feed all content to ai
    return `AI-generated summary for: ${content.substring(0, 50)}...`;
  }
}

export const aiService = new OpenAIService(process.env.NEXT_PUBLIC_OPENAI_API_KEY!);
