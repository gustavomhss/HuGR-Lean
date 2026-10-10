#!/usr/bin/env node
/** Real host proof. Observers only record source hooks; model mock never executes tools. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isolatedEnvironment, runProcess, copySdkDependencies } from "./opencode-boundary.mjs";
import { inventory } from "./automatic-proof-server.mjs";
import { npmProcess, snapshotArtifact, assertPack } from "./package-smoke.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const TEMP = "/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode";
async function hostProcess(binary, args, options, root) {
  return await new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd: options.cwd, env: options.env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    void writeFile(path.join(root, "process-start.json"), JSON.stringify({ pid: child.pid, group: child.pid })).catch(reject);
    const stdout = [], stderr = []; let settled = false;
    const finish = async (error, code, signal) => {
      if (settled) return; settled = true; clearTimeout(timer);
      if (child.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch (e) { if (e.code !== "ESRCH") error ??= e; } }
      child.stdout.destroy(); child.stderr.destroy(); child.unref();
      const result = { code, signal, stdoutBytes: Buffer.concat(stdout), stderrBytes: Buffer.concat(stderr) };
      result.stdout = result.stdoutBytes.toString("utf8"); result.stderr = result.stderrBytes.toString("utf8");
      try { await writeFile(path.join(root, "process.json"), JSON.stringify({ pid: child.pid, code, signal })); } catch (e) { error ??= e; }
      if (error) reject(Object.assign(error, { diagnostics: result })); else resolve(result);
    };
    const timer = setTimeout(() => void finish(new Error(`Host deadline ${options.timeout} ms`)), options.timeout);
    child.stdout.on("data", (data) => stdout.push(Buffer.from(data))); child.stderr.on("data", (data) => stderr.push(Buffer.from(data)));
    child.once("error", (error) => void finish(error)); child.once("close", (code, signal) => void finish(undefined, code, signal));
  });
}
export function assertNextRequest(body, call) {
  const calls = body.messages.flatMap((m) => m.role === "assistant" ? m.tool_calls ?? [] : []);
  assert.equal(calls.length, 1, "Next request must retain exactly one issued call");
  assert.deepEqual({ ...calls[0], function: { ...calls[0].function, arguments: JSON.parse(calls[0].function.arguments) } },
    { ...call, function: { ...call.function, arguments: JSON.parse(call.function.arguments) } }, "Next request changed arguments");
  const results = body.messages.filter((m) => m.role === "tool");
  assert.equal(results.length, 1, "Immediately next request missing unique result");
  assert.equal(results[0].tool_call_id, call.id, "Next result has wrong call ID");
  return results[0];
}

export async function createProvider(tool, args, directory, log) {
  const requests = [], errors = []; let arrivals = 0, active = false;
  const call = { id: "automatic_call", type: "function", function: { name: tool, arguments: JSON.stringify(args) } };
  const server = createServer(async (req, res) => {
    if (req.url === "/inventory" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ files: await inventory(directory), scope: directory }, null, 2)); return;
    }
    const ordinal = ++arrivals, overlap = active; active = true;
    try {
      assert.equal(overlap, false, "Overlapping model requests");
      assert.ok(ordinal <= 2 && errors.length === 0, "Extra/poisoned model request");
      assert.equal(req.method, "POST"); assert.equal(req.url, "/v1/chat/completions");
      let raw = "";
      for await (const chunk of req) { raw += chunk; assert.ok(Buffer.byteLength(raw) <= 4 * 1024 * 1024, "Model body too large"); }
      await writeFile(path.join(log, `model-${ordinal}.json`), raw);
      assert.equal(errors.length, 0, "Poisoned model request");
      const body = JSON.parse(raw); requests.push(body); assert.equal(body.model, "boundary");
      let message, finish;
      if (ordinal === 1) {
        assert.ok(body.tools?.some((t) => t.function?.name === tool), `Host did not offer ${tool}`);
        assert.equal(body.messages.filter((m) => m.role === "tool").length, 0);
        message = { role: "assistant", content: null, tool_calls: [call] }; finish = "tool_calls";
      } else { assertNextRequest(body, call); message = { role: "assistant", content: "AUTOMATIC_PROOF_DONE" }; finish = "stop"; }
      const chunk = (delta, finish_reason = null) => ({ id: "automatic", object: "chat.completion.chunk", created: 1, model: "boundary", choices: [{ index: 0, delta, finish_reason }] });
      const delta = message.tool_calls ? { role: "assistant", tool_calls: [{ index: 0, ...call }] } : message;
      res.writeHead(200, { "Content-Type": "text/event-stream", Connection: "close" });
      const response = `data: ${JSON.stringify(chunk(delta))}\n\ndata: ${JSON.stringify(chunk({}, finish))}\n\ndata: [DONE]\n\n`;
      await writeFile(path.join(log, `response-${ordinal}.sse`), response); res.end(response);
    } catch (error) {
      errors.push(error.message); if (!res.headersSent) res.writeHead(400);
      res.end(JSON.stringify({ error: { message: error.message } }));
    } finally { active = false; }
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  return { url: `http://127.0.0.1:${server.address().port}`, requests, errors, call,
    get arrivals() { return arrivals; }, get active() { return active; },
    close: async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); } };
}

function observer(log, phase) {
  return `import { appendFile } from "node:fs/promises";
export default async () => ({ "tool.execute.after": async (input, output) => {
 const key = Symbol.for("hugr.automatic.proof");
 if (${JSON.stringify(phase)} === "before") globalThis[key] = { metadata: output.metadata, content: output.content, input: structuredClone(input) };
 const saved = globalThis[key];
 await appendFile(${JSON.stringify(log)}, JSON.stringify({ phase: ${JSON.stringify(phase)}, input, output, metadataSame: saved.metadata === output.metadata, inputSame: JSON.stringify(saved.input) === JSON.stringify(input), untouchedBlocksSame: !saved.content || saved.content.every((b,i) => b.type === "text" || b === output.content?.[i]) }) + "\\n");
} });\n`;
}

function text(output) {
  if (Array.isArray(output.content)) return output.content.flatMap((b) => b.type === "text" ? [b.text] : b.type === "resource" && typeof b.resource.text === "string" ? [b.resource.text] : b.type === "resource" && b.resource.blob ? [`[Binary MCP resource omitted: ${b.resource.uri} (${b.resource.mimeType}, ${Buffer.from(b.resource.blob, "base64").length} B) is not a supported attachment type]`] : []).join("\n\n");
  return output.output;
}
function unfold(value) {
  if (Array.isArray(value)) return value.map(unfold);
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value.columns) && Array.isArray(value.rows)) return value.rows.map((row) => Object.fromEntries(value.columns.map((key, i) => [key, unfold(row[i])])));
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, unfold(v)]));
}
export function assertNativePaths(before, changed) {
  const tool = before.input.tool, args = before.input.args, directory = args.path ?? args.filePath;
  const lines = changed.split("\n"), prefix = lines.findIndex((line) => line === directory + ":" || line === directory + "/:");
  assert.ok(prefix >= 0, "Native view lost absolute directory prefix");
  if (tool === "glob") {
    const paths = lines.slice(prefix + 1).filter(Boolean).map((line) => path.join(directory, line));
    assert.deepEqual(paths, before.output.output.split("\n"), "Native view changed full paths/order");
  } else if (tool === "read") {
    const paths = lines.slice(prefix + 1).filter(Boolean).map((line) => path.join(directory, line));
    assert.deepEqual(paths, before.output.metadata.display.entries.map((entry) => path.join(directory, entry)), "Directory view changed full paths/order");
  } else {
    const records = (source, compact) => {
      let file; const rows = [];
      for (const line of source.split("\n")) {
        if (line.endsWith(".txt:")) file = compact ? path.join(directory, line.slice(0, -1)) : line.slice(0, -1);
        const match = /^\s*(?:Line )?(\d+): (.*)$/.exec(line);
        if (match) { assert.ok(file, "Grep location lacks source path"); rows.push([file, Number(match[1]), match[2]]); }
      }
      return rows;
    };
    assert.deepEqual(records(lines.slice(prefix + 1).join("\n"), true), records(before.output.output, false), "Grep changed path/line/data associations");
  }
}
export function assertObservation(before, after, result, expected = "preserved", anchors = []) {
  assert.deepEqual(after.input, before.input, "Hook changed actual arguments");
  assert.equal(after.metadataSame, true, "Hook replaced metadata reference");
  assert.equal(after.inputSame, true, "Hook mutated arguments");
  assert.equal(after.untouchedBlocksSame, true, "Hook replaced attachment reference");
  const strip = (o) => { const copy = structuredClone(o); delete copy.output; delete copy.content; return copy; };
  assert.deepEqual(strip(after.output), strip(before.output), "Hook changed metadata/title/structuredContent");
  if (before.output.content) {
    assert.equal(after.output.content.length, before.output.content.length, "Hook lost content block");
    before.output.content.forEach((block, i) => {
      const actual = after.output.content[i];
      if (block.type !== "text") assert.deepEqual(actual, block, "Hook changed attachment source");
      else { const { text: _a, ...a } = actual, { text: _b, ...b } = block; assert.deepEqual(a, b, "Hook changed text annotations"); }
    });
  }
  const raw = text(before.output), changed = text(after.output);
  assert.equal(result.content, changed, "Next result differs from completed hook output");
  if (expected === "preserved") assert.deepEqual(after.output, before.output, "Negative control changed output");
  else {
    assert.ok(Buffer.byteLength(changed) < Buffer.byteLength(raw), "Automatic positive did not reduce");
    if (expected === "json") {
      const original = before.output.content?.[0].text ?? raw, replacement = after.output.content?.[0].text ?? changed;
      assert.deepEqual(unfold(JSON.parse(replacement)), JSON.parse(original), "JSON lost full source values/refs");
    }
    for (const anchor of anchors) assert.ok(changed.includes(anchor), `Lost native path/location evidence: ${anchor}`);
  }
}

export async function runHostCase({ binary = "/Users/gustavoschneiter/.opencode/bin/opencode", dependencies = process.env.HUGR_SMOKE_DEPS,
  plugin, observe = false, disabled = false, kind = "glob", mcp, toolName, toolArgs, timeout = 60000 } = {}) {
  const root = await mkdtemp(path.join(TEMP, "automatic-host-")), cwd = path.join(root, "project"), directory = path.join(cwd, "owned-inventory");
  const env = isolatedEnvironment(root); let mock, execution;
  try {
    await Promise.all([cwd, env.HOME, env.XDG_CONFIG_HOME, env.XDG_DATA_HOME, env.XDG_CACHE_HOME, env.XDG_STATE_HOME, env.OPENCODE_CONFIG_DIR].map((d) => mkdir(d, { recursive: true })));
    assert.ok(dependencies, "Private pinned SDK required: HUGR_SMOKE_DEPS");
    const sdk = JSON.parse(await readFile(path.join(dependencies, "node_modules/@opencode-ai/plugin/package.json"), "utf8"));
    assert.equal(sdk.version, "1.18.17", "SDK version must match real host");
    await copySdkDependencies(dependencies, env.OPENCODE_CONFIG_DIR);
    await cp(path.join(ROOT, "fixtures/automatic/host/inventory"), directory, { recursive: true });
    const version = await runProcess(binary, ["--version"], { cwd, env, timeout });
    await writeFile(path.join(root, "version.json"), JSON.stringify(version)); assert.equal(version.stdout.trim(), "1.18.17");
    const hookLog = path.join(root, "hooks.jsonl"), before = path.join(root, "before.mjs"), after = path.join(root, "after.mjs");
    await writeFile(before, observer(hookLog, "before")); await writeFile(after, observer(hookLog, "after"));
    const tool = toolName ?? ({ json: "bash", failure: "bash", unknown: "bash", truncation: "bash", readfailure: "read", readfile: "read" }[kind] ?? (kind.startsWith("mcp-") ? "proof_inventory" : kind));
    mock = await createProvider(tool, {}, directory, root);
    const args = toolArgs ?? ({ glob: { pattern: "**/*.txt", path: directory }, grep: { pattern: "inventory evidence", path: directory },
      read: { filePath: directory }, readfailure: { filePath: path.join(directory, "missing.txt") },
      readfile: { filePath: path.join(directory, "project-source-component-alpha.txt") }, unknown: { command: "printf 'unknown native e42\\r\\n'", description: "Unknown native control" },
      json: { command: `curl -fsS ${mock.url}/inventory`, description: "Read local JSON API" },
      failure: { command: "printf 'native failure e42\\n'; exit 7", description: "Failure control" },
      truncation: { command: `curl -fsS ${mock.url}/inventory`, description: "Truncation control" } }[kind] ?? { mode: kind.slice(4) });
    mock.call.function.arguments = JSON.stringify(args);
    const spec = plugin && pathToFileURL(path.resolve(plugin)).href;
    assert.ok(observe || spec, "Real installed plugin required for reduction proof");
    const config = { model: "hugr-mock/boundary", small_model: "hugr-mock/boundary", enabled_providers: ["hugr-mock"],
      shell: "/bin/sh", autoupdate: false, snapshot: false, share: "disabled", permission: { "*": "allow", edit: "deny", question: "deny" },
      compaction: { auto: false }, lsp: false, formatter: false, agent: { title: { disable: true }, summary: { disable: true } },
      provider: { "hugr-mock": { npm: "@ai-sdk/openai-compatible", options: { baseURL: mock.url + "/v1", apiKey: "local-only" }, models: { boundary: { tool_call: true, modalities: { input: ["text", "image"], output: ["text"] }, limit: { context: 128000, output: 4096 } } } } },
      plugin: [pathToFileURL(before).href, ...(observe ? [] : [disabled ? [spec, { automatic: false }] : spec]), pathToFileURL(after).href],
      mcp: mcp ?? { proof: { type: "local", command: [process.execPath, path.join(ROOT, "scripts/automatic-proof-server.mjs"), directory, path.join(root, "mcp.jsonl")], enabled: true } },
      ...(kind === "truncation" ? { tool_output: { max_lines: 3, max_bytes: 128 } } : {}) };
    await writeFile(env.OPENCODE_CONFIG, JSON.stringify(config, null, 2));
    const argv = ["run", "--format", "json", "--model", "hugr-mock/boundary", "--title", "Automatic proof", "Execute requested native tool once, then finish."];
    await writeFile(path.join(root, "argv.json"), JSON.stringify({ binary, argv, cwd, env, sdk: dependencies }));
    execution = await hostProcess(binary, argv, { cwd, env, timeout }, root);
    await writeFile(path.join(root, "stdout"), execution.stdoutBytes); await writeFile(path.join(root, "stderr"), execution.stderrBytes);
    assert.equal(execution.code, 0, execution.stderr); assert.deepEqual(mock.errors, []);
    assert.equal(mock.arrivals, 2, "Expected exactly two model requests"); assert.equal(mock.active, false);
    const result = assertNextRequest(mock.requests[1], mock.call);
    const events = execution.stdout.split("\n").filter((l) => l.startsWith("{")).map((l) => JSON.parse(l));
    assert.equal(events.filter((e) => e.type === "error").length, 0, "Host emitted error event");
    const tools = events.filter((e) => e.type === "tool_use" && e.part.callID === mock.call.id);
    assert.equal(tools.length, 1, "Missing unique native completion");
    const completed = tools[0].part; assert.equal(completed.tool, tool); assert.deepEqual(completed.state.input, args, "Host changed arguments");
    const hooks = await readFile(hookLog, "utf8").then((s) => s.trim().split("\n").map(JSON.parse)).catch((e) => { if (e.code === "ENOENT") return []; throw e; });
    if (kind.startsWith("mcp-") && !mcp) {
      const transcript = (await readFile(path.join(root, "mcp.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
      const call = transcript.find((e) => e.request?.method === "tools/call").request;
      assert.deepEqual(call.params.arguments, args, "MCP transport changed actual arguments");
      const packet = transcript.find((e) => e.response?.id === call.id).response.result;
      if (kind === "mcp-error") { assert.equal(packet.isError, true); assert.equal(result.content, packet.content[0].text, "MCP failure source changed"); }
      else assert.deepEqual(hooks[0]?.output, packet, "SDK/host changed producer content before source hook");
    }
    if (["mcp-error", "readfailure"].includes(kind)) {
      assert.equal(completed.state.status, "error", "Failure control did not fail"); assert.equal(hooks.length, 0, "Native error unexpectedly reached after-hook");
      assert.equal(result.content, completed.state.error, "Next request changed native failure output");
      assert.ok(JSON.stringify(result.content).includes(kind === "mcp-error" ? "e42" : "missing.txt"), "Failure source missing from model");
    } else {
      assert.equal(completed.state.status, "completed"); assert.equal(hooks.length, 2, "Missing before/after source hooks");
      assert.equal(result.content, completed.state.output, "Next request differs from actual completion");
      const positive = ["json", "glob", "grep", "read", "mcp-json", "mcp-attachments"].includes(kind);
      const expected = observe || disabled || !positive ? "preserved" : kind.includes("json") || kind === "mcp-attachments" ? "json" : "paths";
      const rows = await inventory(directory), anchors = expected === "paths" ? rows.flatMap((r) => [path.basename(r.path), ...(kind === "grep" ? [r.text.trim()] : [])]) : [];
      assertObservation(hooks[0], hooks[1], result, expected, anchors);
      if (expected === "paths") assertNativePaths(hooks[0], result.content);
      const images = hooks[0].output.content?.filter((b) => b.type === "image") ?? [];
      const modelImages = mock.requests[1].messages.flatMap((m) => Array.isArray(m.content) ? m.content.filter((b) => b.type === "image_url") : []);
      assert.deepEqual(modelImages.map((b) => b.image_url.url), images.map((b) => `data:${b.mimeType};base64,${b.data}`), "Next request lost image attachment source");
      if (kind === "failure") assert.equal(hooks[0].output.metadata.exit, 7);
      if (kind === "truncation") assert.equal(hooks[0].output.metadata.truncated, true);
    }
    const report = { kind, status: observe ? "observed-only" : "proved", root, tool: completed, hooks, result, requests: mock.arrivals };
    await writeFile(path.join(root, "report.json"), JSON.stringify(report, null, 2)); return report;
  } catch (error) {
    const streams = execution ?? error.diagnostics;
    if (streams) { await writeFile(path.join(root, "stdout"), streams.stdoutBytes ?? streams.stdout ?? ""); await writeFile(path.join(root, "stderr"), streams.stderrBytes ?? streams.stderr ?? ""); }
    await writeFile(path.join(root, "failure.json"), JSON.stringify({ message: error.message, stack: error.stack, requests: mock?.arrivals, errors: mock?.errors }, null, 2));
    throw new Error(`${error.message}\nArtifacts retained: ${root}`, { cause: error });
  } finally { if (mock) await mock.close(); }
}

export async function installCandidate() {
  const root = await mkdtemp(path.join(TEMP, "automatic-installed-")), artifact = path.join(root, "artifact"), consumer = path.join(root, "consumer");
  await mkdir(consumer); await snapshotArtifact(ROOT, artifact);
  const options = { cwd: consumer, isolation: root, timeout: 120000 };
  const pack = await npmProcess(["pack", "--json", "--ignore-scripts", "--pack-destination", root], { ...options, cwd: artifact });
  const tarball = path.join(root, assertPack(JSON.parse(pack.stdout)).filename);
  await writeFile(path.join(consumer, "package.json"), '{"private":true,"type":"module"}');
  const install = await npmProcess(["install", tarball, "--ignore-scripts", "--no-audit", "--no-fund"], options);
  await writeFile(path.join(root, "install.json"), JSON.stringify({ tarball, pack, install }));
  return path.join(consumer, "node_modules/hugr-lean/dist/index.js");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const observe = process.argv.includes("--observe"), plugin = observe ? undefined : await installCandidate();
  const cases = process.argv.filter((arg, i) => i > 1 && arg !== "--observe");
  const reports = [], failures = [];
  for (const kind of cases.length ? cases : ["json", "glob", "grep", "read", "readfile", "failure", "unknown", "readfailure", "truncation", "mcp-json", "mcp-error", "mcp-truncated", "mcp-unknown", "mcp-attachments", "mcp-blob", "optout"]) {
    try { reports.push(await runHostCase({ plugin, observe, kind: kind === "optout" ? "mcp-json" : kind, disabled: kind === "optout" })); }
    catch (error) { failures.push({ kind, error: error.message }); }
  }
  console.log(JSON.stringify({ mode: observe ? "observation, not reduction proof" : "installed automatic proof", reports, failures }, null, 2));
  if (failures.length) process.exitCode = 1;
}
