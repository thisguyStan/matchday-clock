import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREFERENCES,
  FALLBACK_MESSAGES,
  LANGUAGE_OPTIONS,
  loadLocaleMessages,
  readSavedPreferences,
  resolveSystemLocale,
  resolveTheme,
  translate,
} from "./i18n";

describe("system language resolution", () => {
  it("supports the requested language set and defaults preferences to system", () => {
    expect(LANGUAGE_OPTIONS).toHaveLength(15);
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
    expect(readSavedPreferences({ language: "unknown", theme: "system" })).toEqual({
      preferences: DEFAULT_PREFERENCES,
      invalid: true,
    });
  });

  it("loads a valid typed message bundle for every supported locale", async () => {
    const bundles = await Promise.all(
      LANGUAGE_OPTIONS.map(async ({ code }) => ({
        code,
        messages: await loadLocaleMessages(code),
      })),
    );
    expect(bundles).toHaveLength(15);
    expect(bundles.every(({ messages }) => messages.language.length > 0)).toBe(
      true,
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
    expect(resolveSystemLocale(["ja-JP"])).toBe("en-GB");
  });

  it("maps generic Portuguese and Norwegian system tags to supported locales", () => {
    expect(resolveSystemLocale(["pt"])).toBe("pt-PT");
    expect(resolveSystemLocale(["no-NO"])).toBe("nb-NO");
    expect(resolveSystemLocale(["nn-NO"])).toBe("nb-NO");
  });

  it("uses the first supported system language and formats localized messages", async () => {
    expect(resolveSystemLocale(["ja-JP", "fr-CA"])).toBe("fr");
    const german = await loadLocaleMessages("de");
    const croatian = await loadLocaleMessages("hr");
    expect(translate(german, "settingsNoExtra", { half: 45 })).toContain("45");
    expect(translate(croatian, "language")).toBe("Jezik");
    expect(translate(FALLBACK_MESSAGES, "localeLoadFailed", { language: "Deutsch" }))
      .toContain("English (UK)");
  });
});

describe("appearance resolution", () => {
  it("follows the system unless a fixed appearance is selected", () => {
    expect(resolveTheme("system", "light")).toBe("light");
    expect(resolveTheme("system", "dark")).toBe("dark");
    expect(resolveTheme("light", "dark")).toBe("light");
    expect(resolveTheme("dark", "light")).toBe("dark");
  });
});
