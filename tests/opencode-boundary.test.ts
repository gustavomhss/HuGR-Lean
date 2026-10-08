import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { once } from "node:events";
import { createConnection, type Socket } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { boundaryDeadline, boundedReadiness, waitForFile } from "./boundary-readiness.js";

// Computed URL imports exercise the executable JS harness without a second TS package.
const boundary = await import(new URL("../scripts/opencode-boundary.mjs", import.meta.url).href);
const smoke = await import(new URL("../scripts/opencode-smoke.mjs", import.meta.url).href);

test("child environment excludes ambient credentials and config", () => {
  const names = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "OPENCODE_CONFIG_CONTENT", "OPENCODE_PURE", "OPENCODE_SERVER_PASSWORD", "AWS_SECRET_ACCESS_KEY", "GITHUB_TOKEN", "HTTP_PROXY"];
  const saved = names.map((name) => process.env[name]);
  const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
  const comSpec = process.env.ComSpec;
  try {
    for (const name of names) process.env[name] = "synthetic-ambient-control";
    process.env.ComSpec = String.raw`C:\Windows\System32\cmd.exe`;
    for (const target of ["linux", "win32"]) {
      // Synchronous scope exercises both allowlist branches without launching a foreign shell.
      Object.defineProperty(process, "platform", { value: target });
      const env = boundary.isolatedEnvironment("/isolated");
      for (const name of names) assert.ok(!Object.hasOwn(env, name), `${name} leaked into the host environment`);
      assert.equal(env.ComSpec, target === "win32" ? process.env.ComSpec : undefined);
      assert.equal(env.HOME, path.join("/isolated", "home"));
      assert.equal(env.OPENCODE_CONFIG, path.join("/isolated", "opencode.json"));
      assert.equal(env.OPENCODE_DISABLE_MODELS_FETCH, "1");
    }
  } finally {
    Object.defineProperty(process, "platform", platform);
    if (comSpec === undefined) delete process.env.ComSpec; else process.env.ComSpec = comSpec;
    names.forEach((name, i) => { if (saved[i] === undefined) delete process.env[name]; else process.env[name] = saved[i]; });
  }
});

test("missing binary and stalled process are loud failures", async () => {
  await assert.rejects(boundary.runProcess(path.join(tmpdir(), "hugr-missing-binary", "opencode"), []), /Cannot execute.*ENOENT/);
  await assert.rejects(boundary.runProcess(process.execPath, ["-e", "setTimeout(() => {}, 10000)"], { timeout: 100 }), /OpenCode timeout after 100 ms/);
});

// This fake host tests harness failure paths only. Real-host compatibility is a separate executable proof.
const HOST = `import { readFile, writeFile } from "node:fs/promises";
if (process.env.LAUNCH_GATE) {
  await writeFile(process.env.PID_FILE + ".waiting", "HUGR_LAUNCH_HELD");
  for (;;) {
    try { await readFile(process.env.LAUNCH_GATE); break; }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
const cfg = JSON.parse(await readFile(process.env.OPENCODE_CONFIG, "utf8"));
const url = cfg.provider["hugr-mock"].options.baseURL + "/chat/completions";
const messages = [{role: "user", content: "HUGR_BOUNDARY"}];
const request = async () => { const response = await fetch(url, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({model: "boundary", messages, tools: [{type: "function", function: {name: "bash"}}], stream: false})}); return await response.json(); };
const first = await request();
const call = first.choices[0].message.tool_calls[0];
const args = JSON.parse(call.function.arguments);
if (process.env.PROBE === "no-second") process.exit(0);
if (process.env.PROBE === "detached-hold") {
  const { spawn } = await import("node:child_process");
  const descendant = spawn(process.execPath, ["-e", "process.stdout.write('HUGR_HELD_STDOUT\\\\n'); process.stderr.write('HUGR_HELD_STDERR\\\\n'); setInterval(() => {}, 1000)"], { cwd: process.env.HOLD_CWD, detached: true, stdio: ["ignore", "inherit", "inherit"] });
  await writeFile(process.env.PID_FILE, JSON.stringify({ pid: descendant.pid, url }));
  descendant.unref();
  process.exit(0);
}
const output = {title: args.command, output: "HUGR_RAW_SENTINEL\\n", metadata: {exit: 0, truncated: false}};
const spec = cfg.plugin[0];
if (process.env.PROBE === "literal-spec") {
  if (JSON.stringify(spec) !== JSON.stringify(["hugr-lean", {enabled: false}])) throw new Error("Literal package-name tuple was rewritten");
} else if (spec) {
  const [url, options] = Array.isArray(spec) ? spec : [spec];
  const hooks = await (await import(url)).default({}, options);
  await hooks["tool.execute.after"]({tool: "bash", args, sessionID: "fake", callID: call.id}, output);
}
messages.push(first.choices[0].message, {role: "tool", tool_call_id: call.id, content: process.env.PROBE === "changed-result" ? "HUGR_CORRUPT_RESULT" : output.output});
await request();
if (process.env.PROBE !== "no-event") console.log(JSON.stringify({type: "tool_use", part: {tool: "bash", callID: call.id, state: {status: "completed", input: args, ...output}}}));
`;

test("mock round trip is non-vacuous; absent second request or bash event fails", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "hugr-boundary-teeth-"));
  try {
    const host = path.join(root, "host.mjs");
    await writeFile(host, HOST);
    const options = { binary: process.execPath, binaryArgs: [host], timeout: 10000, dependencies: false, keep: false };
    const good = await boundary.runScenario(options);
    boundary.assertSentinel(good, false);
    assert.equal(good.requests, 2);
    const changed = await boundary.runScenario({ ...options, hook: true, pluginOptions: { boundary: "tuple" } });
    boundary.assertSentinel(changed, true);
    assert.deepEqual(changed.hooks[0].options, { boundary: "tuple" });
    for (const [probe, error] of [["no-second", /Mock did not receive exactly one second-request tool result/], ["no-event", /No unique bash completion event/], ["changed-result", /exact completed tool result/]] as const) {
      await assert.rejects(boundary.runScenario({ ...options, setup: async ({ env }: { env: NodeJS.ProcessEnv }) => { env.PROBE = probe; } }), error);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("scenario copies a normal isolated SDK and dereferences an absolute internal alias before setup", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "hugr-sdk-scenario-"));
  try {
    const dependencies = path.join(root, "config/opencode"), sdk = path.join(dependencies, "node_modules/sdk");
    await mkdir(sdk, { recursive: true });
    await writeFile(path.join(dependencies, "package.json"), '{"private":true}');
    await writeFile(path.join(dependencies, "package-lock.json"), '{"lockfileVersion":3}');
    await writeFile(path.join(sdk, "payload.txt"), "SDK_ORIGINAL");
    await writeFile(path.join(dependencies, "auth.json"), "SYNTHETIC_AUTH_MUST_NOT_COPY");
    await symlink(sdk, path.join(dependencies, "node_modules/sdk-alias"), process.platform === "win32" ? "junction" : "dir");
    const host = path.join(root, "host.mjs");
    await writeFile(host, HOST);
    const result = await boundary.runScenario({ binary: process.execPath, binaryArgs: [host], timeout: 10000, dependencies, keep: false,
      setup: async ({ env }: { env: NodeJS.ProcessEnv }) => {
        const copied = env.OPENCODE_CONFIG_DIR!;
        assert.deepEqual((await readdir(copied)).sort(), ["node_modules", "package-lock.json", "package.json"]);
        assert.equal((await lstat(path.join(copied, "node_modules/sdk-alias"))).isSymbolicLink(), false);
        await writeFile(path.join(copied, "node_modules/sdk-alias/payload.txt"), "SCENARIO_ONLY");
      } });
    boundary.assertSentinel(result, false);
    assert.equal(await readFile(path.join(sdk, "payload.txt"), "utf8"), "SDK_ORIGINAL");
  } finally { await rm(root, { recursive: true, force: true }); }
});

async function heldPipeTimeout(delayed: boolean): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), "hugr-held-pipes-"));
  const pidFile = path.join(root, "descendant.json");
  let isolatedRoot = "";
  let watchdog: NodeJS.Timeout | undefined;
  let deadline: ReturnType<typeof boundaryDeadline> | undefined;
  try {
    const host = path.join(root, "host.mjs");
    await writeFile(host, HOST);
    deadline = boundaryDeadline(host, 2500);
    const launchGate = path.join(root, "launch");
    const execution = boundary.runScenario({ binary: process.execPath, binaryArgs: [host], timeout: 2500, dependencies: false, keep: false, setup: async ({ root, env }: { root: string; env: NodeJS.ProcessEnv }) => {
      isolatedRoot = root;
      assert.ok((await stat(root)).isDirectory());
      env.PROBE = "detached-hold";
      env.PID_FILE = pidFile;
      env.HOLD_CWD = path.dirname(pidFile); // Keep the pipe owner outside the scenario root, including on Windows.
      if (delayed) env.LAUNCH_GATE = launchGate;
    } });
    let settled = false;
    void execution.then(() => { settled = true; }, () => { settled = true; });
    if (delayed) {
      await deadline.registered();
      assert.equal(await waitForFile(pidFile + ".waiting"), "HUGR_LAUNCH_HELD");
      await delay(2600); // Cross the unchanged 2500ms wall deadline while native launch is explicitly held.
      assert.equal(deadline.ready, false, "Held launch was mistaken for pipe readiness");
      assert.equal(deadline.fired, false, "Timeout fired before native evidence");
      assert.equal(settled, false, "Execution settled before native readiness");
      await assert.rejects(stat(pidFile), { code: "ENOENT" });
      await writeFile(launchGate, "release");
    }
    await boundedReadiness(Promise.race([deadline.fire(pidFile), execution.then(() => { throw new Error("Host returned before timeout readiness"); })]), "BOUNDARY_HOST_READINESS_MISSING");
    await assert.rejects(Promise.race([execution, new Promise((_, reject) => { watchdog = setTimeout(() => reject(new Error("Timeout stayed pending while detached descendant retained pipes")), 7500); })]), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /OpenCode timeout after 2500 ms/);
      assert.match(error.message, /HUGR_HELD_STDOUT/);
      assert.match(error.message, /HUGR_HELD_STDERR/);
      assert.match(error.message, /Mock requests received: 1; tool results: 0/);
      return true;
    });
    const held = JSON.parse(await readFile(pidFile, "utf8")) as { pid: number; url: string };
    assert.ok(Number.isInteger(held.pid) && held.pid > 0);
    process.kill(held.pid, 0); // Positive control: the detached pipe owner is still alive after settlement.
    await assert.rejects(stat(isolatedRoot), { code: "ENOENT" });
    await assert.rejects(fetch(held.url, { signal: AbortSignal.timeout(1000) }), (error: unknown) => error instanceof Error && error.cause instanceof Error && "code" in error.cause && error.cause.code === "ECONNREFUSED");
  } finally {
    deadline?.restore();
    clearTimeout(watchdog);
    try {
      const { pid } = JSON.parse(await readFile(pidFile, "utf8")) as { pid: number };
      try { process.kill(pid, "SIGKILL"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    if (isolatedRoot) await rm(isolatedRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
}

test("timeout settles despite detached descendant pipes and cleans the mock/root", async (t) => {
  for (const delayed of [false, true]) await t.test(delayed ? "delayed launch cannot imply timeout readiness" : "ready child holds both pipes", async () => {
    await heldPipeTimeout(delayed);
  });
});

test("immediately next model request rejects intervening traffic and mismatched tool calls", async () => {
  for (const defect of ["intervening", "wrong-result-id", "changed-call"] as const) {
    const args = { command: "cargo test", timeout: 5000 };
    const mock = await boundary.createMockProvider(args);
    try {
      const messages: Record<string, unknown>[] = [{ role: "user", content: "HUGR_BOUNDARY" }];
      const request = async (withTools = true) => await fetch(`${mock.url}/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "boundary", messages, stream: false, ...(withTools ? { tools: [{ function: { name: "bash" } }] } : {}) }) });
      const first = await request();
      assert.equal(first.status, 200);
      const assistant = (await first.json()).choices[0].message;
      assert.equal(assistant.tool_calls[0].id, "hugr_call");
      if (defect !== "intervening") {
        if (defect === "changed-call") assistant.tool_calls[0].function.arguments = JSON.stringify({ ...args, command: "rewritten" });
        messages.push(assistant, { role: "tool", tool_call_id: defect === "wrong-result-id" ? "unissued_call" : "hugr_call", content: "native output" });
      }
      const second = await request(defect !== "intervening");
      assert.equal(second.status, 400, `Mock accepted ${defect} instead of the exact next-request tool result`);
      assert.match((await second.json()).error.message, defect === "changed-call" ? /changed the issued bash call/ : /Immediately next mock request/);
      assert.deepEqual(mock.modelResults, []);
    } finally { await mock.close(); }
  }
});

test("held request bodies cannot reorder or hide extra model requests", async () => {
  for (const holdThirdBody of [true, false]) {
    const mock = await boundary.createMockProvider({ command: "cargo test", timeout: 5000 });
    const sockets: Socket[] = [];
    try {
      const first = await fetch(`${mock.url}/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "boundary", stream: false, tools: [{ function: { name: "bash" } }], messages: [{ role: "user", content: "HUGR_BOUNDARY" }] }) });
      assert.equal(first.status, 200);
      const assistant = (await first.json()).choices[0].message;
      assert.equal(mock.receivedRequests, 1);
      assert.deepEqual(mock.unfinishedRequests, []);
      const body = JSON.stringify({ model: "boundary", stream: false, messages: [{ role: "user", content: "HUGR_BOUNDARY" }, assistant, { role: "tool", tool_call_id: assistant.tool_calls[0].id, content: "native output" }] });
      const openRequest = async (holdBody: boolean) => {
        const socket = createConnection({ host: "127.0.0.1", port: Number(new URL(mock.url).port) });
        sockets.push(socket);
        let output = "";
        const response = new Promise<string>((resolve) => {
          socket.on("data", (chunk) => { output += chunk; });
          socket.once("close", () => resolve(output));
          socket.on("error", () => resolve(output)); // Settle on errors; missing HTTP rejection evidence fails the assertions.
          socket.setTimeout(2000, () => socket.destroy());
        });
        await once(socket, "connect");
        socket.write(`POST /v1/chat/completions HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body, "utf8")}\r\nConnection: close\r\n\r\n`);
        if (!holdBody) socket.write(body);
        return { socket, response };
      };
      const second = await openRequest(true);
      const deadline = Date.now() + 1000;
      while (!mock.unfinishedRequests.includes(2) && Date.now() < deadline) await delay(5);
      assert.deepEqual(mock.unfinishedRequests, [2], "Held headers did not enter the HTTP handler");
      assert.equal(mock.receivedRequests, 2, "Request ordinal was deferred until body parsing");
      const third = await openRequest(holdThirdBody);
      const rejected = await third.response;
      assert.match(rejected, /^HTTP\/1\.1 400/, "Extra request must fail before its body is read");
      assert.ok(rejected.includes("Mock received an extra request"));
      assert.equal(mock.receivedRequests, 3);
      assert.deepEqual(mock.modelResults, []);
      assert.ok(mock.errors.some((error: string) => error.includes("extra request")));
      second.socket.write(body);
      const poisoned = await second.response;
      assert.match(poisoned, /^HTTP\/1\.1 400/, "Previously held request must stay failed after an extra arrival");
      assert.ok(poisoned.includes("Mock session already rejected a request"));
      assert.deepEqual(mock.modelResults, []);
      assert.deepEqual(mock.unfinishedRequests, []);
    } finally {
      for (const socket of sockets) socket.destroy();
      await mock.close();
    }
  }
});

test("SSE mock emits unchanged native command arguments", async () => {
  const args = { command: "cargo test", timeout: 5000 };
  const mock = await boundary.createMockProvider(args);
  try {
    const response = await fetch(`${mock.url}/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "boundary", stream: true, tools: [{ function: { name: "bash" } }], messages: [{ role: "user", content: "HUGR_BOUNDARY" }] }) });
    assert.equal(response.status, 200);
    const data = (await response.text()).split("\n\n").filter((line) => line.startsWith("data: {"));
    assert.equal(data.length, 2);
    const call = JSON.parse(data[0]!.slice(6)).choices[0].delta.tool_calls[0];
    assert.equal(call.function.name, "bash");
    assert.deepEqual(JSON.parse(call.function.arguments), args);
    assert.deepEqual(mock.errors, []);
  } finally { await mock.close(); }
});

test("package smoke rejects unchanged output, lost evidence and changed metadata", () => {
  const raw = { command: "cargo test", modelResult: { content: smoke.CARGO }, tool: { state: { output: smoke.CARGO, title: "cargo test", metadata: { output: smoke.CARGO, exit: 0, truncated: false } } } };
  const reduced = structuredClone(raw);
  reduced.modelResult.content = `${smoke.SUMMARY}\n`;
  reduced.tool.state.output = reduced.modelResult.content;
  smoke.assertReduction(raw, reduced);
  assert.throws(() => smoke.assertReduction(raw, raw), /did not reduce/);
  const lost = structuredClone(reduced);
  lost.tool.state.output = lost.modelResult.content = "40 passed\n";
  assert.throws(() => smoke.assertReduction(raw, lost), /lost the exact Cargo summary/);
  const status = structuredClone(reduced);
  status.tool.state.metadata.exit = 7;
  assert.throws(() => smoke.assertReduction(raw, status), /changed native metadata/);
});

test("package smoke cannot report green without a compiled plugin", async () => {
  await assert.rejects(smoke.runSmoke({ plugin: "" }), /HUGR_PLUGIN must point to the compiled real package plugin/);
});

test("literal package-name tuples stay literal in host config", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "hugr-package-spec-"));
  try {
    const host = path.join(root, "host.mjs");
    await writeFile(host, HOST);
    const result = await boundary.runScenario({ binary: process.execPath, binaryArgs: [host], dependencies: false, keep: false, pluginSpec: "hugr-lean", pluginOptions: { enabled: false }, setup: async ({ env }: { env: NodeJS.ProcessEnv }) => { env.PROBE = "literal-spec"; } });
    assert.deepEqual(result.pluginEntry, ["hugr-lean", { enabled: false }]);
    boundary.assertSentinel(result, false); // Config-forwarding proof only; this fake host does not resolve npm packages.
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("package-name oracle rejects file loading and ignored tuple options", () => {
  const enabled = { pluginEntry: ["hugr-lean", { enabled: true }], modelResult: { content: `${smoke.SUMMARY}\n` } };
  const disabled = { pluginEntry: ["hugr-lean", { enabled: false }], modelResult: { content: smoke.CARGO } };
  smoke.assertPackageTuple(enabled, true);
  smoke.assertPackageTuple(disabled, false);
  assert.throws(() => smoke.assertPackageTuple({ ...enabled, pluginEntry: ["file:///package/dist/index.js", { enabled: true }] }, true), /literal package-name tuple/);
  assert.throws(() => smoke.assertPackageTuple({ ...disabled, modelResult: enabled.modelResult }, false), /did not disable filtering/);
});

test("package-name proof rejects missing tarballs rather than skipping", async () => {
  await assert.rejects(smoke.runPackageSmoke({ tarball: path.join(tmpdir(), "hugr-missing-tarball", "package.tgz") }), /ENOENT/);
});
