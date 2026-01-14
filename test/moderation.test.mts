import { expect } from "chai";
import { RegexFilter, MessageModerationPipeline } from "@/lib/services/moderation";

describe("Moderation System", () => {
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

  it("MessageModerationPipeline should allow benign content", async () => {
    const pipeline = new MessageModerationPipeline();
    const result = await pipeline.process(
      {
        id: "",
        content: "Hello world",
        authorId: "user1",
        sectionId: "section1",
        timestamp: new Date(),
      },
      {
        sectionId: "section1",
        participantIds: ["user1"],
        recentHistory: [],
        sectionMetadata: {},
        relationships: new Map(),
      }
    );

    expect(result.action).to.equal("ALLOW");
  });
});

