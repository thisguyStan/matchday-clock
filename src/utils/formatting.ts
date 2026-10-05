import type { MatchPhase } from "./match-clock";
import {
  getIntlLocale,
  translate,
  type LocaleCode,
  type LocaleMessages,
} from "./i18n";

export function formatPauseDate(timestamp: number, locale: LocaleCode): string {
  return new Intl.DateTimeFormat(getIntlLocale(locale), {
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

export function phaseLabel(
  phase: MatchPhase,
  messages: LocaleMessages | null,
): string {
  switch (phase) {
    case "firstHalf":
      return translate(messages, "firstHalf");
    case "secondHalf":
      return translate(messages, "secondHalf");
    case "extraTimeFirst":
      return translate(messages, "extraTimeFirst");
    case "extraTimeSecond":
      return translate(messages, "extraTimeSecond");
  }
}

export function phaseShortLabel(
  phase: MatchPhase,
  messages: LocaleMessages | null,
): string {
  switch (phase) {
    case "firstHalf":
      return "1";
    case "secondHalf":
      return "2";
    case "extraTimeFirst":
      return `${translate(messages, "extraShort")} 1`;
    case "extraTimeSecond":
      return `${translate(messages, "extraShort")} 2`;
  }
}
