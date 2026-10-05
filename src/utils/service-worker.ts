export function waitForServiceWorkerControl(): Promise<void> {
  if (!("serviceWorker" in navigator) || navigator.serviceWorker.controller) {
    return Promise.resolve();
  }

  const serviceWorker = navigator.serviceWorker;
  return new Promise((resolve) => {
    let timeoutId: number | undefined;
    const finish = () => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
      serviceWorker.removeEventListener("controllerchange", finish);
      resolve();
    };

    serviceWorker.addEventListener("controllerchange", finish, { once: true });
    timeoutId = window.setTimeout(finish, 3000);
    if (serviceWorker.controller) {
      finish();
    }
  });
}
