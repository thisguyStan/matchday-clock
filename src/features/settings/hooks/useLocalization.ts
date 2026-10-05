import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  getIntlLocale,
  LANGUAGE_OPTIONS,
  loadLocaleMessages,
  resolveSystemLocale,
  resolveTheme,
  translate,
  type LocaleCode,
  type LocaleMessages,
  type ResolvedTheme,
  type SystemTheme,
  type Translator,
  type UserPreferences,
} from "../../../utils/i18n";
import { waitForServiceWorkerControl } from "../../../utils/service-worker";
import type { LocalizedMessage } from "../../matchday/types";

function getSystemLanguageTags(): readonly string[] {
  return navigator.languages.length > 0
    ? navigator.languages
    : [navigator.language];
}

interface UseLocalizationResult {
  locale: LocaleCode;
  displayLocale: LocaleCode;
  messages: LocaleMessages | null;
  theme: ResolvedTheme;
  t: Translator;
  localeLoadError: boolean;
}

export function useLocalization(
  preferences: UserPreferences,
  setFeedback: Dispatch<SetStateAction<LocalizedMessage | null>>,
): UseLocalizationResult {
  const [systemLocale, setSystemLocale] = useState<LocaleCode>(() =>
    resolveSystemLocale(getSystemLanguageTags()),
  );
  const [systemTheme, setSystemTheme] = useState<SystemTheme>(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  );
  const [messages, setMessages] = useState<LocaleMessages | null>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const [messagesLocale, setMessagesLocale] = useState<LocaleCode | null>(null);
  const [localeLoadError, setLocaleLoadError] = useState(false);

  const locale =
    preferences.language === "system" ? systemLocale : preferences.language;
  const displayLocale = messagesLocale ?? locale;
  const theme = resolveTheme(preferences.theme, systemTheme);
  const t = useCallback<Translator>(
    (key, parameters) => translate(messages, key, parameters),
    [messages],
  );

  useEffect(() => {
    const updateSystemLocale = () => {
      setSystemLocale(resolveSystemLocale(getSystemLanguageTags()));
    };
    window.addEventListener("languagechange", updateSystemLocale);
    return () => window.removeEventListener("languagechange", updateSystemLocale);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void waitForServiceWorkerControl()
      .then(() => {
        if (cancelled) {
          return null;
        }
        return loadLocaleMessages(locale);
      })
      .then((loadedMessages) => {
        if (cancelled || loadedMessages === null) {
          return;
        }
        setMessages(loadedMessages);
        setMessagesLocale(locale);
        setLocaleLoadError(false);
        setFeedback((current) =>
          current?.key === "localeLoadFailed" ? null : current,
        );
      })
      .catch(async (error: unknown) => {
        if (cancelled) {
          return;
        }
        console.error(`Could not load locale messages for ${locale}.`, error);
        const languageLabel =
          LANGUAGE_OPTIONS.find((option) => option.code === locale)?.label ??
          locale;
        try {
          if (locale === "en-GB") {
            throw new Error("The English (UK) locale could not be loaded.");
          }
          const fallbackMessages = await loadLocaleMessages("en-GB");
          if (cancelled) {
            return;
          }
          setMessages(fallbackMessages);
          setMessagesLocale("en-GB");
          setLocaleLoadError(false);
          setFeedback({
            key: "localeLoadFailed",
            parameters: { language: languageLabel },
          });
        } catch (fallbackError) {
          console.error(
            "Could not load the English (UK) locale fallback.",
            fallbackError,
          );
          if (!cancelled) {
            if (messagesRef.current === null) {
              setLocaleLoadError(true);
            } else {
              setFeedback({
                key: "localeLoadFailed",
                parameters: { language: languageLabel },
              });
            }
          }
        }
      });
    return () => {
      cancelled = true;
    };
  }, [locale, setFeedback]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystemTheme = () =>
      setSystemTheme(mediaQuery.matches ? "dark" : "light");
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updateSystemTheme);
      return () => mediaQuery.removeEventListener("change", updateSystemTheme);
    }
    mediaQuery.addListener(updateSystemTheme);
    return () => mediaQuery.removeListener(updateSystemTheme);
  }, []);

  useLayoutEffect(() => {
    document.documentElement.lang = getIntlLocale(displayLocale);
    document.documentElement.dataset.theme = theme;
    const themeColor = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]',
    );
    if (themeColor) {
      themeColor.content =
        theme === "light" ? "#f2f6f1" : theme === "oled" ? "#000000" : "#0b1510";
    }
  }, [displayLocale, theme]);

  return {
    locale,
    displayLocale,
    messages,
    theme,
    t,
    localeLoadError,
  };
}
