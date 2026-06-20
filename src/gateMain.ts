import { loadPyodide, type PyodideInterface } from "pyodide";

// Gate mode (URL ?gate=1): load Pyodide once and expose window.pyRun so the
// puppeteer harness can drive Python cases from an OFFLINE page. JS cases run
// via page.evaluate; TS is checked Node-side by the harness.
export async function startGate(): Promise<void> {
  const root = document.getElementById("root")!;
  root.innerHTML = '<p data-testid="gate-status">loading</p>';

  const pyodide: PyodideInterface = await loadPyodide({ indexURL: "/pyodide/" });

  (window as unknown as Record<string, unknown>).pyRun = (code: string) => {
    let out = "";
    pyodide.setStdout({ batched: (s: string) => (out += s + "\n") });
    try {
      pyodide.runPython(code);
      return { stdout: out.replace(/\n$/, ""), error: null };
    } catch (e) {
      return { stdout: out, error: e instanceof Error ? e.message : String(e) };
    }
  };

  (window as unknown as Record<string, unknown>).__GATE_READY__ = true;
  root.innerHTML = '<p data-testid="gate-status">ready</p>';
}
