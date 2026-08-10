import { describe, expect, it } from "vitest";

import {
  GoogleTranslateProvider,
  parseGoogleTranslateResponse,
} from "./provider";

const russianResponse = {
  sentences: [{ trans: "Hello, how are you?", orig: "Привет, как дела?" }],
  src: "ru",
};

describe("Google translation provider", () => {
  it("parses the JSON response returned by the endpoint", () => {
    expect(parseGoogleTranslateResponse(russianResponse)).toEqual({
      text: "Hello, how are you?",
      detectedLanguage: "ru",
    });
  });

  it("requests the opposite language for Russian input", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      requests.push({ url: String(input), init });
      return new Response(JSON.stringify(russianResponse), { status: 200 });
    };

    const provider = new GoogleTranslateProvider(fetcher);
    const result = await provider.translate("Привет, как дела?");

    expect(result).toMatchObject({
      text: "Hello, how are you?",
      sourceLanguage: "ru",
      targetLanguage: "en",
    });
    expect(requests[0]?.url).toContain("sl=auto");
    expect(requests[0]?.url).toContain("tl=en");
  });

  it("exposes a readable error when the endpoint fails", async () => {
    const fetcher: typeof fetch = async () =>
      new Response("upstream failed", {
        status: 503,
        statusText: "Service Unavailable",
      });
    const provider = new GoogleTranslateProvider(fetcher);

    await expect(provider.translate("Hello")).rejects.toThrow(
      "Translation service returned HTTP 503",
    );
  });
});
