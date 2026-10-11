#!/usr/bin/env node
/**
 * Real browser host proof bridge. Installs the packed candidate, then for each case launches a fresh isolated
 * headless browser (own --user-data-dir, local page only), sets the page state over CDP, and runs the real
 * OpenCode host through runHostCase with a plain plugin entry and one native MCP producer attached to that
 * browser. Every flag is required: nothing falls back to a user browser, profile or temporary directory.
 * Original MIT harness; producers are executed unmodified from operator-supplied paths.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, openSync } from "node:fs";
import { access, mkdir, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CDP_CODE, PAGE } from "./automatic-browser-capture.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const FLAGS = ["output", "playwright", "devtools", "executable", "opencode", "sdk", "sockets", "timeout"];
const USAGE = `Usage: node scripts/automatic-browser-host-proof.mjs ${FLAGS.map((f) => `--${f} <value>`).join(" ")} [--cases a,b]
  --playwright  installed playwright/cli.js     --devtools  chrome-devtools-mcp build/src/bin/chrome-devtools-mcp.js
  --executable  headless Chromium executable    --opencode  real OpenCode binary    --sdk  pinned @opencode-ai/plugin dir
  --output      durable artifact root (not under the OS temp dir)    --timeout  per-case deadline in ms
  --sockets     short existing directory for Playwright IPC sockets (PWTEST_SOCKETS_DIR; macOS sun_path limit)`;
const EVALUATE = '() => ({title: document.title, inputs: Array.from(document.querySelectorAll("input")).map(e => ({type:e.type,value:e.value,checked:e.checked,disabled:e.disabled}))})';
// Failure source carries e42: the harness requires the failure marker to reach the model unchanged.
const FAILING = '() => { throw new Error("Owned intentional failure e42 — 雪"); }';
export const CASES = {
  "pw-before": { producer: "playwright", state: "before", kind: "snapshot", tool: "browser_snapshot", args: {} },
  "dt-before": { producer: "devtools", state: "before", kind: "snapshot", tool: "take_snapshot", args: { pageId: 1 } },
  "pw-modal": { producer: "playwright", state: "modal", kind: "snapshot", tool: "browser_snapshot", args: {} },
  "dt-modal": { producer: "devtools", state: "modal", kind: "snapshot", tool: "take_snapshot", args: { pageId: 1 } },
  "pw-json": { producer: "playwright", state: "before", kind: "mcp-json", tool: "browser_evaluate", args: { function: EVALUATE } },
  "pw-ax": { producer: "playwright", state: "before", kind: "mcp-json", tool: "browser_run_code_unsafe", args: { code: CDP_CODE } },
  "pw-unknown": { producer: "playwright", state: "before", kind: "unknown", tool: "browser_tabs", args: { action: "list" } },
  "pw-partial": { producer: "playwright", state: "before", kind: "unknown", tool: "browser_snapshot", args: { depth: 1 } },
  "pw-error": { producer: "playwright", state: "before", kind: "mcp-error", tool: "browser_evaluate", args: { function: FAILING } },
};

export function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, "");
    if (![...FLAGS, "cases"].includes(key) || !argv[i + 1] || argv[i + 1].startsWith("--")) throw new Error(`Bad flag ${argv[i]}\n${USAGE}`);
    if (key in flags) throw new Error(`Duplicate flag --${key}`);
    flags[key] = argv[i + 1];
  }
  const missing = FLAGS.filter((f) => !flags[f]);
  if (missing.length) throw new Error(`Missing required ${missing.map((f) => `--${f}`).join(" ")}\n${USAGE}`);
  flags.timeout = Number(flags.timeout);
  assert.ok(Number.isSafeInteger(flags.timeout) && flags.timeout > 0, "--timeout must be a positive integer (ms)");
  flags.cases = flags.cases ? flags.cases.split(",") : Object.keys(CASES);
  for (const name of flags.cases) assert.ok(CASES[name], `Unknown case ${name}; known: ${Object.keys(CASES).join(",")}`);
  for (const key of FLAGS.filter((f) => f !== "timeout")) flags[key] = path.resolve(flags[key]);
  return flags;
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fileHash = async (file) => sha256(await readFile(file));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function capture(binary, args, cwd = ROOT) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd, stdio: ["ignore", "pipe", "pipe"] }), out = [], err = [];
    child.stdout.on("data", (d) => out.push(d)); child.stderr.on("data", (d) => err.push(d));
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve(Buffer.concat(out).toString("utf8")) : reject(new Error(`${binary} ${args.join(" ")}: ${code} ${Buffer.concat(err)}`)));
  });
}

/** Minimal CDP client for one page target: request/response only, bounded per call. */
async function pageSession(port) {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const pages = targets.filter((t) => t.type === "page");
  assert.equal(pages.length, 1, "Isolated browser must expose exactly one page target");
  const ws = new WebSocket(pages[0].webSocketDebuggerUrl), pending = new Map(); let next = 0;
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error("CDP socket failed")); });
  ws.onmessage = ({ data }) => { const message = JSON.parse(data); pending.get(message.id)?.(message); pending.delete(message.id); };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++next, timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 30000);
    pending.set(id, (m) => { clearTimeout(timer); m.error ? reject(new Error(`${method}: ${JSON.stringify(m.error)}`)) : resolve(m.result); });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression, userGesture = false) => {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture });
    if (result.exceptionDetails) throw new Error(`Page evaluation failed: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`);
    return result.result.value;
  };
  return { send, evaluate, target: pages[0], close: () => ws.close() };
}

async function launchBrowser(executable, dir, url, state) {
  const profile = path.join(dir, "profile"); await mkdir(profile, { recursive: true });
  const argv = ["--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check",
    "--disable-background-networking", "--disable-component-update", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1", "about:blank"];
  const log = openSync(path.join(dir, "browser-stderr"), "w");
  const child = spawn(executable, argv, { detached: true, stdio: ["ignore", log, log] }); closeSync(log);
  let exited = false; child.once("exit", () => { exited = true; });
  const stop = async () => {
    try { process.kill(-child.pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; }
    for (let i = 0; i < 50 && !exited; i++) await delay(100);
  };
  try {
    let port;
    for (let i = 0; i < 300 && !port; i++) {
      assert.equal(exited, false, "Browser exited during startup");
      port = await readFile(path.join(profile, "DevToolsActivePort"), "utf8").then((s) => s.split("\n")[0]).catch(() => undefined);
      if (!port) await delay(100);
    }
    assert.ok(/^\d+$/.test(port ?? ""), "Browser did not publish DevToolsActivePort within 30 s");
    const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    const page = await pageSession(port);
    try {
      await page.send("Page.navigate", { url });
      let ready = false;
      for (let i = 0; i < 300 && !ready; i++) {
        ready = await page.evaluate(`location.href === ${JSON.stringify(url)} && document.readyState === "complete" && typeof document.querySelector("#open")?.onclick === "function"`);
        if (!ready) await delay(100);
      }
      assert.ok(ready, "Owned page did not finish loading");
      if (state === "modal") await page.evaluate('document.querySelector("#open").click()', true);
      const observed = await page.evaluate('({url: location.href, focused: document.activeElement.id, modal: document.querySelector("dialog").open})');
      assert.deepEqual(observed, { url, focused: state === "modal" ? "focus" : "", modal: state === "modal" }, "Page state not established");
      await writeFile(path.join(dir, "browser.json"), JSON.stringify({ executable, argv, pid: child.pid, port, version, target: page.target, state, observed }, null, 2));
      return { port, version, argv, observed, stop };
    } finally { page.close(); }
  } catch (error) { await stop(); throw error; }
}

// timeout: OpenCode's MCP connect/tool-listing bound; its short default dropped a producer under load average ~180.
function mcpConfig(flags, producer, endpoint, dir) {
  if (producer === "playwright") return { playwright: { type: "local", enabled: true, timeout: 60000, environment: { PWTEST_SOCKETS_DIR: flags.socketDir },
    command: [process.execPath, flags.playwright, "mcp", "--cdp-endpoint", endpoint, "--output-dir", path.join(dir, "producer-output")] } };
  return { devtools: { type: "local", enabled: true, timeout: 60000, environment: { CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS: "1", CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: "1" },
    command: [process.execPath, flags.devtools, "--browserUrl", endpoint, "--no-usage-statistics", "--no-performance-crux"] } };
}

const blockText = (output) => Array.isArray(output?.content)
  ? output.content.flatMap((b) => b.type === "text" ? [b.text] : []).join("\n\n") : output?.output;
/** Ref/UID rows before (native) and after (ref-leading), plus top-level rows of the snapshot body. */
export function snapshotCounts(before, after, tool) {
  if (tool === "take_snapshot") {
    const rows = (text, pattern) => text.split("\n").filter((row) => pattern.test(row));
    const source = rows(before, /^ *uid=\d+_\d+ /), view = rows(after, /^ *\d+_\d+ /);
    return { refs: source.length, refsAfter: view.length, roots: source.filter((r) => r.startsWith("uid=")).length };
  }
  const body = (text, fence) => { const start = text.indexOf(fence) + fence.length; return text.slice(start, text.indexOf("\n```", start)).split("\n"); };
  const source = body(before, "```yaml\n"), view = body(after, "```text\n");
  return { refs: source.filter((r) => /\[ref=(?:e\d+|f\d+e\d+)\]/.test(r)).length,
    refsAfter: view.filter((r) => /^ *(?:e\d+|f\d+e\d+) /.test(r)).length, roots: source.filter((r) => r.startsWith("- ")).length };
}

/** Anti-vacuity: the same oracle must reject the real hook output with one value changed. */
function teeth(assertObservation, report, expected) {
  const [before, after] = report.hooks, changed = blockText(after.output);
  assert.ok(changed.includes("東京"), "Teeth probe needs the owned 東京 value in the view");
  const tampered = structuredClone(after), text = changed.replace("東京", "Tokyo");
  if (Array.isArray(tampered.output.content)) tampered.output.content = tampered.output.content.map((b) => b.type === "text" ? { ...b, text: b.text.replace("東京", "Tokyo") } : b);
  else tampered.output.output = text;
  assert.throws(() => assertObservation(before, tampered, { content: text }, expected), "Oracle accepted a tampered view");
}

function metrics(name, spec, report) {
  const result = report.result.content, before = report.hooks[0] ? blockText(report.hooks[0].output) : result;
  const entry = { inputBytes: Buffer.byteLength(before), outputBytes: Buffer.byteLength(result) };
  entry.savedBytes = entry.inputBytes - entry.outputBytes;
  if (spec.kind === "snapshot") {
    Object.assign(entry, snapshotCounts(before, result, spec.tool));
    assert.equal(entry.refsAfter, entry.refs, `${name}: ref count changed`);
    if (spec.state === "modal") assert.ok(/dialog/.test(result), `${name}: modal dialog missing`);
  }
  if (name === "pw-ax") {
    const nodes = JSON.parse(before.slice("### Result\n".length, before.indexOf("\n### Ran Playwright code\n"))).accessibility.nodes;
    assert.ok(result.includes('"cellEncoding":"optional"'), "pw-ax: CDP AX table view not applied");
    Object.assign(entry, { axNodes: nodes.length, roots: nodes.filter((n) => !("parentId" in n)).length });
  }
  return entry;
}

async function attempt(context, name, ordinal) {
  const { flags, run, url, runHostCase, assertObservation, plugin } = context, spec = CASES[name];
  const dir = path.join(run, `${name}-${ordinal}`); await mkdir(dir);
  const entry = { case: name, attempt: ordinal, dir, producer: spec.producer, tool: `${spec.producer}_${spec.tool}`, args: spec.args, kind: spec.kind };
  let browser;
  try {
    browser = await launchBrowser(flags.executable, dir, url, spec.state);
    Object.assign(entry, { browserVersion: browser.version.Browser, pageState: browser.observed });
    const mcp = mcpConfig(flags, spec.producer, `http://127.0.0.1:${browser.port}`, dir);
    entry.mcpCommand = Object.values(mcp)[0].command;
    const report = await runHostCase({ binary: flags.opencode, dependencies: flags.sdk, plugin, timeout: flags.timeout,
      kind: spec.kind, mcp, toolName: entry.tool, toolArgs: spec.args });
    entry.root = report.root; entry.requests = report.requests;
    Object.assign(entry, metrics(name, spec, report));
    if (spec.kind === "snapshot" || spec.kind === "mcp-json") teeth(assertObservation, report, spec.kind === "snapshot" ? "snapshot" : "json");
    entry.expected = { snapshot: "ref-leading view, every ref/name/state/hierarchy", "mcp-json": "compact JSON, wrapper and all values exact" }[spec.kind] ?? "preserved exactly";
    entry.status = "passed";
  } catch (error) {
    entry.status = "failed"; entry.error = error.message;
    entry.root ??= /Artifacts retained: (.+)$/m.exec(error.message)?.[1];
    const arrivals = entry.root && await access(path.join(entry.root, "model-arrivals.jsonl")).then(() => true, () => false);
    entry.deadlineBeforeModel = /Case deadline/.test(error.message) && entry.root !== undefined && !arrivals;
  } finally { await browser?.stop(); await writeFile(path.join(dir, "case.json"), JSON.stringify(entry, null, 2)); }
  return entry;
}

/** Install origin from the enclosing npm lockfile; a missing entry is recorded, never guessed. */
async function origin(packageDir, name) {
  const parts = packageDir.split(path.sep), at = parts.lastIndexOf("node_modules");
  if (at < 0) return { lockfile: null, resolved: null, integrity: null };
  const lockfile = path.join(parts.slice(0, at).join(path.sep) || path.sep, "package-lock.json");
  const entry = await readFile(lockfile, "utf8").then((s) => JSON.parse(s).packages?.[`node_modules/${name}`], () => undefined);
  return { lockfile, resolved: entry?.resolved ?? null, integrity: entry?.integrity ?? null };
}

async function provenance(flags) {
  const playwrightDir = path.dirname(flags.playwright), devtoolsPkg = path.resolve(path.dirname(flags.devtools), "../../../package.json");
  const pw = JSON.parse(await readFile(path.join(playwrightDir, "package.json"), "utf8")), dt = JSON.parse(await readFile(devtoolsPkg, "utf8"));
  const sdk = JSON.parse(await readFile(path.join(flags.sdk, "node_modules/@opencode-ai/plugin/package.json"), "utf8"));
  return {
    head: (await capture("git", ["rev-parse", "HEAD"])).trim(), dirty: (await capture("git", ["status", "--porcelain"])).trim().split("\n").filter(Boolean),
    node: process.version, page: { sha256: sha256(PAGE), license: "MIT" },
    opencode: { path: flags.opencode, version: (await capture(flags.opencode, ["--version"], flags.output)).trim(), sha256: await fileHash(flags.opencode) },
    sdk: { path: flags.sdk, version: sdk.version },
    executable: { path: flags.executable, realpath: await realpath(flags.executable), sha256: await fileHash(flags.executable) },
    playwright: { cli: flags.playwright, version: pw.version, origin: await origin(playwrightDir, "playwright"), cliSha256: await fileHash(flags.playwright),
      bundleSha256: await fileHash(path.resolve(playwrightDir, "../playwright-core/lib/coreBundle.js")) },
    devtools: { entry: flags.devtools, version: dt.version, origin: await origin(path.dirname(devtoolsPkg), "chrome-devtools-mcp"), entrySha256: await fileHash(flags.devtools),
      formatterSha256: await fileHash(path.resolve(path.dirname(flags.devtools), "../formatters/SnapshotFormatter.js")) },
  };
}

export async function main(argv) {
  const flags = parseFlags(argv);
  await mkdir(flags.output, { recursive: true });
  const output = await realpath(flags.output), temp = await realpath(tmpdir());
  assert.ok(!output.startsWith(temp + path.sep) && output !== temp, `Output must be durable, not under ${temp}`);
  process.env.HUGR_PROOF_TEMP = output; // read once when the harness module loads
  const { installCandidate, runHostCase, assertObservation } = await import("./automatic-host-proof.mjs");
  const run = await mkdtemp(path.join(output, "browser-run-"));
  // The host's isolated TMPDIR is too deep for a Unix socket path; sockets are transient IPC, not artifacts.
  flags.socketDir = await mkdtemp(path.join(await realpath(flags.sockets), "pw-"));
  assert.ok(Buffer.byteLength(flags.socketDir) <= 64, `--sockets path too long for Unix sockets: ${flags.socketDir}`);
  const receipt = { started: new Date().toISOString(), run, argv: process.argv.slice(1), flags, ...(await provenance(flags)), cases: [], failures: [] };
  assert.equal(receipt.opencode.version, receipt.sdk.version, "OpenCode host and pinned SDK versions differ");
  const server = createServer((req, res) => {
    if (req.url === "/owned.json") { res.setHeader("Content-Type", "application/json"); res.end('{"owned":true,"name":"雪"}'); }
    else { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(PAGE); }
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const url = `http://127.0.0.1:${server.address().port}/`, file = path.join(run, "receipt.json");
  try {
    receipt.plugin = await installCandidate();
    const context = { flags, run, url, runHostCase, assertObservation, plugin: receipt.plugin };
    for (const name of flags.cases) {
      let entry = await attempt(context, name, 1);
      receipt.cases.push(entry);
      if (entry.status === "failed" && entry.deadlineBeforeModel) { entry = await attempt(context, name, 2); receipt.cases.push(entry); }
      if (entry.status === "failed") receipt.failures.push({ case: name, error: entry.error, root: entry.root, dir: entry.dir });
      if (/Harness (?:stopped|received SIG)/.test(entry.error ?? "")) break; // interrupted: record, do not continue
      console.log(JSON.stringify({ case: name, attempt: entry.attempt, status: entry.status, inputBytes: entry.inputBytes, outputBytes: entry.outputBytes, refs: entry.refs, roots: entry.roots, root: entry.root }));
    }
  } catch (error) { receipt.failures.push({ case: "setup", error: error.message }); }
  finally {
    await new Promise((resolve) => server.close(resolve));
    receipt.finished = new Date().toISOString();
    await writeFile(file, JSON.stringify(receipt, null, 2) + "\n");
  }
  console.log(JSON.stringify({ receipt: file, passed: receipt.cases.filter((c) => c.status === "passed").length, failures: receipt.failures.length }));
  return receipt;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const receipt = await main(process.argv.slice(2)); if (receipt.failures.length) process.exitCode = 1; }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
