import { useCallback, useEffect, useRef, useState } from "react";
import { loadPyodide, type PyodideInterface } from "pyodide";
import { timed, type ColdStart } from "./metrics";

export type Status = "idle" | "loading" | "ready" | "error";

export interface PyodideState {
  status: Status;
  output: string;
  cold: ColdStart | null;
  error: string | null;
}

// Loads Pyodide from same-origin /pyodide/ assets (copied from node_modules at
// build time), runs print("hi"), and reports the cold-start time. No network.
export function usePyodide(): PyodideState {
  const [state, setState] = useState<PyodideState>({
    status: "idle",
    output: "",
    cold: null,
    error: null,
  });
  const started = useRef(false);

  const run = useCallback(async () => {
    setState((s) => ({ ...s, status: "loading" }));
    let stdout = "";
    try {
      const { cold } = await timed("cold-start", async () => {
        const pyodide: PyodideInterface = await loadPyodide({
          indexURL: "/pyodide/",
          stdout: (line) => {
            stdout += line + "\n";
          },
        });
        pyodide.runPython('print("hi")');
        return null;
      });
      setState({
        status: "ready",
        output: stdout.trimEnd(),
        cold: cold,
        error: null,
      });
    } catch (err) {
      setState({
        status: "error",
        output: stdout,
        cold: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run();
  }, [run]);

  return state;
}
