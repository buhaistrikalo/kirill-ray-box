import { describe, expect, it } from "vitest";

import { detectLanguage, getTargetLanguage } from "./domain";

describe("translation language direction", () => {
  it("detects Russian text from Cyrillic letters", () => {
    expect(detectLanguage("Привет, как дела?")).toBe("ru");
  });

  it("detects English text from Latin letters", () => {
    expect(detectLanguage("Hello, how are you?")).toBe("en");
  });

  it("switches Russian to English and English to Russian", () => {
    expect(getTargetLanguage("ru")).toBe("en");
    expect(getTargetLanguage("en")).toBe("ru");
  });
});
