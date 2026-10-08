import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { runWindowsProcess } from "./windows-process.mjs";

/** Run literal native executable/argv through a pinned group leader and private authenticated IPC.
 * Numeric PIDs are facts only, never cleanup authority. Pipes carry inherited native bytes.
 * Native duration excludes guardian startup and post-boundary bookkeeping. */
export function runOwnedProcess(file, args, { cwd, env, timeout, onStdout, onStderr, onSpawn, onExit } = {}) {
  if (process.platform === "win32") return runWindowsProcess(file, args, { cwd, env, timeout, onStdout, onStderr, onSpawn, onExit });
  return new Promise((resolve) => {
    const token = randomUUID(), start = process.hrtime.bigint();
    // Native env travels over IPC unchanged. Guardian must not execute native NODE_OPTIONS twice.
    const guardianEnv = Object.fromEntries(["SystemRoot", "WINDIR"].filter((key) => env?.[key] !== undefined).map((key) => [key, env[key]]));
    const guardian = spawn(process.execPath, [fileURLToPath(new URL("./process-guardian.mjs", import.meta.url)), token], {
      env: guardianEnv, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    let authority = true, finished = false, spawned = false, failedSpawn = false, nativeExited = false;
    let pipes = 0, timedOut = false, cleanupDone = false, escalating = false, escalationRequested = false, nativeStart;
    let code = null, signal = null, spawnError, exitDurationMs, timer, escalation, settlement;
    const killErrors = [];
    const elapsed = () => nativeStart === undefined ? null : Number(process.hrtime.bigint() - nativeStart) / 1e6;
    const send = (message) => {
      if (!authority || !guardian.connected) return false;
      try { guardian.send({ ...message, token }, (error) => { if (error && !finished) lose(`GUARDIAN_CHANNEL_LOST: ${error.message}`); }); }
      catch (error) { lose(`GUARDIAN_CHANNEL_LOST: ${error.message}`); return false; }
      return true;
    };
    const finish = (durationBoundary) => {
      if (finished) return;
      finished = true;
      const durationMs = elapsed(); // Before IPC release, log drain or decoding.
      const guardianElapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
      clearTimeout(timer); clearTimeout(escalation); clearTimeout(settlement);
      send({ type: "release" });
      authority = false;
      resolve({ code, signal, nativeSpawned: spawned, nativeExitObserved: nativeExited, timedOut, spawnError, killErrors, durationMs, guardianElapsedMs, durationBoundary, exitDurationMs });
    };
    const maybeFinish = () => {
      if (pipes !== 2 || (!nativeExited && !failedSpawn)) return;
      if (!timedOut || cleanupDone) finish(timedOut ? "timeout-cleanup" : failedSpawn ? "launch-error" : "pipe-close");
    };
    const boundCleanup = () => {
      cleanupDone = true;
      guardian.stdout.destroy(); guardian.stderr.destroy();
      maybeFinish();
      if (!finished) settlement = setTimeout(() => finish("bounded-timeout-settlement"), 250);
    };
    const lose = (message) => {
      if (!authority || finished) return;
      authority = false;
      killErrors.push(message);
      if (guardian.connected) guardian.disconnect(); // Guardian cleans its own group, never a parent PID fallback.
      guardian.stdout.destroy(); guardian.stderr.destroy();
      finish("guardian-loss");
    };
    const beginTimeout = () => {
      timedOut = true;
      if (!send({ type: "cleanup", signal: "SIGTERM", env })) { lose("GUARDIAN_CHANNEL_LOST: cleanup unavailable"); return; }
      if (process.platform !== "win32") escalation = setTimeout(() => {
        escalationRequested = true;
        send({ type: "cleanup", signal: "SIGKILL" });
        settlement = setTimeout(() => {
          killErrors.push("GUARDIAN_CLEANUP_UNCONFIRMED: escalation did not terminate guardian");
          boundCleanup();
        }, 250);
      }, 2000);
      else settlement = setTimeout(() => { killErrors.push("SETUP_TREE_CLEANUP_FAILED: guardian response timeout"); boundCleanup(); }, 2500);
    };
    timer = setTimeout(() => lose("GUARDIAN_STARTUP_TIMEOUT: native launch facts unavailable"), 5000);
    guardian.stdout.on("data", (chunk) => onStdout?.(chunk));
    guardian.stderr.on("data", (chunk) => onStderr?.(chunk));
    for (const stream of [guardian.stdout, guardian.stderr]) stream.once("close", () => { pipes++; maybeFinish(); });
    guardian.on("message", (message) => {
      if (!authority || message?.token !== token) return;
      if (message.type === "ready") send({ type: "launch", file, args, cwd, env });
      else if (message.type === "spawn") {
        spawned = true; nativeStart = BigInt(message.started);
        clearTimeout(timer); timer = setTimeout(beginTimeout, Math.max(1, timeout - elapsed()));
        onSpawn?.(message.pid);
      } else if (message.type === "spawnError") {
        if (spawned) killErrors.push(message.message);
        else { failedSpawn = true; spawnError = message.message; nativeStart = BigInt(message.started); maybeFinish(); }
      } else if (message.type === "exit") {
        nativeExited = true; code = message.code; signal = message.signal; exitDurationMs = message.elapsedMs;
        onExit?.(code, signal); maybeFinish();
      } else if (message.type === "killError") killErrors.push(message.message);
      else if (message.type === "escalating") {
        if (escalationRequested) escalating = true;
        else lose("GUARDIAN_PROTOCOL_FAILED: unsolicited escalation");
      }
      else if (message.type === "cleanupDone") boundCleanup();
    });
    guardian.on("error", (error) => lose(`GUARDIAN_FAILED: ${error.code}: ${error.message}`));
    guardian.once("exit", (guardianCode, guardianSignal) => {
      if (finished) return;
      if (timedOut && escalating && guardianSignal === "SIGKILL") {
        authority = false; clearTimeout(settlement); boundCleanup();
      } else lose(`GUARDIAN_LOST: code=${guardianCode} signal=${guardianSignal}`);
    });
    guardian.once("disconnect", () => {
      if (!finished && !escalating) lose("GUARDIAN_CHANNEL_LOST: disconnected");
      authority = false;
    });
  });
}
