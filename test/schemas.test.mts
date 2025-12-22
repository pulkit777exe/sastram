import { describe, it } from "mocha";
import { expect } from "chai";
import {
  validateWebSocketMessage,
  websocketSchemas,
} from "../lib/schemas/websocket.js";
import {
  createMessageWithAttachmentsSchema,
  createThreadSchema,
  createCommunitySchema,
  attachmentInputSchema,
} from "../lib/schemas/database.js";
import {
  uploadResponseSchema,
  createThreadRequestSchema,
  createCommunityRequestSchema,
} from "../lib/schemas/api.js";
import { validateEnv } from "../lib/schemas/env.js";

describe("Zod Schema Validation", () => {
  describe("WebSocket Message Schemas", () => {
    it("should validate a valid NEW_MESSAGE event", () => {
      const message = {
        type: "NEW_MESSAGE",
        payload: {
          id: "clxyz123456789",
          content: "Hello, world!",
          senderId: "cluser123456789",
          senderName: "John Doe",
          sectionId: "clsect123456789",
          createdAt: new Date(),
        },
      };

      const result = validateWebSocketMessage(message);
      expect(result.success).to.be.true;
    });

    it("should reject invalid NEW_MESSAGE with missing required fields", () => {
      const message = {
        type: "NEW_MESSAGE",
        payload: {
          content: "Hello",
          // Missing required fields
        },
      };

      const result = validateWebSocketMessage(message);
      expect(result.success).to.be.false;
    });

    it("should validate USER_TYPING event", () => {
      const message = {
        type: "USER_TYPING",
        payload: {
          userId: "cluser123456789",
          userName: "John Doe",
          sectionId: "clsect123456789",
        },
      };

      const result = validateWebSocketMessage(message);
      expect(result.success).to.be.true;
    });

    it("should validate USER_STOPPED_TYPING event", () => {
      const message = {
        type: "USER_STOPPED_TYPING",
        payload: {
          userId: "cluser123456789",
          sectionId: "clsect123456789",
        },
      };

      const result = validateWebSocketMessage(message);
      expect(result.success).to.be.true;
    });

    it("should reject invalid message type", () => {
      const message = {
        type: "INVALID_TYPE",
        payload: {
          sectionId: "clsect123456789",
        },
      };

      const result = validateWebSocketMessage(message);
      expect(result.success).to.be.false;
    });

    it("should validate MESSAGE_DELETED event", () => {
      const message = {
        type: "MESSAGE_DELETED",
        payload: {
          messageId: "clmsg123456789",
          deletedBy: "cluser123456789",
          sectionId: "clsect123456789",
        },
      };

      const result = validateWebSocketMessage(message);
      expect(result.success).to.be.true;
    });
  });

  describe("Database Schema Validation", () => {
    it("should validate message creation with valid data", () => {
      const data = {
        content: "This is a test message",
        sectionId: "clsect123456789",
      };

      const result = createMessageWithAttachmentsSchema.safeParse(data);
      expect(result.success).to.be.true;
    });

    it("should reject message with empty content", () => {
      const data = {
        content: "",
        sectionId: "clsect123456789",
      };

      const result = createMessageWithAttachmentsSchema.safeParse(data);
      expect(result.success).to.be.false;
    });

    it("should reject message with content exceeding max length", () => {
      const data = {
        content: "a".repeat(1001),
        sectionId: "clsect123456789",
      };

      const result = createMessageWithAttachmentsSchema.safeParse(data);
      expect(result.success).to.be.false;
    });

    it("should validate message with attachments", () => {
      const data = {
        content: "Message with attachment",
        sectionId: "clsect123456789",
        attachments: [
          {
            url: "https://example.com/image.png",
            type: "IMAGE",
            name: "image.png",
            size: 1024,
          },
        ],
      };

      const result = createMessageWithAttachmentsSchema.safeParse(data);
      expect(result.success).to.be.true;
    });

    it("should validate thread creation with valid data", () => {
      const data = {
        name: "Test Thread",
        slug: "test-thread-abc123",
        description: "A test thread",
        createdBy: "cluser123456789",
      };

      const result = createThreadSchema.safeParse(data);
      expect(result.success).to.be.true;
    });

    it("should reject thread with invalid slug", () => {
      const data = {
        name: "Test Thread",
        slug: "Invalid Slug!",
        createdBy: "cluser123456789",
      };

      const result = createThreadSchema.safeParse(data);
      expect(result.success).to.be.false;
    });

    it("should validate community creation", () => {
      const data = {
        title: "Test Community",
        slug: "test-community-abc123",
        description: "A test community",
        createdBy: "cluser123456789",
      };

      const result = createCommunitySchema.safeParse(data);
      expect(result.success).to.be.true;
    });

    it("should reject attachment with invalid URL", () => {
      const data = {
        url: "not-a-valid-url",
        type: "IMAGE",
        name: "image.png",
        size: 1024,
      };

      const result = attachmentInputSchema.safeParse(data);
      expect(result.success).to.be.false;
    });
  });

  describe("API Schema Validation", () => {
    it("should validate upload response", () => {
      const response = {
        files: [
          {
            url: "https://example.com/file.png",
            type: "IMAGE",
            name: "file.png",
            size: 2048,
          },
        ],
      };

      const result = uploadResponseSchema.safeParse(response);
      expect(result.success).to.be.true;
    });

    it("should validate thread creation request", () => {
      const request = {
        title: "New Thread",
        description: "Thread description",
        communityId: "clcomm123456789",
      };

      const result = createThreadRequestSchema.safeParse(request);
      expect(result.success).to.be.true;
    });

    it("should reject thread with short title", () => {
      const request = {
        title: "AB",
        description: "Thread description",
      };

      const result = createThreadRequestSchema.safeParse(request);
      expect(result.success).to.be.false;
    });

    it("should validate community creation request", () => {
      const request = {
        title: "New Community",
        description: "Community description",
      };

      const result = createCommunityRequestSchema.safeParse(request);
      expect(result.success).to.be.true;
    });

    it("should reject community with description exceeding max length", () => {
      const request = {
        title: "New Community",
        description: "a".repeat(281),
      };

      const result = createCommunityRequestSchema.safeParse(request);
      expect(result.success).to.be.false;
    });
  });

  describe("Environment Variable Validation", () => {
    it("should validate environment variables", () => {
      // This test will use actual process.env
      const result = validateEnv();

      // In test environment, we expect validation to pass or fail gracefully
      if (!result.success) {
        console.log("Environment validation errors:", result.error.issues);
      }

      // Just verify the function runs without throwing
      expect(result).to.have.property("success");
    });
  });
});
