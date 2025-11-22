/* eslint-disable @typescript-eslint/no-unused-expressions */
import { expect } from "chai";
import { containsBadLanguage, filterBadLanguage, validateFile } from "../lib/content-safety";

describe("Content Safety", () => {
  describe("Language Filter", () => {
    it("should detect bad language", () => {
      expect(containsBadLanguage("This is a scam message")).to.be.true;
      expect(containsBadLanguage("Hello world")).to.be.false;
    });

    it("should filter bad language", () => {
      const filtered = filterBadLanguage("This is a scam");
      expect(filtered).to.equal("This is a ****");
    });
  });

  describe("File Validation", () => {
    it("should validate correct file types", () => {
      const file = new File(["content"], "test.png", { type: "image/png" });
      const result = validateFile(file);
      expect(result.isValid).to.be.true;
    });

    it("should reject large files", () => {
      const largeFile = {
        name: "large.png",
        type: "image/png",
        size: 10 * 1024 * 1024, // only 10mb as standard
      } as File;
      const result = validateFile(largeFile);
      expect(result.isValid).to.be.false;
      expect(result.error).to.include("5MB");
    });

    it("should reject malware filenames", () => {
      const malwareFile = new File([""], "virus.png", { type: "image/png" });
      const result = validateFile(malwareFile);
      expect(result.isValid).to.be.false;
      expect(result.error).to.include("Malware detected");
    });
  });
});
