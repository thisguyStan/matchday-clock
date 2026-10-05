import type { messages as englishUkMessages } from "../locales/en-GB";

export type MessageKey = keyof typeof englishUkMessages;
export type LocaleMessages = {
  [Key in MessageKey]: string;
};
export type MessageParameters = Record<string, string | number>;
