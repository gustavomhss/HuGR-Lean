#!/usr/bin/env node
/** Real OpenCode -> local SSE model -> native bash -> after-hook -> model proof. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, lstat, mkdtemp, mkdir, readFile, readdir, realpath, writeFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const RAW = "HUGR_RAW_SENTINEL";
export const CHANGED = "HUGR_CHANGED_SENTINEL";
const PROMPT = "HUGR_BOUNDARY: execute the requested bash tool once, then finish.";

export function isolatedEnvironment(root, extra = {}) {
  return {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    HOME: path.join(root, "home"),
    XDG_CONFIG_HOME: path.join(root, "config"),
    XDG_DATA_HOME: path.join(root, "data"),
    XDG_CACHE_HOME: path.join(root, "cache"),
    XDG_STATE_HOME: path.join(root, "state"),
    TMPDIR: root,
    SHELL: "/bin/sh",
    LANG: "en_US.UTF-8",
    CI: "1",
    NO_COLOR: "1",
    npm_config_cache: path.join(root, "cache", "npm"),
    npm_config_userconfig: path.join(root, "npmrc"),
    npm_config_globalconfig: path.join(root, "global-npmrc"),
    ...(process.platform === "win32" ? { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, PATHEXT: process.env.PATHEXT, ComSpec: process.env.ComSpec } : {}),
    OPENCODE_CONFIG: path.join(root, "opencode.json"),
    OPENCODE_CONFIG_DIR: path.join(root, "config", "opencode"),
    OPENCODE_DISABLE_PROJECT_CONFIG: "1",
    OPENCODE_DISABLE_DEFAULT_PLUGINS: "1",
    OPENCODE_DISABLE_MODELS_FETCH: "1",
    OPENCODE_DISABLE_AUTOUPDATE: "1",
    OPENCODE_DISABLE_EXTERNAL_SKILLS: "1",
    OPENCODE_DISABLE_CLAUDE_CODE_SKILLS: "1",
    ...extra,
  };
}

export async function runProcess(binary, args, options = {}) {
  const { timeout = 45000, ...spawnOptions } = options;
  return await new Promise((resolve, reject) => {
    const child = spawn(binary, args, { ...spawnOptions, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32" });
    const stdoutChunks = [], stderrChunks = [];
    let exitCode = null, exitSignal = null;
    let settled = false;
    const settle = (error, result, timedOut = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const stdoutBytes = Buffer.concat(stdoutChunks), stderrBytes = Buffer.concat(stderrChunks);
      const streams = { stdoutBytes, stderrBytes, stdout: stdoutBytes.toString("utf8"), stderr: stderrBytes.toString("utf8") };
      if (timedOut) error.message += `\n${streams.stdout}\n${streams.stderr}`;
      if (error) reject(Object.assign(error, { diagnostics: { code: exitCode, signal: exitSignal, ...streams } }));
      else resolve({ ...result, ...streams });
    };
    const timer = setTimeout(() => {
      // A detached descendant can retain both pipes after the main child exits. Never await close here.
      settle(new Error(`OpenCode timeout after ${timeout} ms`), undefined, true);
      if (child.pid && process.platform !== "win32") {
        try { process.kill(-child.pid, "SIGKILL"); } catch { /* Best effort: the group may have exited. */ }
      }
      try { child.kill("SIGKILL"); } catch { /* Best effort: the main child may have exited. */ }
      child.stdout.destroy();
      child.stderr.destroy();
      child.unref();
    }, timeout);
    child.stdout.on("data", (data) => { stdoutChunks.push(Buffer.from(data)); });
    child.stderr.on("data", (data) => { stderrChunks.push(Buffer.from(data)); });
    child.once("exit", (code, signal) => { exitCode = code; exitSignal = signal; });
    child.once("error", (error) => settle(new Error(`Cannot execute ${binary}: ${error.message}`, { cause: error })));
    child.once("close", (code, signal) => settle(undefined, { code, signal }));
  });
}

export async function createMockProvider(args) {
  const requests = [];
  const modelResults = [];
  const errors = [];
  let receivedRequests = 0;
  const unfinishedRequests = new Set();
  let issuedCall;
  const server = createServer(async (req, res) => {
    const ordinal = ++receivedRequests; // Arrival order, before any body read can yield to another handler.
    const overlapping = unfinishedRequests.size > 0;
    unfinishedRequests.add(ordinal);
    try {
      assert.equal(errors.length, 0, "Mock session already rejected a request");
      assert.ok(ordinal <= 2, "Mock received an extra request after its tool round trip");
      assert.equal(overlapping, false, "Mock received an overlapping request before the prior request finished");
      assert.equal(req.method, "POST", "Unexpected mock HTTP method");
      assert.equal(req.url, "/v1/chat/completions", "Unexpected mock HTTP endpoint");
      let raw = "";
      for await (const chunk of req) {
        raw += chunk;
        assert.ok(Buffer.byteLength(raw) < 4 * 1024 * 1024, "Mock request exceeds 4 MiB");
      }
      assert.equal(errors.length, 0, "Mock session already rejected a request");
      const body = JSON.parse(raw);
      requests.push(body);
      assert.equal(body.model, "boundary", "Unexpected mock model");
      assert.ok(Array.isArray(body.messages) && body.messages.length, "Mock request has no messages");
      const results = body.messages.filter((message) => message.role === "tool");
      const main = body.tools?.some((tool) => tool.function?.name === "bash") && JSON.stringify(body.messages).includes("HUGR_BOUNDARY");
      let message;
      let finish;
      if (ordinal === 1) {
        assert.ok(main && results.length === 0, "First mock request must offer bash and request the boundary probe without a tool result");
        issuedCall = { id: "hugr_call", type: "function", function: { name: "bash", arguments: JSON.stringify(args) } };
        message = { role: "assistant", content: null, tool_calls: [issuedCall] };
        finish = "tool_calls";
      } else {
        assert.equal(ordinal, 2, "Mock received an extra request after its tool round trip");
        assert.ok(issuedCall && results.length === 1 && results[0].tool_call_id === issuedCall.id, "Immediately next mock request must contain exactly one result for the issued bash call");
        const returnedCalls = body.messages.flatMap((entry) => entry.role === "assistant" ? entry.tool_calls ?? [] : []);
        assert.equal(returnedCalls.length, 1, "Next mock request must retain exactly the issued bash call");
        assert.deepEqual({ ...returnedCalls[0], function: { ...returnedCalls[0].function, arguments: JSON.parse(returnedCalls[0].function.arguments) } }, { ...issuedCall, function: { ...issuedCall.function, arguments: args } }, "Next mock request changed the issued bash call");
        assert.equal(typeof results[0].content, "string", "Next mock request must contain native tool-result text");
        modelResults.push(results[0]);
        message = { role: "assistant", content: "HUGR_BOUNDARY_DONE" };
        finish = "stop";
      }
      if (body.stream) {
        res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "close" });
        const chunk = (delta, finish_reason = null) => ({ id: "hugr_completion", object: "chat.completion.chunk", created: 1, model: "boundary", choices: [{ index: 0, delta, finish_reason }] });
        const delta = message.tool_calls
          ? { role: "assistant", tool_calls: message.tool_calls.map((call, index) => ({ index, ...call })) }
          : message;
        res.write(`data: ${JSON.stringify(chunk(delta))}\n\n`);
        res.write(`data: ${JSON.stringify(chunk({}, finish))}\n\n`);
        res.end("data: [DONE]\n\n");
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ id: "hugr_completion", object: "chat.completion", created: 1, model: "boundary", choices: [{ index: 0, message, finish_reason: finish }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }));
      }
    } catch (error) {
      errors.push(error.message);
      if (!res.headersSent) res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: error.message, type: "invalid_request_error" } }));
    } finally {
      unfinishedRequests.delete(ordinal);
    }
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  return {
    url: `http://127.0.0.1:${server.address().port}/v1`, requests, modelResults, errors,
    get receivedRequests() { return receivedRequests; },
    get unfinishedRequests() { return [...unfinishedRequests]; },
    get issuedCall() { return issuedCall; },
    close: async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); },
  };
}

export function sentinelPlugin(logPath) {
  return `import { appendFile } from "node:fs/promises";
export default async (_input, options) => {
  await appendFile(${JSON.stringify(logPath)}, JSON.stringify({ loaded: true, options }) + "\\n");
  return {
    "tool.execute.after": async (input, output) => {
      const before = structuredClone(output);
      if (input.tool === "bash") output.output = output.output.replaceAll(${JSON.stringify(RAW)}, ${JSON.stringify(CHANGED)});
      await appendFile(${JSON.stringify(logPath)}, JSON.stringify({ input, before, after: output }) + "\\n");
    }
  };
};
`;
}

export async function copySdkDependencies(dependencies, destination) {
  const root = await realpath(dependencies);
  assert.ok((await lstat(root)).isDirectory(), `SDK source must be a directory: ${dependencies}`);
  const items = ["package.json", "package-lock.json", "node_modules"], active = new Set();
  let entries = 0;
  const inspect = async (file) => {
    assert.ok(++entries <= 10000, `SDK dependency tree exceeds 10000 entries: ${file}`);
    const canonical = await realpath(file), relative = path.relative(root, canonical);
    assert.ok(relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative),
      `SDK dependency escapes source boundary: ${file} -> ${canonical}`);
    const entry = await lstat(canonical);
    if (entry.isDirectory()) {
      assert.ok(!active.has(canonical), `SDK dependency cycle: ${file} -> ${canonical}`);
      active.add(canonical);
      try { for (const name of await readdir(canonical)) await inspect(path.join(canonical, name)); }
      finally { active.delete(canonical); }
    } else assert.ok(entry.isFile(), `SDK dependency is not a regular file: ${file}`);
  };
  // Validate every selected entry before any copy; only SDK manifests and node_modules are selected.
  for (const item of items) await inspect(path.join(root, item));
  for (const item of items) await cp(path.join(root, item), path.join(destination, item), { recursive: true, dereference: true });
}

export async function runScenario({ binary = process.env.OPENCODE_BIN ?? "opencode", binaryArgs = [], plugin, pluginSpec, pluginOptions, hook = false, command = `printf '%s\\n' ${RAW}`, toolTimeout = 5000, timeout = 45000, setup, toolOutput, dependencies = process.env.HUGR_SMOKE_DEPS, keep = process.env.HUGR_KEEP_SMOKE === "1" } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "hugr-opencode-"));
  let mock, execution;
  try {
    const env = isolatedEnvironment(root);
    const cwd = path.join(root, "project");
    await Promise.all([cwd, env.HOME, env.XDG_CONFIG_HOME, env.XDG_DATA_HOME, env.XDG_CACHE_HOME, env.XDG_STATE_HOME, env.OPENCODE_CONFIG_DIR].map((directory) => mkdir(directory, { recursive: true })));
    if (dependencies) {
      // Copy the selected SDK tree; the real host still dispatches every hook.
      await copySdkDependencies(dependencies, env.OPENCODE_CONFIG_DIR);
    }
    if (setup) await setup({ root, cwd, env });
    const logPath = path.join(root, "hook.jsonl");
    const pluginPath = path.join(root, "sentinel.mjs");
    if (hook) await writeFile(pluginPath, sentinelPlugin(logPath));
    const args = { command, description: "Local deterministic boundary probe", timeout: toolTimeout };
    mock = await createMockProvider(args);
    assert.ok(!(plugin && pluginSpec), "Supply only one plugin file or literal plugin specifier");
    const spec = pluginSpec ?? (plugin ? pathToFileURL(path.resolve(plugin)).href : hook ? pathToFileURL(pluginPath).href : undefined);
    const config = {
      $schema: "https://opencode.ai/config.json", model: "hugr-mock/boundary", small_model: "hugr-mock/boundary",
      shell: "/bin/sh", enabled_providers: ["hugr-mock"], autoupdate: false, snapshot: false, share: "disabled",
      permission: { bash: "allow", external_directory: "allow", edit: "deny", question: "deny" },
      compaction: { auto: false }, lsp: false, formatter: false,
      agent: { title: { disable: true }, summary: { disable: true } },
      provider: { "hugr-mock": { npm: "@ai-sdk/openai-compatible", name: "Local deterministic mock", options: { baseURL: mock.url, apiKey: "local-mock-only" }, models: { boundary: { name: "Local boundary", tool_call: true, limit: { context: 128000, output: 4096 } } } } },
      plugin: spec ? [pluginOptions ? [spec, pluginOptions] : spec] : [],
      ...(toolOutput ? { tool_output: toolOutput } : {}),
    };
    await writeFile(env.OPENCODE_CONFIG, JSON.stringify(config));
    const result = execution = await runProcess(binary, [...binaryArgs, "run", "--format", "json", "--model", "hugr-mock/boundary", "--title", "Boundary smoke", PROMPT], { cwd, env, timeout });
    assert.equal(result.code, 0, `OpenCode failed (${result.code}, ${result.signal})\n${result.stdout}\n${result.stderr}`);
    assert.deepEqual(mock.errors, [], "Mock rejected a request");
    assert.equal(mock.modelResults.length, 1, `Mock did not receive exactly one second-request tool result; requests=${mock.receivedRequests}\n${result.stdout}\n${result.stderr}`);
    const events = result.stdout.split("\n").filter((line) => line.startsWith("{")).map((line) => JSON.parse(line));
    assert.equal(events.filter((event) => event.type === "error").length, 0, `OpenCode emitted an error: ${result.stdout}`);
    const tools = events.filter((event) => event.type === "tool_use" && event.part?.tool === "bash");
    if (tools.length !== 1) throw Object.assign(new Error("No unique bash completion event"), { code: "REAL_HOST_NATIVE_COMPLETION_MISSING" });
    assert.equal(tools[0].part.state.status, "completed", "Native bash did not complete");
    assert.equal(tools[0].part.callID, mock.issuedCall.id, "Native completion does not match the issued bash call");
    assert.equal(tools[0].part.state.input.command, command, "Host changed the native command");
    assert.equal(mock.modelResults[0].content, tools[0].part.state.output, "Immediately next mock request did not carry the exact completed tool result");
    let hooks = [];
    if (hook) {
      try { hooks = (await readFile(logPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line)); }
      catch (error) { if (error.code !== "ENOENT") throw error; }
    }
    assert.equal(mock.receivedRequests, 2, "Mock did not receive exactly the two expected requests");
    assert.deepEqual(mock.unfinishedRequests, [], "Mock still has an unfinished request");
    return { root, command, pluginEntry: config.plugin[0], modelResult: mock.modelResults[0], tool: tools[0].part, hooks, requests: mock.receivedRequests, ...result };
  } catch (error) {
    const diagnostics = { ...(execution ?? error.diagnostics), root, requests: mock?.receivedRequests ?? 0, toolResults: mock?.modelResults.length ?? 0 };
    const streams = execution ?? error.diagnostics;
    throw Object.assign(new Error(`${error.message}${streams ? `\nHost stdout:\n${streams.stdout}\nHost stderr:\n${streams.stderr}` : ""}\nMock requests received: ${diagnostics.requests}; tool results: ${diagnostics.toolResults}\nIsolated artifacts: ${root}${keep ? " (retained)" : " (removed; set HUGR_KEEP_SMOKE=1 to retain)"}`, { cause: error }), { code: error.code, diagnostics });
  } finally {
    try { if (mock) await mock.close(); }
    finally { if (!keep) await rm(root, { recursive: true, force: true }); }
  }
}

export function assertSentinel(result, changed) {
  const content = JSON.stringify(result.modelResult.content);
  assert.ok(content.includes(changed ? CHANGED : RAW), `Model-visible ${changed ? "changed" : "raw"} sentinel missing: ${content}; hooks=${JSON.stringify(result.hooks)}`);
  assert.ok(!content.includes(changed ? RAW : CHANGED), "Model received the wrong sentinel");
  assert.equal(result.modelResult.content, result.tool.state.output, "Model and native completion text differ");
  if (changed) {
    const hooks = result.hooks.filter((entry) => entry.input?.tool === "bash");
    assert.equal(hooks.length, 1, "tool.execute.after did not run exactly once");
    assert.equal(hooks[0].input.args.command, result.command, "Hook command is not input.args.command");
    assert.equal(hooks[0].before.metadata.exit, hooks[0].after.metadata.exit, "Hook changed native exit status");
    assert.deepEqual(hooks[0].before.metadata, hooks[0].after.metadata, "Hook changed native metadata");
  }
}

export async function runBoundary(options = {}) {
  const raw = await runScenario(options);
  assertSentinel(raw, false);
  assert.equal(raw.tool.state.metadata.exit, 0, "Native positive control did not exit successfully");
  assert.equal(raw.tool.state.metadata.truncated, false, "Native positive control is incomplete");
  const changed = await runScenario({ ...options, hook: true, pluginOptions: { boundary: "HUGR_OPTIONS_SENTINEL" } });
  assertSentinel(changed, true);
  assert.deepEqual(changed.hooks.find((entry) => entry.loaded)?.options, { boundary: "HUGR_OPTIONS_SENTINEL" }, "Plugin tuple options did not reach its default function");
  const failure = await runScenario({ ...options, hook: true, command: `printf '%s\\n' ${RAW}; exit 7` });
  assertSentinel(failure, true);
  assert.equal(failure.tool.state.metadata.exit, 7, "Failed native exit was not preserved");
  return { raw, changed, failure };
}

export async function runNativeControls(options = {}) {
  const timedOut = await runScenario({ ...options, hook: true, command: "printf timeout-start; sleep 3", toolTimeout: 100 });
  assert.equal(timedOut.tool.state.metadata.exit, null, "Timeout was reported as an exited command");
  assert.ok(timedOut.tool.state.output.includes("<shell_metadata>\nshell tool terminated command after exceeding timeout 100 ms."), "Native timeout wrapper is missing");
  const truncated = await runScenario({ ...options, hook: true, command: "i=0; while [ $i -lt 12 ]; do printf 'line-%s\\n' $i; i=$((i+1)); done", toolOutput: { max_lines: 3, max_bytes: 128 } });
  assert.equal(truncated.tool.state.metadata.truncated, true, "Native truncation was not detected");
  assert.equal(truncated.tool.state.metadata.exit, 0);
  assert.equal(truncated.tool.state.output, `...output truncated...\n\nFull output saved to: ${truncated.tool.state.metadata.outputPath}\n\nline-10\nline-11\n`, "Native truncation wrapper changed");
  const git = await runScenario({ ...options, hook: true, command: "git status", setup: async ({ cwd, env }) => {
    const init = await runProcess("git", ["init", "--quiet", "-b", "boundary"], { cwd, env, timeout: 5000 });
    assert.equal(init.code, 0, init.stderr);
    await writeFile(path.join(cwd, "untracked.txt"), "native git control\n");
  } });
  assert.equal(git.tool.state.metadata.exit, 0);
  assert.ok(git.tool.state.output.includes("untracked.txt"), "Real git status evidence is missing");
  const rawText = await runScenario({ ...options, hook: true, command: "printf '\\033[31mHUGR_ANSI_SENTINEL\\033[0m\\rHUGR_CR_SENTINEL\\n'; printf 'warning: HUGR_STDERR_SENTINEL\\n' >&2" });
  assert.ok(rawText.tool.state.output.includes("\u001b[31mHUGR_ANSI_SENTINEL\u001b[0m\rHUGR_CR_SENTINEL\n"), "Host terminal-rendered or stripped native escape/control text");
  assert.ok(rawText.tool.state.output.includes("warning: HUGR_STDERR_SENTINEL\n"), "Native stderr evidence is missing");
  assert.deepEqual(Object.keys(rawText.tool.state.metadata).sort(), ["exit", "output", "truncated"], "Native warning metadata shape changed");
  for (const result of [timedOut, truncated, git, rawText]) {
    assert.equal(result.modelResult.content, result.tool.state.output, "Model did not receive native wrapper/output");
    const hook = result.hooks.find((entry) => entry.input?.tool === "bash");
    assert.ok(hook, "Native control did not reach the after-hook");
    assert.deepEqual(hook.before, hook.after, "Observer changed native control output");
  }
  return { timedOut, truncated, git, rawText };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const binary = process.env.OPENCODE_BIN ?? "opencode";
    if (process.argv[2] === "--version") {
      const root = await mkdtemp(path.join(tmpdir(), "hugr-opencode-version-"));
      try {
        const result = await runProcess(binary, ["--version"], { cwd: root, env: isolatedEnvironment(root), timeout: 60000 });
        assert.equal(result.code, 0, result.stderr);
        assert.match(result.stdout.trim(), /^\d+\.\d+\.\d+/, "OpenCode version is missing");
        console.log(result.stdout.trim());
      }
      finally { await rm(root, { recursive: true, force: true }); }
    } else {
      assert.ok(process.argv.length === 2 || process.argv[2] === "--native", "Usage: opencode-boundary.mjs [--version|--native]");
      const result = process.argv[2] === "--native" ? await runNativeControls({ binary }) : await runBoundary({ binary });
      console.log(JSON.stringify({ status: "proved", binary, controls: Object.fromEntries(Object.entries(result).map(([name, item]) => [name, { modelResult: item.modelResult, tool: item.tool, hooks: item.hooks, requests: item.requests }])) }, null, 2));
    }
  } catch (error) { console.error(error.stack); process.exitCode = 1; }
}
