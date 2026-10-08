import assert from "node:assert/strict";
import { ChildProcess } from "node:child_process";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

const timer = globalThis.setTimeout;
export async function boundedReadiness<T>(promise: Promise<T>, name: string): Promise<T> {
  let watchdog: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      watchdog = timer(() => reject(new Error(name)), 45000);
    })]);
  } finally { clearTimeout(watchdog); }
}

export async function waitForFile(file: string): Promise<string> {
  const end = Date.now() + 45000;
  while (Date.now() < end) {
    try { return await readFile(file, "utf8"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    await delay(10);
  }
  throw new Error(`BOUNDARY_READINESS_FILE_MISSING: ${file}`);
}

// Test-only seam: exact fixture spawn and named runProcess callback; no public process options.
export function boundaryDeadline(host: string, milliseconds: number) {
  const original = globalThis.setTimeout, emit = ChildProcess.prototype.emit;
  const handles: NodeJS.Timeout[] = [];
  let callback: (() => void) | undefined, count = 0, spawns = 0, fired = false;
  let stdout = "", stderr = "", exited = false;
  let registered!: () => void, observed!: () => void;
  const registration = new Promise<void>(resolve => { registered = resolve; });
  const readiness = new Promise<void>(resolve => { observed = resolve; });
  const check = () => {
    if (exited && stdout.includes("HUGR_HELD_STDOUT\n") && stderr.includes("HUGR_HELD_STDERR\n")) observed();
  };
  ChildProcess.prototype.emit = function (event: string | symbol, ...args: any[]) {
    if (event === "spawn" && this.spawnfile === process.execPath && this.spawnargs[1] === host) {
      assert.equal(++spawns, 1, "BOUNDARY_FIXTURE_SPAWN_COUNT");
      this.stdout!.on("data", chunk => { stdout += chunk.toString(); check(); });
      this.stderr!.on("data", chunk => { stderr += chunk.toString(); check(); });
      this.once("exit", (code, signal) => {
        exited = code === 0 && signal === null;
        check();
      });
    }
    return Reflect.apply(emit, this, [event, ...args]) as boolean;
  };
  globalThis.setTimeout = ((fn: (...args: any[]) => void, ms?: number, ...args: any[]) => {
    if (fn.name !== "beginBoundaryTimeout" || ms !== milliseconds) return original(fn, ms, ...args);
    count++; callback = () => fn(...args); registered();
    const handle = original(() => {}, 45000); handles.push(handle); return handle;
  }) as typeof setTimeout;
  return {
    get fired() { return fired; },
    get ready() { return exited && stdout.includes("HUGR_HELD_STDOUT\n") && stderr.includes("HUGR_HELD_STDERR\n"); },
    async registered() {
      await boundedReadiness(registration, "BOUNDARY_TIMEOUT_REGISTRATION_MISSING");
      assert.equal(count, 1, "BOUNDARY_TIMEOUT_SEAM_COUNT");
    },
    async fire(pidFile: string) {
      await this.registered();
      await boundedReadiness(readiness, "BOUNDARY_CHILD_PIPE_READINESS_MISSING");
      // Host writes this only after consuming the actual mock response and spawning its descendant.
      const held = JSON.parse(await waitForFile(pidFile)) as { pid: number; url: string };
      assert.ok(Number.isInteger(held.pid) && held.pid > 0);
      assert.match(held.url, /^http:\/\/127\.0\.0\.1:\d+\/v1\/chat\/completions$/);
      process.kill(held.pid, 0);
      assert.equal(fired, false); fired = true; callback!();
    },
    restore() {
      globalThis.setTimeout = original; ChildProcess.prototype.emit = emit;
      handles.forEach(clearTimeout);
      if (!fired) { fired = true; callback?.(); }
    },
  };
}
