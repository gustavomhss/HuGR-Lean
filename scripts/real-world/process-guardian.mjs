// Private IPC guardian. Only this live group leader may signal its current POSIX group.
import { execFile, spawn } from "node:child_process";
import { closeSync } from "node:fs";

const token = process.argv[2];
let launched = false, nativeSpawned = false, nativeExited = false, child;
const keepAlive = setInterval(() => {}, 1000);
const send = (message, callback) => {
  if (process.connected) process.send({ ...message, token }, callback);
  else callback?.();
};
const killError = (message) => send({ type: "killError", message });
const selfSignal = (signal) => {
  try { process.kill(-process.pid, signal); }
  catch (error) { killError(`${signal}: ${error.code}: ${error.message}`); }
};
process.on("SIGTERM", () => {}); // Remain group leader through graceful cleanup.
process.on("disconnect", () => {
  // Authority never transfers to a saved PID. Unexpected parent loss cleans our own group.
  if (process.platform !== "win32") selfSignal("SIGKILL");
  else if (nativeSpawned && !nativeExited) child.kill("SIGKILL");
  clearInterval(keepAlive);
  process.exit(1);
});
process.on("message", (message) => {
  if (message?.token !== token) return;
  if (message.type === "launch" && !launched) {
    launched = true;
    const started = process.hrtime.bigint();
    child = spawn(message.file, message.args, { cwd: message.cwd, env: message.env, stdio: ["ignore", 1, 2] });
    // Guardian must not hold capture pipes open after native child/descendants finish.
    closeSync(1); closeSync(2);
    child.once("spawn", () => {
      nativeSpawned = true;
      send({ type: "spawn", pid: child.pid, started: String(started) });
    });
    child.on("error", (error) => send({ type: nativeSpawned ? "killError" : "spawnError", message: `${error.code}: ${error.message}`, started: String(started) }));
    child.once("exit", (code, signal) => {
      nativeExited = true;
      send({ type: "exit", code, signal, elapsedMs: Number(process.hrtime.bigint() - started) / 1e6 });
    });
  } else if (message.type === "release") {
    clearInterval(keepAlive);
    process.exit(0);
  } else if (message.type === "cleanup" && launched) {
    if (process.platform === "win32") {
      // Windows has no pinned POSIX group. Never taskkill an expired native leader.
      if (!nativeSpawned || nativeExited) {
        killError("SETUP_TREE_CLEANUP_UNSUPPORTED: Windows leader already exited");
        send({ type: "cleanupDone" });
      } else {
        execFile("taskkill.exe", ["/pid", String(child.pid), "/T", "/F"], { env: message.env, timeout: 2000, windowsHide: true }, (error) => {
          if (error) {
            killError(`SETUP_TREE_CLEANUP_FAILED: ${error.message}`);
            try { child.kill("SIGKILL"); }
            catch (failure) { killError(`SIGKILL: ${failure.code}: ${failure.message}`); }
          }
          send({ type: "cleanupDone" });
        });
      }
    } else if (message.signal === "SIGTERM") selfSignal("SIGTERM");
    else if (message.signal === "SIGKILL") {
      // Send intent before self-kill; parent also requires actual guardian SIGKILL exit.
      send({ type: "escalating" }, () => selfSignal("SIGKILL"));
    }
  }
});
send({ type: "ready" });
