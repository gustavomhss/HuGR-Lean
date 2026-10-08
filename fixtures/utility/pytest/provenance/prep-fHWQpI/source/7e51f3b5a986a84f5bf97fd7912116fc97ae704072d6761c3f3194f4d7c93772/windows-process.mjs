import { spawn } from "node:child_process";

/** Windows setup only: native ChildProcess handles, never retained PID/taskkill authority.
 * Node has no authenticated tree capability here. Timeout always reports that missing capability;
 * killing a live leader handle is only a fallback. POSIX native capture uses the group guardian. */
export function runWindowsProcess(file, args, { cwd, env, timeout, onStdout, onStderr, onSpawn, onExit }) {
  return new Promise((resolve) => {
    const started = process.hrtime.bigint(), child = spawn(file, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let nativeSpawned = false, nativeExitObserved = false, timedOut = false, finished = false, failedSpawn = false, pipes = 0;
    let code = null, signal = null, spawnError, exitDurationMs, settlement;
    const killErrors = [], elapsed = () => Number(process.hrtime.bigint() - started) / 1e6;
    const finish = (durationBoundary) => {
      if (finished) return;
      finished = true;
      const durationMs = elapsed(); // Before log drain and decoding.
      clearTimeout(timer); clearTimeout(settlement);
      resolve({ code, signal, nativeSpawned, nativeExitObserved, timedOut, spawnError, killErrors, durationMs, durationBoundary, exitDurationMs });
    };
    const maybeFinish = () => {
      if (pipes === 2 && (nativeExitObserved || failedSpawn)) finish(timedOut ? "timeout-cleanup" : failedSpawn ? "launch-error" : "pipe-close");
    };
    const timer = setTimeout(() => {
      timedOut = true;
      killErrors.push("SETUP_TREE_CLEANUP_UNSUPPORTED: authenticated Windows tree identity unavailable");
      if (nativeSpawned && !nativeExitObserved) {
        try { child.kill("SIGKILL"); } // Uses live Windows process handle, not a numeric tree lookup.
        catch (error) { killErrors.push(`SIGKILL: ${error.code}: ${error.message}`); }
      }
      child.stdout.destroy(); child.stderr.destroy();
      settlement = setTimeout(() => finish("bounded-timeout-settlement"), 250);
      maybeFinish();
    }, timeout);
    child.stdout.on("data", (chunk) => onStdout?.(chunk));
    child.stderr.on("data", (chunk) => onStderr?.(chunk));
    for (const stream of [child.stdout, child.stderr]) stream.once("close", () => { pipes++; maybeFinish(); });
    child.once("spawn", () => { nativeSpawned = true; onSpawn?.(child.pid); });
    child.on("error", (error) => {
      if (nativeSpawned) killErrors.push(`${error.code}: ${error.message}`);
      else { failedSpawn = true; spawnError = `${error.code}: ${error.message}`; maybeFinish(); }
    });
    child.once("exit", (value, valueSignal) => {
      if (finished) return;
      nativeExitObserved = true; code = value; signal = valueSignal; exitDurationMs = elapsed();
      onExit?.(code, signal); maybeFinish();
    });
  });
}
