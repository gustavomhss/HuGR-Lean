import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const helper = fileURLToPath(new URL("./case-workspace.py", import.meta.url));
const fail = (code, message = code, details = {}) => Object.assign(new Error(message), { code, ...details });
export function caseWorkspace(projectPath, changes) {
  let cwd = projectPath, workspace, attempted = false;
  return {
    get cwd() { return cwd; },
    get workspace() { return workspace; },
    async prepare() {
      if (attempted) throw fail("CASE_ALREADY_PREPARED");
      attempted = true;
      if (process.platform === "win32") throw fail("CASE_WORKSPACE_UNSUPPORTED");
      if (!Array.isArray(changes) || changes.some((c) => !c || typeof c.path !== "string" ||
          typeof c.text !== "string" || (c.append !== undefined && typeof c.append !== "boolean"))) {
        throw fail("CASE_INVALID_CHANGE");
      }
      const source = await realpath(projectPath);
      const input = JSON.stringify({ source, changes: changes.map((c) => ({
        path: c.path, append: c.append === true, bytes: Buffer.from(c.text, "utf8").toString("base64"),
      })) });
      const { error, stdout, stderr } = await new Promise((resolve) => {
        const env = Object.fromEntries(["PATH", "SystemRoot", "WINDIR"].filter((key) => process.env[key] !== undefined).map((key) => [key, process.env[key]]));
        const child = execFile("python3", ["-I", "-S", "-B", helper], {
          timeout: 120_000, maxBuffer: 1024 * 1024, encoding: "buffer", env,
        }, (error, stdout, stderr) => resolve({ error, stdout, stderr }));
        child.stdin.on("error", () => {}); // execFile's result retains process failure and both pipes.
        child.stdin.end(input);
      });
      for (const line of stderr.toString("utf8").split("\n")) {
        try { const record = JSON.parse(line); if (record.workspace) workspace = record.workspace; }
        catch {} // Raw stderr remains attached to failures below.
      }
      const details = { stdout, stderr, workspace };
      if (error) throw fail(error.code ?? "CASE_HELPER_FAILED", `CASE_HELPER_FAILED: ${error.message}`, { ...details, cause: error });
      let result;
      try { result = JSON.parse(stdout.toString("utf8")); }
      catch (cause) { throw fail("CASE_HELPER_PROTOCOL", "CASE_HELPER_PROTOCOL", { ...details, cause }); }
      if (!result || typeof result.ok !== "boolean") throw fail("CASE_HELPER_PROTOCOL", "CASE_HELPER_PROTOCOL", details);
      workspace = result.workspace ?? workspace;
      if (!result.ok) throw fail(result.error?.code ?? "CASE_HELPER_FAILED", result.error?.message ?? "CASE_HELPER_FAILED", { ...details, workspace });
      if (!workspace?.cwd || workspace.source !== source || workspace.retained !== true || workspace.sourceReadOnly !== true) {
        throw fail("CASE_HELPER_PROTOCOL", "CASE_HELPER_PROTOCOL", { ...details, workspace });
      }
      cwd = workspace.cwd;
    },
    async restore() { cwd = projectPath; },
  };
}
