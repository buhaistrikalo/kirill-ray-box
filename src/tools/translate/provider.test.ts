import { describe, expect, it, vi } from "vitest";

import {
  DeepLTranslateProvider,
  parseDeepLTranslateResponse,
} from "./provider";

const englishResponse = {
  translations: [
    { text: "Hello, how are you?", detected_source_language: "RU" },
  ],
};

describe("DeepL translation provider", () => {
  it("parses the JSON response returned by the endpoint", () => {
    expect(parseDeepLTranslateResponse(englishResponse)).toEqual({
      text: "Hello, how are you?",
      detectedSourceLanguage: "ru",
    });
  });

  it("requests the opposite language for Russian input", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      requests.push({ url: String(input), init });
      return new Response(JSON.stringify(englishResponse), { status: 200 });
    };

    const provider = new DeepLTranslateProvider("test-key:fx", fetcher);
    const result = await provider.translate("Привет, как дела?");

    expect(result).toMatchObject({
      text: "Hello, how are you?",
      sourceLanguage: "ru",
      targetLanguage: "en",
    });
    expect(requests[0]?.url).toBe("https://api-free.deepl.com/v2/translate");
    expect(requests[0]?.init?.method).toBe("POST");
    expect(requests[0]?.init?.headers).toMatchObject({
      Authorization: "DeepL-Auth-Key test-key:fx",
    });
    expect(requests[0]?.init?.body).toBe(
      JSON.stringify({ text: ["Привет, как дела?"], target_lang: "EN" }),
    );
  });

  it("exposes a readable error when the endpoint fails", async () => {
    const fetcher: typeof fetch = async () =>
      new Response("upstream failed", {
        status: 503,
        statusText: "Service Unavailable",
      });
    const provider = new DeepLTranslateProvider("test-key:fx", fetcher);

    await expect(provider.translate("Hello")).rejects.toThrow(
      "Translation service returned HTTP 503",
    );
  });

  it("times out while reading a slow response body", async () => {
    vi.useFakeTimers();

    try {
      const fetcher: typeof fetch = async (_input, init) => {
        const signal = init?.signal;

        return {
          ok: true,
          status: 200,
          json: () =>
            new Promise((_, reject) => {
              signal?.addEventListener(
                "abort",
                () => reject(new Error("aborted")),
                { once: true },
              );
            }),
        } as Response;
      };

      const promise = new DeepLTranslateProvider(
        "test-key:fx",
        fetcher,
      ).translate("Hello");
      const rejection = expect(promise).rejects.toThrow(
        "Translation service request timed out",
      );
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(15_000);

      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not make a request without an API key", async () => {
    const fetcher = vi.fn<typeof fetch>();

    await expect(
      new DeepLTranslateProvider("   ", fetcher).translate("Hello"),
    ).rejects.toThrow(
      "Add a DeepL API key in Raycast settings to translate text.",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("explains DeepL rate limits", async () => {
    const fetcher: typeof fetch = async () =>
      new Response(null, { status: 429 });

    await expect(
      new DeepLTranslateProvider("test-key:fx", fetcher).translate("Hello"),
    ).rejects.toThrow("DeepL is rate-limiting requests. Try again shortly.");
  });
});
