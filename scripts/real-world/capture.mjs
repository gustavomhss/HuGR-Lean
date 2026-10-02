import { createHash } from "node:crypto";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { runOwnedProcess } from "./owned-process.mjs";

export const sha256 = (data) => createHash("sha256").update(data).digest("hex");

/** Capture once. durationMs starts at native spawn inside guardian, ends at pipe close/launch failure/bounded timeout cleanup,
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
  const result = await runOwnedProcess("/bin/sh", ["-c", spec.command], {
    cwd: spec.cwd, env, timeout,
    onSpawn: (pid) => {
      if (logDir) pending = pending.then(() => writeFile(path.join(logDir, "running.json"), JSON.stringify({ state: "capturing", command: spec.command, cwd: spec.cwd, pid, startedAt: new Date().toISOString() })))
        .catch((error) => { logError ??= error; });
    },
    onStdout: (chunk) => { stdout.push(chunk); merged.push(chunk); retain("stdout", chunk); },
    onStderr: (chunk) => { stderr.push(chunk); merged.push(chunk); retain("stderr", chunk); },
  });
  const { timedOut, spawnError: launchError, durationMs, durationBoundary, exitDurationMs, killErrors } = result;
  const bookkeepingStarted = performance.now();
  await pending;
  if (logError) throw new Error(`CAPTURE_LOG_FAILED: ${logError.message}`);
  const bytes = Buffer.concat(merged);
  let output, encodingError;
  try { output = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch (error) { encodingError = error.message; }
  const stdoutBytes = Buffer.concat(stdout), stderrBytes = Buffer.concat(stderr);
  const bookkeepingMs = performance.now() - bookkeepingStarted;
  return { command: spec.command, cwd: spec.cwd, exitCode: result.code, signal: result.signal, timedOut,
    nativeSpawned: result.nativeSpawned, nativeExitObserved: result.nativeExitObserved,
    complete: !timedOut && !launchError && !killErrors.length && Number.isSafeInteger(result.code) && result.signal === null,
    durationMs, durationBoundary, exitDurationMs, bookkeepingMs,
    durationDefinition: "native spawn start inside guardian to pipe close, launch failure, guardian loss or bounded timeout cleanup settlement; excludes guardian startup, log drain and decoding",
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
