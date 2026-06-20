import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Register the cache-first service worker so the second start works offline.
// Only in production builds — the dev server doesn't serve hashed assets.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => console.log("[sw] registered", reg.scope))
      .catch((err) => console.error("[sw] registration failed", err));
  });
}
