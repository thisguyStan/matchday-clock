export function isStandaloneDisplay(): boolean {
  const navigatorWithStandalone = navigator as Navigator & {
    standalone?: boolean;
  };
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    navigatorWithStandalone.standalone === true
  );
}

export function getInstallPlatform(): "ios" | "android" | "other" {
  const userAgent = navigator.userAgent;
  const isIOS =
    /iPad|iPhone|iPod/i.test(userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isIOS) {
    return "ios";
  }
  return /Android/i.test(userAgent) ? "android" : "other";
}
