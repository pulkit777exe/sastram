export interface AIService {
  generateSummary(content: string): Promise<string>;
}

export class GeminiService implements AIService {
  private apiKey: string;
  private model: any;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    // Will be initialized when @google/generative-ai is installed
  }

  async generateSummary(content: string): Promise<string> {
    try {
      // Dynamic import to handle case where package isn't installed yet
      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      const genAI = new GoogleGenerativeAI(this.apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-pro" });

      const prompt = `Summarize the following discussion thread conversation. Focus on key points, decisions made, and important information. Keep it concise but comprehensive (200-300 words):

${content}

Summary:`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (error) {
      console.error("Gemini API error:", error);
      throw new Error("Failed to generate summary with Gemini");
    }
  }
}

export class OpenAIService implements AIService {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generateSummary(content: string): Promise<string> {
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content:
                "You are a helpful assistant that summarizes discussion threads. Focus on key points, decisions made, and important information. Keep summaries concise but comprehensive (200-300 words).",
            },
            {
              role: "user",
              content: `Summarize the following discussion thread:\n\n${content}`,
            },
          ],
          max_tokens: 500,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`);
      }

      const data = await response.json();
      return data.choices[0]?.message?.content || "Summary generation failed";
    } catch (error) {
      console.error("OpenAI API error:", error);
      throw new Error("Failed to generate summary with OpenAI");
    }
  }
}

class AIServiceFactory {
  static createService(provider: "gemini" | "openai", apiKey: string): AIService {
    if (provider === "gemini") {
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY is required for Gemini provider");
      }
      return new GeminiService(apiKey);
    } else if (provider === "openai") {
      if (!apiKey) {
        throw new Error("NEXT_PUBLIC_OPENAI_API_KEY is required for OpenAI provider");
      }
      return new OpenAIService(apiKey);
    }
    throw new Error(`Unknown AI provider: ${provider}`);
  }
}

// Get AI provider from environment
const aiProvider = (process.env.AI_PROVIDER as "gemini" | "openai") || "gemini";
const geminiKey = process.env.GEMINI_API_KEY || "";
const openaiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY || "";

// Create service instance with fallback logic
let aiServiceInstance: AIService;

try {
  aiServiceInstance = AIServiceFactory.createService(aiProvider, aiProvider === "gemini" ? geminiKey : openaiKey);
} catch (error) {
  console.warn(`Failed to initialize ${aiProvider}, falling back to OpenAI:`, error);
  // Fallback to OpenAI if primary provider fails
  try {
    if (openaiKey) {
      aiServiceInstance = new OpenAIService(openaiKey);
    } else {
      // Last resort: stub service
      aiServiceInstance = {
        generateSummary: async (content: string) => {
          console.warn("AI service not configured, returning placeholder summary");
          return `AI-generated summary for: ${content.substring(0, 50)}...`;
        },
      };
    }
  } catch (fallbackError) {
    // Stub service as last resort
    aiServiceInstance = {
      generateSummary: async (content: string) => {
        console.warn("AI service not configured, returning placeholder summary");
        return `AI-generated summary for: ${content.substring(0, 50)}...`;
      },
    };
  }
}

export const aiService = aiServiceInstance;
