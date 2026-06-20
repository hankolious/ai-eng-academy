import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

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

// ?gate=1 boots the P1 gate harness page instead of the normal app.
const isGate = new URLSearchParams(location.search).get("gate") === "1";
if (isGate) {
  void import("./gateMain").then((m) => m.startGate());
} else {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
