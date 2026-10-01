import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

export const sha256 = (data) => createHash("sha256").update(data).digest("hex");

/** Capture once. durationMs ends at pipe close/launch failure/bounded timeout cleanup,
 * before log drain, concatenation and decoding; exitDurationMs separately observes leader exit.
 * bookkeepingMs measures the remaining drain/decode work, not native command execution. */
export async function captureCommand(spec, env, { timeout = 600000, logDir } = {}) {
  if (process.platform === "win32") throw new Error("NATIVE_CAPTURE_REQUIRES_POSIX_SHELL");
  if (typeof spec.command !== "string" || !spec.command.length || !path.isAbsolute(spec.cwd)) throw new Error("INVALID_NATIVE_CASE");
  if (!Number.isSafeInteger(timeout) || timeout < 1) throw new Error("INVALID_CAPTURE_TIMEOUT");
  const stdout = [], stderr = [], merged = [];
  let pending = Promise.resolve(), logError;
  if (logDir) {
    await mkdir(logDir, { recursive: true });
    for (const name of ["stdout", "stderr", "original"]) await writeFile(path.join(logDir, `${name}.live`), "");
  }
  const retain = (name, chunk) => {
    if (logDir) pending = pending.then(() => Promise.all([appendFile(path.join(logDir, `${name}.live`), chunk), appendFile(path.join(logDir, "original.live"), chunk)]))
      .catch((error) => { logError ??= error; });
  };
  const started = performance.now();
  let timedOut = false, code = null, signal = null, launchError, durationMs, durationBoundary, exitDurationMs;
  const killErrors = [];
  const child = spawn("/bin/sh", ["-c", spec.command], { cwd: spec.cwd, env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  if (logDir) pending = pending.then(() => writeFile(path.join(logDir, "running.json"), JSON.stringify({ state: "capturing", command: spec.command, cwd: spec.cwd, pid: child.pid, startedAt: new Date().toISOString() })))
    .catch((error) => { logError ??= error; });
  const result = await new Promise((resolve) => {
    let finished = false, closed = false, cleanupDone = false, groupGone = false, escalation, settlement;
    const stop = (kind) => {
      if (!child.pid || groupGone) return;
      try { process.kill(-child.pid, kind); }
      catch (error) {
        if (error.code === "ESRCH") groupGone = true; // Never target a recycled group after known absence.
        else killErrors.push(`${kind}: ${error.code}: ${error.message}`);
      }
    };
    const finish = (boundary) => {
      if (finished) return; finished = true;
      durationMs = performance.now() - started; durationBoundary = boundary;
      clearTimeout(timer); clearTimeout(escalation); clearTimeout(settlement);
      resolve({ code, signal });
    };
    const timer = setTimeout(() => {
      timedOut = true; stop("SIGTERM");
      escalation = setTimeout(() => {
        stop("SIGKILL"); cleanupDone = true;
        child.stdout.destroy(); child.stderr.destroy();
        if (closed) finish("timeout-cleanup");
        else settlement = setTimeout(() => finish("bounded-timeout-settlement"), 250);
      }, 2000);
    }, timeout);
    child.stdout.on("data", (chunk) => { stdout.push(chunk); merged.push(chunk); retain("stdout", chunk); });
    child.stderr.on("data", (chunk) => { stderr.push(chunk); merged.push(chunk); retain("stderr", chunk); });
    child.on("error", (error) => { launchError = `${error.code}: ${error.message}`; if (!timedOut) finish("launch-error"); });
    child.on("exit", (value, valueSignal) => { code = value; signal = valueSignal; exitDurationMs = performance.now() - started; });
    child.on("close", () => {
      closed = true;
      // Keep escalation alive after leader close; only exit supplies native facts.
      if (!timedOut || cleanupDone) finish(timedOut ? "timeout-cleanup" : "pipe-close");
    });
  });
  await pending;
  if (logError) throw new Error(`CAPTURE_LOG_FAILED: ${logError.message}`);
  const bytes = Buffer.concat(merged);
  let output, encodingError;
  try { output = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch (error) { encodingError = error.message; }
  const stdoutBytes = Buffer.concat(stdout), stderrBytes = Buffer.concat(stderr);
  const bookkeepingMs = performance.now() - started - durationMs;
  return { command: spec.command, cwd: spec.cwd, exitCode: result.code, signal: result.signal, timedOut,
    complete: !timedOut && !launchError && Number.isSafeInteger(result.code) && result.signal === null,
    durationMs, durationBoundary, exitDurationMs, bookkeepingMs,
    durationDefinition: "spawn start to pipe close, launch failure or bounded timeout cleanup settlement; excludes log drain and decoding",
    output, encodingError, launchError, ...(killErrors.length ? { killErrors } : {}),
    raw: bytes, stdout: stdoutBytes, stderr: stderrBytes, captureDefinition: "stdout/stderr arrival order; no text rewriting" };
}

/** Archive every capture, including failed/partial output; compression is outside measurement. */
export async function archiveCapture(directory, capture, filtered) {
  await mkdir(directory, { recursive: true });
  const artifacts = {};
  for (const [name, bytes] of [["original", capture.raw], ["stdout", capture.stdout], ["stderr", capture.stderr], ...(filtered === undefined ? [] : [["filtered", Buffer.from(filtered)]])]) {
    const file = `${name}.txt.gz`;
    await writeFile(path.join(directory, file), gzipSync(bytes, { level: 6 }));
    artifacts[name] = { file, bytes: bytes.length, sha256: sha256(bytes), compression: "gzip; original bytes recover exactly" };
  }
  return artifacts;
}
