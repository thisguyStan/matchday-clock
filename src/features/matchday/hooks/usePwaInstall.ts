import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  getInstallPlatform,
  isStandaloneDisplay,
} from "../../../utils/pwa";
import type { LocalizedMessage, BeforeInstallPromptEvent } from "../types";

interface UsePwaInstallResult {
  standalone: boolean;
  installDismissed: boolean;
  setInstallDismissed: (dismissed: boolean) => void;
  installPlatform: "ios" | "android" | "other";
  handleInstall: () => Promise<void>;
}

export function usePwaInstall(
  onShowInstallHelp: () => void,
  setFeedback: Dispatch<SetStateAction<LocalizedMessage | null>>,
): UsePwaInstallResult {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(isStandaloneDisplay);
  const [installDismissed, setInstallDismissed] = useState(false);
  const installPlatform = getInstallPlatform();

  useEffect(() => {
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const updateStandalone = () => setStandalone(isStandaloneDisplay());
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleAppInstalled = () => {
      setStandalone(true);
      setInstallPrompt(null);
      setInstallDismissed(true);
    };

    if (typeof displayMode.addEventListener === "function") {
      displayMode.addEventListener("change", updateStandalone);
    } else {
      displayMode.addListener(updateStandalone);
    }
    window.addEventListener(
      "beforeinstallprompt",
      handleBeforeInstallPrompt,
    );
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      if (typeof displayMode.removeEventListener === "function") {
        displayMode.removeEventListener("change", updateStandalone);
      } else {
        displayMode.removeListener(updateStandalone);
      }
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (installPrompt === null) {
      onShowInstallHelp();
      return;
    }

    try {
      const prompt = installPrompt;
      await prompt.prompt();
      const choice = await prompt.userChoice;
      setInstallPrompt(null);
      if (choice.outcome === "accepted") {
        setInstallDismissed(true);
      }
    } catch (error) {
      console.error("Could not open the PWA installation prompt.", error);
      setFeedback({ key: "installFailed" });
    }
  }, [installPrompt, onShowInstallHelp, setFeedback]);

  return {
    standalone,
    installDismissed,
    setInstallDismissed,
    installPlatform,
    handleInstall,
  };
}
