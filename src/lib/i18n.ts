import { messages as englishUkMessages } from "../locales/en-GB";
import type { LocaleMessages, MessageKey, MessageParameters } from "./i18n-types";

export type { LocaleMessages, MessageKey, MessageParameters } from "./i18n-types";

export const LANGUAGE_OPTIONS = [
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "de", label: "Deutsch" },
  { code: "es", label: "Español" },
  { code: "pt-PT", label: "Português (Portugal)" },
  { code: "pt-BR", label: "Português (Brasil)" },
  { code: "fr", label: "Français" },
  { code: "nl", label: "Nederlands" },
  { code: "sv", label: "Svenska" },
  { code: "da", label: "Dansk" },
  { code: "it", label: "Italiano" },
  { code: "pl", label: "Polski" },
  { code: "nb-NO", label: "Norsk" },
  { code: "fi", label: "Suomi" },
  { code: "hr", label: "Hrvatski" },
] as const;

export type LocaleCode = (typeof LANGUAGE_OPTIONS)[number]["code"];
export type LanguagePreference = "system" | LocaleCode;
export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = Exclude<ThemePreference, "system">;
export type UserPreferences = {
  language: LanguagePreference;
  theme: ThemePreference;
};

export const DEFAULT_PREFERENCES: UserPreferences = {
  language: "system",
  theme: "system",
};

export const FALLBACK_MESSAGES: LocaleMessages = englishUkMessages;

type LocaleModule = { messages: LocaleMessages };

const localeLoaders: Record<LocaleCode, () => Promise<LocaleModule>> = {
  "en-US": () => import("../locales/en-US"),
  "en-GB": async () => ({ messages: englishUkMessages }),
  de: () => import("../locales/de"),
  es: () => import("../locales/es"),
  "pt-PT": () => import("../locales/pt-PT"),
  "pt-BR": () => import("../locales/pt-BR"),
  fr: () => import("../locales/fr"),
  nl: () => import("../locales/nl"),
  sv: () => import("../locales/sv"),
  da: () => import("../locales/da"),
  it: () => import("../locales/it"),
  pl: () => import("../locales/pl"),
  "nb-NO": () => import("../locales/nb-NO"),
  fi: () => import("../locales/fi"),
  hr: () => import("../locales/hr"),
};

export function loadLocaleMessages(locale: LocaleCode): Promise<LocaleMessages> {
  return localeLoaders[locale]().then((module) => module.messages);
}

export function translate(
  messages: LocaleMessages,
  key: MessageKey,
  parameters: MessageParameters = {},
): string {
  return messages[key].replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    String(parameters[name] ?? placeholder),
  );
}

export function resolveSystemLocale(languageTags: readonly string[]): LocaleCode {
  for (const languageTag of languageTags) {
    const normalized = languageTag.trim().replaceAll("_", "-").toLowerCase();
    if (!normalized) {
      continue;
    }
    if (normalized === "en-us" || normalized.startsWith("en-us-")) {
      return "en-US";
    }
    if (normalized === "pt-br" || normalized.startsWith("pt-br-")) {
      return "pt-BR";
    }

    const language = normalized.split("-")[0];
    switch (language) {
      case "en":
        return "en-GB";
      case "de":
      case "es":
      case "fr":
      case "nl":
      case "sv":
      case "da":
      case "it":
      case "pl":
      case "fi":
      case "hr":
        return language;
      case "pt":
        return "pt-PT";
      case "no":
      case "nb":
      case "nn":
        return "nb-NO";
    }
  }
  return "en-GB";
}

export function getIntlLocale(locale: LocaleCode): string {
  switch (locale) {
    case "de":
      return "de-DE";
    case "es":
      return "es-ES";
    case "pt-PT":
      return "pt-PT";
    case "pt-BR":
      return "pt-BR";
    case "fr":
      return "fr-FR";
    case "nl":
      return "nl-NL";
    case "sv":
      return "sv-SE";
    case "da":
      return "da-DK";
    case "it":
      return "it-IT";
    case "pl":
      return "pl-PL";
    case "nb-NO":
      return "nb-NO";
    case "fi":
      return "fi-FI";
    case "hr":
      return "hr-HR";
    default:
      return locale;
  }
}

export function isLocaleCode(value: unknown): value is LocaleCode {
  return LANGUAGE_OPTIONS.some((option) => option.code === value);
}

export function isLanguagePreference(value: unknown): value is LanguagePreference {
  return value === "system" || isLocaleCode(value);
}

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

export function readSavedPreferences(value: unknown): {
  preferences: UserPreferences;
  invalid: boolean;
} {
  if (value === undefined) {
    return { preferences: DEFAULT_PREFERENCES, invalid: false };
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "language" in value &&
    "theme" in value &&
    isLanguagePreference(value.language) &&
    isThemePreference(value.theme)
  ) {
    return {
      preferences: { language: value.language, theme: value.theme },
      invalid: false,
    };
  }
  return { preferences: DEFAULT_PREFERENCES, invalid: true };
}

export function resolveTheme(
  preference: ThemePreference,
  systemTheme: ResolvedTheme,
): ResolvedTheme {
  return preference === "system" ? systemTheme : preference;
}
