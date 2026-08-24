import {
  detectLanguage,
  getTargetLanguage,
  type SupportedLanguage,
} from "./domain";
import type { TranslationProvider, TranslationResult } from "./types";

const DEEPL_FREE_TRANSLATE_ENDPOINT = "https://api-free.deepl.com/v2/translate";
const DEEPL_PRO_TRANSLATE_ENDPOINT = "https://api.deepl.com/v2/translate";
const TRANSLATION_TIMEOUT_MS = 15_000;

type DeepLTranslation = {
  detected_source_language?: unknown;
  text?: unknown;
};

type ParsedDeepLResponse = {
  text: string;
  detectedSourceLanguage?: SupportedLanguage;
};

function asSupportedLanguage(value: unknown): SupportedLanguage | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const language = value.toLowerCase().split("-")[0];
  return language === "ru" || language === "en" ? language : undefined;
}

export function parseDeepLTranslateResponse(
  payload: unknown,
): ParsedDeepLResponse {
  if (
    typeof payload === "object" &&
    payload !== null &&
    !Array.isArray(payload)
  ) {
    const response = payload as { translations?: unknown };
    const translation = Array.isArray(response.translations)
      ? (response.translations[0] as DeepLTranslation | undefined)
      : undefined;

    if (typeof translation?.text === "string" && translation.text.length > 0) {
      return {
        text: translation.text,
        detectedSourceLanguage: asSupportedLanguage(
          translation.detected_source_language,
        ),
      };
    }
  }

  throw new Error("Translation service returned an empty response");
}

function getDeepLError(response: Response): string {
  if (response.status === 401 || response.status === 403) {
    return "DeepL rejected the API key. Check it in Raycast settings.";
  }

  if (response.status === 429) {
    return "DeepL is rate-limiting requests. Try again shortly.";
  }

  if (response.status === 456) {
    return "DeepL API character limit has been reached.";
  }

  return `Translation service returned HTTP ${response.status}`;
}

export class DeepLTranslateProvider implements TranslationProvider {
  constructor(
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly freeEndpoint = DEEPL_FREE_TRANSLATE_ENDPOINT,
    private readonly proEndpoint = DEEPL_PRO_TRANSLATE_ENDPOINT,
  ) {}

  async translate(text: string): Promise<TranslationResult> {
    if (!this.apiKey.trim()) {
      throw new Error(
        "Add a DeepL API key in Raycast settings to translate text.",
      );
    }

    const localSourceLanguage = detectLanguage(text);
    const targetLanguage = getTargetLanguage(localSourceLanguage);
    const endpoint = this.apiKey.trim().endsWith(":fx")
      ? this.freeEndpoint
      : this.proEndpoint;

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      TRANSLATION_TIMEOUT_MS,
    );

    try {
      let response: Response;
      try {
        response = await this.fetcher(endpoint, {
          method: "POST",
          headers: {
            Accept: "application/json",
            Authorization: `DeepL-Auth-Key ${this.apiKey.trim()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: [text],
            target_lang: targetLanguage.toUpperCase(),
          }),
          signal: controller.signal,
        });
      } catch {
        if (controller.signal.aborted) {
          throw new Error("Translation service request timed out");
        }

        throw new Error("Unable to reach translation service");
      }

      if (!response.ok) {
        throw new Error(getDeepLError(response));
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

      const parsed = parseDeepLTranslateResponse(payload);

      return {
        text: parsed.text,
        sourceLanguage: parsed.detectedSourceLanguage ?? localSourceLanguage,
        targetLanguage,
        provider: "deepl",
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
