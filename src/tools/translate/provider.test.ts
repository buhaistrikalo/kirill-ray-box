import { describe, expect, it, vi } from "vitest";

import {
  GoogleTranslateProvider,
  parseGoogleTranslateResponse,
  parseMyMemoryTranslateResponse,
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

  it("falls back when Google rate-limits a request", async () => {
    const requests: string[] = [];
    const fetcher: typeof fetch = async (input) => {
      requests.push(String(input));
      if (requests.length === 1) {
        return new Response(null, { status: 429 });
      }

      return new Response(
        JSON.stringify({ responseData: { translatedText: "Hello" } }),
        { status: 200 },
      );
    };

    await expect(
      new GoogleTranslateProvider(fetcher).translate("Привет"),
    ).resolves.toMatchObject({ text: "Hello", provider: "mymemory" });
    expect(requests[1]).toContain("api.mymemory.translated.net");
    expect(requests[1]).toContain("langpair=ru%7Cen");
  });

  it("parses the fallback response", () => {
    expect(
      parseMyMemoryTranslateResponse({
        responseData: { translatedText: "Hello" },
      }),
    ).toEqual({ text: "Hello" });
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

  it("times out while reading a rate-limit fallback response body", async () => {
    vi.useFakeTimers();

    try {
      let requestNumber = 0;
      const fetcher: typeof fetch = async (_input, init) => {
        requestNumber += 1;
        if (requestNumber === 1) {
          return new Response(null, { status: 429 });
        }

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

      const promise = new GoogleTranslateProvider(fetcher).translate("Hello");
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

      const promise = new GoogleTranslateProvider(fetcher).translate("Hello");
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
});
