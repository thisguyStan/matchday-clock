import { MESSAGE_PATHS } from "./i18n-types";
import type {
  LocaleMessages,
  MessageKey,
  MessageParameters,
} from "./i18n-types";

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
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "tr", label: "Türkçe" },
  { code: "sr-Latn", label: "Srpski (latinica)" },
  { code: "bs", label: "Bosanski" },
  { code: "uk", label: "Українська" },
  { code: "ru", label: "Русский" },
  { code: "zh-CN", label: "简体中文" },
  { code: "ka", label: "ქართული" },
] as const;

export type LocaleCode = (typeof LANGUAGE_OPTIONS)[number]["code"];
export type Translator = (
  key: MessageKey,
  parameters?: MessageParameters,
) => string;
export type LanguagePreference = "system" | LocaleCode;
export type ThemePreference = "system" | "light" | "dark" | "oled";
export type SystemTheme = "light" | "dark";
export type ResolvedTheme = Exclude<ThemePreference, "system">;
export type UserPreferences = {
  language: LanguagePreference;
  theme: ThemePreference;
};

export const DEFAULT_PREFERENCES: UserPreferences = {
  language: "system",
  theme: "system",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseLocaleMessages(
  payload: unknown,
  locale: LocaleCode,
): LocaleMessages {
  if (!isRecord(payload)) {
    throw new Error(`Locale data for ${locale} must be a JSON object.`);
  }

  const messages: Partial<LocaleMessages> = {};
  for (const [key, path] of Object.entries(MESSAGE_PATHS) as [
    MessageKey,
    string,
  ][]) {
    let value: unknown = payload;
    for (const segment of path.split(".")) {
      if (!isRecord(value) || !Object.hasOwn(value, segment)) {
        throw new Error(
          `Locale data for ${locale} is missing the required message "${path}".`,
        );
      }
      value = value[segment];
    }
    if (typeof value !== "string") {
      throw new Error(
        `Locale message "${path}" for ${locale} must be a string.`,
      );
    }
    messages[key] = value;
  }

  return messages as LocaleMessages;
}

export async function loadLocaleMessages(
  locale: LocaleCode,
): Promise<LocaleMessages> {
  const response = await fetch(
    `${import.meta.env.BASE_URL}locales/${locale}.json`,
  );
  if (!response.ok) {
    throw new Error(
      `Locale request for ${locale} failed with HTTP ${response.status}.`,
    );
  }
  const payload: unknown = await response.json();
  return parseLocaleMessages(payload, locale);
}

export function translate(
  messages: LocaleMessages | null,
  key: MessageKey,
  parameters: MessageParameters = {},
): string {
  return (messages?.[key] ?? key).replace(
    /\{(\w+)\}/g,
    (placeholder, name: string) =>
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
    if (/^zh-(?:hant|tw|hk|mo)(?:-|$)/.test(normalized)) {
      continue;
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
      case "ja":
      case "ko":
      case "tr":
      case "bs":
      case "uk":
      case "ru":
      case "ka":
        return language;
      case "sr":
        return "sr-Latn";
      case "zh":
        return "zh-CN";
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

export function isLanguagePreference(
  value: unknown,
): value is LanguagePreference {
  return value === "system" || isLocaleCode(value);
}

export function isThemePreference(value: unknown): value is ThemePreference {
  return (
    value === "system" ||
    value === "light" ||
    value === "dark" ||
    value === "oled"
  );
}

export function readSavedPreferences(value: unknown): {
  preferences: UserPreferences;
  invalid: boolean;
} {
  if (value === undefined) {
    return { preferences: DEFAULT_PREFERENCES, invalid: false };
  }
  if (
    isRecord(value) &&
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
  systemTheme: SystemTheme,
): ResolvedTheme {
  return preference === "system" ? systemTheme : preference;
}
