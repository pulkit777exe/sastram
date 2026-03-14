import { expect } from "chai";
import { RegexFilter } from "@/lib/services/moderation";
import { prisma } from "@/lib/infrastructure/prisma";

describe("Moderation System", () => {
  describe("Rule Matching", () => {
    // Save original method
    const originalFindMany = prisma.moderationRule.findMany;
    
    before(() => {
      // Mock to return no rules
      (prisma.moderationRule as any).findMany = async () => [];
    });
    
    after(() => {
      // Restore original method
      prisma.moderationRule.findMany = originalFindMany;
    });

    it("RegexFilter should block obvious spam", async () => {
      const filter = new RegexFilter();
      const result = await filter.check({
        id: "",
        content: "This is spam",
        authorId: "user1",
        sectionId: "section1",
        timestamp: new Date(),
      });

      expect(result.success).to.be.false;
    });

    it("RegexFilter should allow benign content without rules", async () => {
      const filter = new RegexFilter();
      const result = await filter.check({
        id: "",
        content: "Hello world",
        authorId: "user1",
        sectionId: "section1",
        timestamp: new Date(),
      });

      expect(result.success).to.be.true;
    });
  });
});

