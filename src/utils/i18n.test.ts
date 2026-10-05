import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import bs from "../../public/locales/bs.json";
import da from "../../public/locales/da.json";
import de from "../../public/locales/de.json";
import enGB from "../../public/locales/en-GB.json";
import enUS from "../../public/locales/en-US.json";
import es from "../../public/locales/es.json";
import fi from "../../public/locales/fi.json";
import fr from "../../public/locales/fr.json";
import hr from "../../public/locales/hr.json";
import itLocale from "../../public/locales/it.json";
import ja from "../../public/locales/ja.json";
import ka from "../../public/locales/ka.json";
import ko from "../../public/locales/ko.json";
import nbNO from "../../public/locales/nb-NO.json";
import nl from "../../public/locales/nl.json";
import pl from "../../public/locales/pl.json";
import ptBR from "../../public/locales/pt-BR.json";
import ptPT from "../../public/locales/pt-PT.json";
import ru from "../../public/locales/ru.json";
import srLatn from "../../public/locales/sr-Latn.json";
import sv from "../../public/locales/sv.json";
import tr from "../../public/locales/tr.json";
import uk from "../../public/locales/uk.json";
import zhCN from "../../public/locales/zh-CN.json";
import {
  DEFAULT_PREFERENCES,
  isLocaleCode,
  LANGUAGE_OPTIONS,
  loadLocaleMessages,
  parseLocaleMessages,
  readSavedPreferences,
  resolveSystemLocale,
  resolveTheme,
  translate,
} from "./i18n";
import type { LocaleCode } from "./i18n";

const localeData: Record<LocaleCode, unknown> = {
  bs,
  da,
  de,
  "en-GB": enGB,
  "en-US": enUS,
  es,
  fi,
  fr,
  hr,
  it: itLocale,
  ja,
  ka,
  ko,
  "nb-NO": nbNO,
  nl,
  pl,
  "pt-BR": ptBR,
  "pt-PT": ptPT,
  ru,
  "sr-Latn": srLatn,
  sv,
  tr,
  uk,
  "zh-CN": zhCN,
};

function placeholders(message: string): string[] {
  return [...message.matchAll(/\{\w+\}/g)]
    .map(([placeholder]) => placeholder)
    .sort();
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string | URL | Request) => {
      const locale = new URL(String(input), "http://localhost")
        .pathname.split("/")
        .at(-1)
        ?.replace(/\.json$/, "");
      if (!isLocaleCode(locale)) {
        return Promise.resolve(new Response(null, { status: 404 }));
      }
      return Promise.resolve(
        new Response(JSON.stringify(localeData[locale]), { status: 200 }),
      );
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("system language resolution and locale loading", () => {
  it("supports the requested language set and defaults preferences to system", () => {
    expect(LANGUAGE_OPTIONS).toHaveLength(24);
    expect(DEFAULT_PREFERENCES).toEqual({
      language: "system",
      theme: "system",
    });
  });

  it("loads old saved records with system defaults and rejects invalid preferences", () => {
    expect(readSavedPreferences(undefined)).toEqual({
      preferences: DEFAULT_PREFERENCES,
      invalid: false,
    });
    expect(readSavedPreferences({ language: "de", theme: "light" })).toEqual({
      preferences: { language: "de", theme: "light" },
      invalid: false,
    });
    expect(readSavedPreferences({ language: "de", theme: "oled" })).toEqual({
      preferences: { language: "de", theme: "oled" },
      invalid: false,
    });
    expect(
      readSavedPreferences({ language: "sr-Latn", theme: "system" }),
    ).toEqual({
      preferences: { language: "sr-Latn", theme: "system" },
      invalid: false,
    });
    expect(
      readSavedPreferences({ language: "zh-CN", theme: "system" }),
    ).toEqual({
      preferences: { language: "zh-CN", theme: "system" },
      invalid: false,
    });
    expect(readSavedPreferences({ language: "ka", theme: "system" })).toEqual({
      preferences: { language: "ka", theme: "system" },
      invalid: false,
    });
    expect(readSavedPreferences({ language: "unknown", theme: "system" })).toEqual({
      preferences: DEFAULT_PREFERENCES,
      invalid: true,
    });
  });

  it("loads only the requested nested JSON message bundle for each locale", async () => {
    const bundles = await Promise.all(
      LANGUAGE_OPTIONS.map(async ({ code }) => ({
        code,
        messages: await loadLocaleMessages(code),
      })),
    );
    expect(bundles).toHaveLength(24);
    expect(bundles.every(({ messages }) => messages.language.length > 0)).toBe(
      true,
    );
    const englishMessages = parseLocaleMessages(enGB, "en-GB");
    const messageKeys = Object.keys(englishMessages) as Array<
      keyof typeof englishMessages
    >;
    for (const { messages } of bundles) {
      for (const key of messageKeys) {
        expect(placeholders(messages[key])).toEqual(
          placeholders(englishMessages[key]),
        );
      }
    }
    expect(fetch).toHaveBeenCalledTimes(24);
    expect(fetch).toHaveBeenCalledWith("/locales/en-GB.json");
  });

  it("rejects incomplete nested locale data instead of returning partial messages", () => {
    expect(() => parseLocaleMessages({}, "en-GB")).toThrow(
      'missing the required message "install.banner"',
    );
  });

  it("reports failed locale requests", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 404 }));
    await expect(loadLocaleMessages("de")).rejects.toThrow(
      "Locale request for de failed with HTTP 404.",
    );
  });

  it("prefers explicit US English and Brazilian Portuguese variants", () => {
    expect(resolveSystemLocale(["en-US", "en-GB"])).toBe("en-US");
    expect(resolveSystemLocale(["pt-BR", "pt-PT"])).toBe("pt-BR");
  });

  it("uses UK English for generic and unsupported English variants", () => {
    expect(resolveSystemLocale(["en"])).toBe("en-GB");
    expect(resolveSystemLocale(["en-GB"])).toBe("en-GB");
    expect(resolveSystemLocale(["en-AU"])).toBe("en-GB");
  });

  it("maps regional language tags to supported locales", () => {
    expect(resolveSystemLocale(["pt"])).toBe("pt-PT");
    expect(resolveSystemLocale(["no-NO"])).toBe("nb-NO");
    expect(resolveSystemLocale(["nn-NO"])).toBe("nb-NO");
    expect(resolveSystemLocale(["ja-JP"])).toBe("ja");
    expect(resolveSystemLocale(["ko-KR"])).toBe("ko");
    expect(resolveSystemLocale(["tr-TR"])).toBe("tr");
    expect(resolveSystemLocale(["sr-Latn-RS"])).toBe("sr-Latn");
    expect(resolveSystemLocale(["bs-BA"])).toBe("bs");
    expect(resolveSystemLocale(["uk-UA"])).toBe("uk");
    expect(resolveSystemLocale(["ru-RU"])).toBe("ru");
    expect(resolveSystemLocale(["zh-Hans-CN"])).toBe("zh-CN");
    expect(resolveSystemLocale(["zh"])).toBe("zh-CN");
    expect(resolveSystemLocale(["zh-TW"])).toBe("en-GB");
    expect(resolveSystemLocale(["ka-GE"])).toBe("ka");
  });

  it("uses the first supported system language and formats localized messages", async () => {
    expect(resolveSystemLocale(["xx-XX", "fr-CA"])).toBe("fr");
    expect(resolveSystemLocale(["ja-JP", "fr-CA"])).toBe("ja");
    const german = await loadLocaleMessages("de");
    const croatian = await loadLocaleMessages("hr");
    const englishUk = await loadLocaleMessages("en-GB");
    expect(translate(german, "settingsNoExtra", { half: 45 })).toContain("45");
    expect(translate(croatian, "language")).toBe("Jezik");
    expect(translate(englishUk, "localeLoadFailed", { language: "Deutsch" }))
      .toContain("English (UK)");
  });
});

describe("appearance resolution", () => {
  it("follows the system unless a fixed appearance is selected", () => {
    expect(resolveTheme("system", "light")).toBe("light");
    expect(resolveTheme("system", "dark")).toBe("dark");
    expect(resolveTheme("light", "dark")).toBe("light");
    expect(resolveTheme("dark", "light")).toBe("dark");
    expect(resolveTheme("oled", "light")).toBe("oled");
  });
});
