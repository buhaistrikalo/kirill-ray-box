import {
  detectLanguage,
  getTargetLanguage,
  type SupportedLanguage,
} from "./domain";
import type { TranslationProvider, TranslationResult } from "./types";

const GOOGLE_TRANSLATE_ENDPOINT =
  "https://translate.googleapis.com/translate_a/single";
const MYMEMORY_TRANSLATE_ENDPOINT = "https://api.mymemory.translated.net/get";
const TRANSLATION_TIMEOUT_MS = 15_000;

type GoogleSentence = {
  trans?: unknown;
};

type ParsedGoogleResponse = {
  text: string;
  detectedLanguage?: SupportedLanguage;
};

type ParsedMyMemoryResponse = {
  text: string;
};

function asSupportedLanguage(value: unknown): SupportedLanguage | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const language = value.toLowerCase().split("-")[0];
  return language === "ru" || language === "en" ? language : undefined;
}

export function parseGoogleTranslateResponse(
  payload: unknown,
): ParsedGoogleResponse {
  if (
    typeof payload === "object" &&
    payload !== null &&
    !Array.isArray(payload)
  ) {
    const response = payload as { sentences?: unknown; src?: unknown };
    if (Array.isArray(response.sentences)) {
      const text = response.sentences
        .map((sentence) => (sentence as GoogleSentence)?.trans)
        .filter((part): part is string => typeof part === "string")
        .join("");

      if (text.length > 0) {
        return { text, detectedLanguage: asSupportedLanguage(response.src) };
      }
    }
  }

  if (Array.isArray(payload) && Array.isArray(payload[0])) {
    const text = payload[0]
      .map((sentence) => (Array.isArray(sentence) ? sentence[0] : undefined))
      .filter((part): part is string => typeof part === "string")
      .join("");

    if (text.length > 0) {
      return { text, detectedLanguage: asSupportedLanguage(payload[2]) };
    }
  }

  throw new Error("Translation service returned an empty response");
}

export function parseMyMemoryTranslateResponse(
  payload: unknown,
): ParsedMyMemoryResponse {
  if (
    typeof payload === "object" &&
    payload !== null &&
    !Array.isArray(payload)
  ) {
    const response = payload as { responseData?: { translatedText?: unknown } };
    const text = response.responseData?.translatedText;
    if (typeof text === "string" && text.length > 0) {
      return { text };
    }
  }

  throw new Error("Translation service returned an empty response");
}

export class GoogleTranslateProvider implements TranslationProvider {
  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly endpoint = GOOGLE_TRANSLATE_ENDPOINT,
    private readonly fallbackEndpoint = MYMEMORY_TRANSLATE_ENDPOINT,
  ) {}

  async translate(text: string): Promise<TranslationResult> {
    const localSourceLanguage = detectLanguage(text);
    const targetLanguage = getTargetLanguage(localSourceLanguage);
    const url = new URL(this.endpoint);

    url.searchParams.set("client", "gtx");
    url.searchParams.set("sl", "auto");
    url.searchParams.set("tl", targetLanguage);
    url.searchParams.set("dt", "t");
    url.searchParams.set("dj", "1");
    url.searchParams.set("q", text);

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      TRANSLATION_TIMEOUT_MS,
    );

    try {
      let response: Response;
      try {
        response = await this.fetcher(url.toString(), {
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
      } catch {
        if (controller.signal.aborted) {
          throw new Error("Translation service request timed out");
        }

        throw new Error("Unable to reach translation service");
      }

      if (response.status === 429) {
        const fallbackUrl = new URL(this.fallbackEndpoint);
        fallbackUrl.searchParams.set("q", text);
        fallbackUrl.searchParams.set(
          "langpair",
          `${localSourceLanguage}|${targetLanguage}`,
        );

        try {
          response = await this.fetcher(fallbackUrl.toString(), {
            headers: { Accept: "application/json" },
            signal: controller.signal,
          });
        } catch {
          if (controller.signal.aborted) {
            throw new Error("Translation service request timed out");
          }

          throw new Error("Unable to reach translation service");
        }

        if (!response.ok) {
          throw new Error(
            `Translation service returned HTTP ${response.status}`,
          );
        }

        let fallbackPayload: unknown;
        try {
          fallbackPayload = await response.json();
        } catch {
          throw new Error("Translation service returned invalid JSON");
        }

        const parsed = parseMyMemoryTranslateResponse(fallbackPayload);
        return {
          text: parsed.text,
          sourceLanguage: localSourceLanguage,
          targetLanguage,
          provider: "mymemory",
        };
      }

      if (!response.ok) {
        throw new Error(`Translation service returned HTTP ${response.status}`);
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        if (controller.signal.aborted) {
          throw new Error("Translation service request timed out");
        }

        throw new Error("Translation service returned invalid JSON");
      }

      const parsed = parseGoogleTranslateResponse(payload);

      return {
        text: parsed.text,
        sourceLanguage: parsed.detectedLanguage ?? localSourceLanguage,
        targetLanguage,
        provider: "google-web",
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
