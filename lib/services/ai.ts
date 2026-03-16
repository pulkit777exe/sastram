import { withRetry } from "@/lib/utils/retry";
import { z } from "zod";

const THREAD_DNA_PROMPT = {
  system: "You are a helpful assistant that analyzes discussion threads and extracts structured 'Thread DNA' information. Return ONLY valid JSON with these fields: questionType (one of 'factual', 'opinion', 'technical', 'comparison', 'other'), expertiseLevel (one of 'beginner', 'intermediate', 'advanced', 'expert'), topics (array of 3-5 key topics), readTimeMinutes (estimated reading time in minutes as integer).",
  fields: [
    "questionType: one of 'factual', 'opinion', 'technical', 'comparison', 'other'",
    "expertiseLevel: one of 'beginner', 'intermediate', 'advanced', 'expert'",
    "topics: array of 3-5 key topics",
    "readTimeMinutes: estimated reading time in minutes (integer)"
  ]
};

export interface AIService {
  generateSummary(content: string): Promise<string>;
  generateThreadSummary(messages: any[]): Promise<string>;
  generateDailyDigest(messages: any[]): Promise<string>;
  generateThreadDNA(messages: any[]): Promise<Record<string, any>>;
  calculateResolutionScore(messages: any[]): Promise<number>;
  detectConflicts(messages: any[]): Promise<{ hasConflict: boolean; conflictingMessages?: number[]; reason?: string }>;
}

export class GeminiService implements AIService {
  private apiKey: string;
  // private model: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generateSummary(content: string): Promise<string> {
    try {
      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      const genAI = new GoogleGenerativeAI(this.apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      const prompt = `Summarize the following discussion thread conversation. Focus on key points, decisions made, and important information. Keep it concise but comprehensive (200-300 words):

${content}

Summary:`;

      const result = await withRetry((signal) =>
        model.generateContent(prompt, { signal, timeout: 15_000 }),
      );
      const response = await result.response;
      return response.text();
    } catch (error) {
      console.error("Gemini API error:", error);
      return "Summary unavailable.";
    }
  }

  async generateThreadSummary(messages: any[]): Promise<string> {
    const content = messages
      .map((m) => `User ${m.sender?.name || "Unknown"}: ${m.content}`)
      .join("\n");
    return this.generateSummary(content);
  }

  async generateThreadDNA(messages: any[]): Promise<Record<string, any>> {
    try {
      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      const genAI = new GoogleGenerativeAI(this.apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      const content = messages
        .map((m) => `User ${m.sender?.name || "Unknown"}: ${m.content}`)
        .join("\n");

      const prompt = `Analyze the following discussion thread and extract structured "Thread DNA" information. Return ONLY valid JSON with these fields:
${THREAD_DNA_PROMPT.fields.join("\n")}

Messages:
${content}

JSON response:`;

      const result = await withRetry((signal) =>
        model.generateContent(prompt, { signal, timeout: 15_000 }),
      );
      const response = await result.response;
      const text = response.text().trim().replace(/```json\n?|```\n?/g, "").trim();
      
      const threadDNASchema = z.object({
        questionType: z.enum(["factual", "opinion", "technical", "comparison", "other"]),
        expertiseLevel: z.enum(["beginner", "intermediate", "advanced", "expert"]),
        topics: z.array(z.string()).min(3).max(5),
        readTimeMinutes: z.number().int().min(1),
      });
      
      const parsedDNA = threadDNASchema.safeParse(JSON.parse(text));
      if (!parsedDNA.success) {
        console.error("Invalid thread DNA format:", parsedDNA.error);
        return {
          questionType: "other",
          expertiseLevel: "intermediate",
          topics: ["general discussion"],
          readTimeMinutes: 1,
        };
      }
      
      return parsedDNA.data;
    } catch (error) {
      console.error("Gemini API error:", error);
      return {
        questionType: "other",
        expertiseLevel: "intermediate",
        topics: ["general discussion"],
        readTimeMinutes: 1,
      };
    }
  }

  async calculateResolutionScore(messages: any[]): Promise<number> {
    try {
      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      const genAI = new GoogleGenerativeAI(this.apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      const content = messages
        .map((m) => `User ${m.sender?.name || "Unknown"}: ${m.content}`)
        .join("\n");

      const prompt = `Calculate a resolution score (0-100) for this discussion thread. The score should reflect how well the original question/topic has been resolved. Consider:
- Whether there's a clear answer or solution
- The depth and quality of responses
- The level of consensus among participants
- How comprehensively the topic is covered

Return ONLY a single integer between 0 and 100.

Messages:
${content}

Score:`;

      const result = await withRetry((signal) =>
        model.generateContent(prompt, { signal, timeout: 15_000 }),
      );
      const response = await result.response;
      const text = response.text().trim();
      const score = parseInt(text, 10);
      return isNaN(score) ? 50 : Math.max(0, Math.min(100, score));
    } catch (error) {
      console.error("Gemini API error:", error);
      return 50; // Default score if calculation fails
    }
  }

  async detectConflicts(messages: any[]): Promise<{ hasConflict: boolean; conflictingMessages?: [number, number]; reason?: string }> {
    try {
      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      const genAI = new GoogleGenerativeAI(this.apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      const content = messages
        .map((m, index) => `${index + 1}. User ${m.sender?.name || "Unknown"}: ${m.content}`)
        .join("\n");

      const prompt = `Analyze the following discussion thread for conflicting messages. A conflict is when two messages present contradictory information or opposing viewpoints that can't both be true. 

Return a JSON object with:
- hasConflict: boolean indicating if there are any conflicts
- conflictingMessages: optional array of two message numbers that conflict (e.g., [1, 3])
- reason: optional string explaining the nature of the conflict

Messages:
${content}

JSON response:`;

      const result = await withRetry((signal) =>
        model.generateContent(prompt, { signal, timeout: 15_000 }),
      );
      const response = await result.response;
      const text = response.text().trim().replace(/```json\n?|```\n?/g, "").trim();
      
      const conflictSchema = z.object({
        hasConflict: z.boolean(),
        conflictingMessages: z.array(z.number()).length(2).optional(),
        reason: z.string().optional(),
      });
      
      const parsed = conflictSchema.safeParse(JSON.parse(text));
      if (!parsed.success) {
        console.error("Invalid conflict detection format:", parsed.error);
        return { hasConflict: false };
      }
      
      return parsed.data as { hasConflict: boolean; conflictingMessages?: [number, number]; reason?: string };
    } catch (error) {
      console.error("Gemini API error:", error);
      return { hasConflict: false };
    }
  }

  async generateDailyDigest(messages: any[]): Promise<string> {
    try {
      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      const genAI = new GoogleGenerativeAI(this.apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      const content = messages
        .map((m) => `User ${m.sender?.name || "Unknown"}: ${m.content}`)
        .join("\n");

      const prompt = `Analyze the following discussion thread messages from today and generate a daily digest summary for an email.
      
      Focus on these three aspects:
      1. Technical Updates: Job postings, technical discussions, code snippets.
      2. Artistic/Creative: Design discussions, creative ideas.
      3. General Tone: The overall mood and flow of the conversation.

      Format the output as a clean HTML snippet (without <html> or <body> tags, just the content divs/paragraphs) suitable for embedding in an email. Use <h3> for headers and <p>/<ul> for content. Keep it professional and engaging.

      Messages:
      ${content}
      `;

      const result = await withRetry((signal) =>
        model.generateContent(prompt, { signal, timeout: 15_000 }),
      );
      const response = await result.response;
      return response
        .text()
        .replace(/```html/g, "")
        .replace(/```/g, "");
    } catch (error) {
      console.error("Gemini API error:", error);
      return "<p>Digest unavailable.</p>";
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
      const data = await withRetry(async (signal) => {
        const response = await fetch(
          "https://api.openai.com/v1/chat/completions",
          {
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
            signal,
          },
        );

        if (!response.ok) {
          throw new Error(`OpenAI API error: ${response.statusText}`);
        }

        return response.json();
      });
      return data.choices[0]?.message?.content || "Summary generation failed";
    } catch (error) {
      console.error("OpenAI API error:", error);
      return "Summary unavailable.";
    }
  }

  async generateThreadSummary(messages: any[]): Promise<string> {
    const content = messages
      .map((m) => `User ${m.sender?.name || "Unknown"}: ${m.content}`)
      .join("\n");
    return this.generateSummary(content);
  }

  async generateThreadDNA(messages: any[]): Promise<Record<string, any>> {
    try {
      const content = messages
        .map((m) => `User ${m.sender?.name || "Unknown"}: ${m.content}`)
        .join("\n");

      const data = await withRetry(async (signal) => {
        const response = await fetch(
          "https://api.openai.com/v1/chat/completions",
          {
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
                  content: THREAD_DNA_PROMPT.system,
                },
                {
                  role: "user",
                  content: `Messages:\n${content}`,
                },
              ],
              max_tokens: 200,
              temperature: 0.7,
            }),
            signal,
          },
        );

        if (!response.ok) {
          throw new Error(`OpenAI API error: ${response.statusText}`);
        }

        return response.json();
      });

      const text = data.choices[0]?.message?.content || "{}";
      const cleaned = text.trim().replace(/```json\n?|```\n?/g, "").trim();
      
      const threadDNASchema = z.object({
        questionType: z.enum(["factual", "opinion", "technical", "comparison", "other"]),
        expertiseLevel: z.enum(["beginner", "intermediate", "advanced", "expert"]),
        topics: z.array(z.string()).min(3).max(5),
        readTimeMinutes: z.number().int().min(1),
      });
      
      const parsedDNA = threadDNASchema.safeParse(JSON.parse(cleaned));
      if (!parsedDNA.success) {
        console.error("Invalid thread DNA format:", parsedDNA.error);
        return {
          questionType: "other",
          expertiseLevel: "intermediate",
          topics: ["general discussion"],
          readTimeMinutes: 1,
        };
      }
      
      return parsedDNA.data;
    } catch (error) {
      console.error("OpenAI API error:", error);
      return {
        questionType: "other",
        expertiseLevel: "intermediate",
        topics: ["general discussion"],
        readTimeMinutes: 1,
      };
    }
  }

  async calculateResolutionScore(messages: any[]): Promise<number> {
    try {
      const content = messages
        .map((m) => `User ${m.sender?.name || "Unknown"}: ${m.content}`)
        .join("\n");

      const data = await withRetry(async (signal) => {
        const response = await fetch(
          "https://api.openai.com/v1/chat/completions",
          {
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
                    "You are a helpful assistant that calculates resolution scores (0-100) for discussion threads. The score should reflect how well the original question/topic has been resolved. Consider: whether there's a clear answer/solution, depth/quality of responses, level of consensus, comprehensiveness. Return ONLY a single integer between 0 and 100.",
                },
                {
                  role: "user",
                  content: `Messages:\n${content}`,
                },
              ],
              max_tokens: 50,
              temperature: 0.7,
            }),
            signal,
          },
        );

        if (!response.ok) {
          throw new Error(`OpenAI API error: ${response.statusText}`);
        }

        return response.json();
      });

      const text = data.choices[0]?.message?.content || "50";
      const score = parseInt(text.trim(), 10);
      return isNaN(score) ? 50 : Math.max(0, Math.min(100, score));
    } catch (error) {
      console.error("OpenAI API error:", error);
      return 50; // Default score if calculation fails
    }
  }

  async detectConflicts(messages: any[]): Promise<{ hasConflict: boolean; conflictingMessages?: number[]; reason?: string }> {
    try {
      const content = messages
        .map((m, index) => `${index + 1}. User ${m.sender?.name || "Unknown"}: ${m.content}`)
        .join("\n");

      const data = await withRetry(async (signal) => {
        const response = await fetch(
          "https://api.openai.com/v1/chat/completions",
          {
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
                  content: "You are a helpful assistant that analyzes discussion threads for conflicting messages. A conflict is when two messages present contradictory information or opposing viewpoints that can't both be true. Return a JSON object with hasConflict (boolean), conflictingMessages (optional array of two message numbers), and reason (optional string explaining the conflict).",
                },
                {
                  role: "user",
                  content: `Messages:\n${content}`,
                },
              ],
              max_tokens: 200,
              temperature: 0.7,
            }),
            signal,
          },
        );

        if (!response.ok) {
          throw new Error(`OpenAI API error: ${response.statusText}`);
        }

        return response.json();
      });

      const text = data.choices[0]?.message?.content || "{}";
      const cleaned = text.trim().replace(/```json\n?|```\n?/g, "").trim();
      
      const conflictSchema = z.object({
        hasConflict: z.boolean(),
        conflictingMessages: z.array(z.number()).length(2).optional(),
        reason: z.string().optional(),
      });
      
      const parsed = conflictSchema.safeParse(JSON.parse(cleaned));
      if (!parsed.success) {
        console.error("Invalid conflict detection format:", parsed.error);
        return { hasConflict: false };
      }
      
      return parsed.data as { hasConflict: boolean; conflictingMessages?: [number, number]; reason?: string };
    } catch (error) {
      console.error("OpenAI API error:", error);
      return { hasConflict: false };
    }
  }

  async generateDailyDigest(messages: any[]): Promise<string> {
    const content = messages
      .map((m) => `User ${m.sender?.name || "Unknown"}: ${m.content}`)
      .join("\n");

    // Fallback simple HTML generation for OpenAI if needed, or implement similar prompt
    try {
      const data = await withRetry(async (signal) => {
        const response = await fetch(
          "https://api.openai.com/v1/chat/completions",
          {
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
                    "You are a helpful assistant that summarizes discussion threads for a daily email digest. Format the output as HTML (no html/body tags). Sections: Technical, Artistic, General Tone.",
                },
                {
                  role: "user",
                  content: `Analyze these messages:\n\n${content}`,
                },
              ],
              max_tokens: 800,
              temperature: 0.7,
            }),
            signal,
          },
        );

        return response.json();
      });
      return data.choices[0]?.message?.content || "Digest generation failed";
    } catch (error) {
      console.error("OpenAI API error:", error);
      return "<p>Digest unavailable.</p>";
    }
  }
}

class AIServiceFactory {
  static createService(
    provider: "gemini" | "openai",
    apiKey: string,
  ): AIService {
    if (provider === "gemini") {
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY is required for Gemini provider");
      }
      return new GeminiService(apiKey);
    } else if (provider === "openai") {
      if (!apiKey) {
        throw new Error(
          "NEXT_PUBLIC_OPENAI_API_KEY is required for OpenAI provider",
        );
      }
      return new OpenAIService(apiKey);
    }
    throw new Error(`Unknown AI provider: ${provider}`);
  }
}

const aiProvider = (process.env.AI_PROVIDER as "gemini" | "openai") || "gemini";
const geminiKey = process.env.GEMINI_API_KEY || "";
const openaiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY || "";

// Create service instance with fallback logic
let aiServiceInstance: AIService;

try {
  aiServiceInstance = AIServiceFactory.createService(
    aiProvider,
    aiProvider === "gemini" ? geminiKey : openaiKey,
  );
} catch (error) {
  console.warn(
    `Failed to initialize ${aiProvider}, falling back to OpenAI:`,
    error,
  );
  // Fallback to OpenAI if primary provider fails
  try {
    if (openaiKey) {
      aiServiceInstance = new OpenAIService(openaiKey);
    } else {
      // Last resort: stub service
          aiServiceInstance = {
            generateSummary: async (content: string) => {
              console.warn(
                "AI service not configured, returning placeholder summary",
              );
              return `AI-generated summary for: ${content.substring(0, 50)}...`;
            },
            generateThreadSummary: async (messages: any[]) => {
              return "AI service not configured.";
            },
            generateDailyDigest: async (messages: any[]) => {
              return "<p>AI service not configured.</p>";
            },
            generateThreadDNA: async (messages: any[]) => {
              return {
                questionType: "other",
                expertiseLevel: "intermediate",
                topics: ["general discussion"],
                readTimeMinutes: 1,
              };
            },
            calculateResolutionScore: async (messages: any[]) => {
              return 50;
            },
            detectConflicts: async (messages: any[]) => {
              return { hasConflict: false };
            },
          };
    }
  } catch (fallbackError) {
    aiServiceInstance = {
      generateSummary: async (content: string) => {
        console.warn(
          "AI service not configured, returning placeholder summary",
        );
        return `AI-generated summary for: ${content.substring(0, 50)}...`;
      },
      generateThreadSummary: async (messages: any[]) => {
        return "AI service not configured.";
      },
      generateDailyDigest: async (messages: any[]) => {
        return "<p>AI service not configured.</p>";
      },
      generateThreadDNA: async (messages: any[]) => {
        return {
          questionType: "other",
          expertiseLevel: "intermediate",
          topics: ["general discussion"],
          readTimeMinutes: 1,
        };
      },
      calculateResolutionScore: async (messages: any[]) => {
        return 50;
      },
      detectConflicts: async (messages: any[]) => {
        return { hasConflict: false };
      },
    };
  }
}

export const aiService = aiServiceInstance;
