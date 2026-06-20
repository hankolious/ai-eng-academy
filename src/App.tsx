import { usePyodide } from "./usePyodide";

export default function App() {
  const { status, output, cold, error } = usePyodide();

  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        maxWidth: 560,
        margin: "4rem auto",
        padding: "0 1rem",
        lineHeight: 1.5,
      }}
    >
      <h1>Pyodide Offline Spike</h1>
      <p style={{ color: "#666" }}>
        Locally bundled Pyodide. No backend, no network fetch. Reload with the
        network disabled — the service worker serves everything from cache.
      </p>

      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: 8,
          padding: "1rem 1.25rem",
          background: "#fafafa",
        }}
      >
        <div>
          <strong>Status:</strong>{" "}
          <span data-testid="status">{status}</span>
        </div>

        <div style={{ marginTop: "0.5rem" }}>
          <strong>Output of</strong> <code>print("hi")</code>:
          <pre
            data-testid="output"
            style={{
              background: "#111",
              color: "#0f0",
              padding: "0.75rem",
              borderRadius: 6,
              minHeight: "1.5rem",
              margin: "0.5rem 0 0",
            }}
          >
            {output || (status === "ready" ? "(empty)" : "…")}
          </pre>
        </div>

        <div style={{ marginTop: "0.75rem" }}>
          <strong>Cold-start:</strong>{" "}
          <span data-testid="coldstart">
            {cold ? `${cold.ms.toFixed(1)} ms` : "—"}
          </span>
        </div>

        {error && (
          <div style={{ marginTop: "0.75rem", color: "#b00" }}>
            <strong>Error:</strong> <span data-testid="error">{error}</span>
          </div>
        )}
      </section>
    </main>
  );
}
