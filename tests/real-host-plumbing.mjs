/** Synthetic process transport only; real observer, compiled hook and host oracle stay active. */
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { isolatedEnvironment, runProcess, runScenario } from "../scripts/opencode-boundary.mjs";

export const README = "Mock project README café 🔥.\n";
export const GIT = `On branch host-native

Changes to be committed:
  (use "git restore --staged <file>..." to unstage)
\tnew file:   host-staged-café.txt

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
\tmodified:   README.md

Untracked files:
  (use "git add <file>..." to include in what will be committed)
\thost-untracked-🔥.txt

`;
export const RG = "src/mock-long-path-café.ts:1:readonly café\nsrc/mock-long-path-café.ts:2:readonly 🔥\nsrc/mock-long-path-café.ts:3:readonly end\n";
const CARGO = "    Finished `test` profile [unoptimized + debuginfo] target(s) in 0.01s\n     Running unittests main.rs (target/debug/deps/unit-0000)\nrunning 3 tests\ntest tests::first ... ok\ntest tests::café ... ok\ntest tests::network ... ignored, needs network 🔥\ntest result: ok. 2 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.00s\n";
export const FAILURE = "fatal: ambiguous argument 'missing-HuGR-real-host-ref': unknown revision or path not in the working tree.\n";
const CASES = [
  { id: "git-status", command: "git status", original: GIT, exit: 0 },
  { id: "rg-source", command: "rg -n 'readonly' src", original: RG, exit: 0 },
  { id: "git-diff", command: "git diff -- README.md", original: "diff --git a/README.md b/README.md\n--- a/README.md\n+++ b/README.md\n@@ -1 +1,2 @@\n native\n+Native host diff evidence café 🔥.\n", exit: 0 },
  { id: "cargo-native", command: "cargo test", original: CARGO, exit: 0 },
  { id: "unknown-read", command: "cat README.md", original: README, exit: 0 },
  { id: "git-failed", command: "git show missing-HuGR-real-host-ref", original: FAILURE, exit: 128 },
  { id: "host-truncated", command: "git status --untracked-files=all", original: "retained mock tail café 🔥\n", exit: 0, truncated: true },
];

const FAKE_HOST = `import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
const cfg = JSON.parse(await readFile(process.env.OPENCODE_CONFIG, "utf8"));
const fixture = JSON.parse(process.env.PLUMBING_ENTRY);
console.log("MOCK_PLUMBING_STDOUT café 🔥");
console.error("MOCK_PLUMBING_STDERR café 🔥");
const messages = [{role: "user", content: "HUGR_BOUNDARY"}];
const request = async () => {
  const response = await fetch(cfg.provider["hugr-mock"].options.baseURL + "/chat/completions", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({model: "boundary", messages, tools: [{function: {name: "bash"}}], stream: false})});
  if (!response.ok) throw new Error(await response.text());
  return await response.json();
};
const assistant = (await request()).choices[0].message;
const call = assistant.tool_calls[0], args = JSON.parse(call.function.arguments);
let original = fixture.original, preview = original, outputPath;
if (fixture.truncated) {
  outputPath = path.join(path.dirname(process.env.OPENCODE_CONFIG), "mock-full.txt");
  await writeFile(outputPath, "host-stress-".repeat(5000) + original);
  preview = "...\\n\\n" + original;
  original = "...output truncated...\\n\\nFull output saved to: " + outputPath + "\\n\\n" + original;
}
const output = {title: args.command, output: original, metadata: {exit: fixture.exit, truncated: fixture.truncated === true, output: preview, ...(outputPath ? {outputPath} : {}), mockFuture: {nested: ["café", "🔥", {retained: true}]}}};
const [url, options] = cfg.plugin[0];
const hooks = await (await import(url)).default({}, options);
await hooks["tool.execute.after"]({tool: "bash", args, callID: call.id, sessionID: "mock-plumbing"}, output);
messages.push(assistant, {role: "tool", tool_call_id: call.id, content: output.output});
await request();
if (process.env.PLUMBING_NO_COMPLETION !== "1") console.log(JSON.stringify({type: "tool_use", part: {tool: "bash", callID: call.id, state: {status: "completed", input: args, ...output}}}));
`;

export async function plumbingFixture(repoRoot, rejectOn) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "hugr-host-runner-")));
  const compiled = path.join(root, "compiled"), sdk = path.join(root, "sdk"), fakeHost = path.join(root, "fake-host.mjs");
  const roots = new Set(), checks = [], resolutions = [], transports = [];
  try {
    await mkdir(compiled);
    await writeFile(path.join(compiled, "package.json"), '{"type":"module"}');
    const build = await runProcess(process.execPath, [path.join(repoRoot, "node_modules/typescript/bin/tsc"), "-p", path.join(repoRoot, "tsconfig.build.json"), "--outDir", path.join(compiled, "dist")], { cwd: repoRoot, env: isolatedEnvironment(root), timeout: 45000 });
    assert.equal(build.code, 0, build.stdout + build.stderr);
    await mkdir(path.join(sdk, "node_modules/@opencode-ai/plugin"), { recursive: true });
    await writeFile(path.join(sdk, "package.json"), '{"private":true}');
    await writeFile(path.join(sdk, "package-lock.json"), '{"lockfileVersion":3,"fixture":"mock-plumbing"}');
    await writeFile(path.join(sdk, "node_modules/@opencode-ai/plugin/package.json"), '{"version":"1.18.17","fixture":"mock-plumbing"}');
    await writeFile(fakeHost, FAKE_HOST);
    const execution = {
      checked: async (binary, args, context, name) => {
        roots.add(context.cwd); checks.push({ binary, args, name });
        assert.ok(context.env.HOME.startsWith(context.cwd + path.sep));
        assert.equal(context.env.OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER, "1");
        return { code: 0, signal: null, stdout: binary === "mock-opencode" ? "1.18.17\n" : `mock-${binary}\n`, stderr: "" };
      },
      resolvedTool: async (binary) => { resolutions.push(binary); return path.join(root, "mock-tool-paths", binary); },
      provision: async (_repo, setupRoot) => {
        roots.add(setupRoot);
        const cwd = path.join(setupRoot, "mock-project");
        await mkdir(cwd);
        await writeFile(path.join(cwd, "README.md"), README);
        await cp(path.join(repoRoot, "fixtures/runners/native"), path.join(cwd, "fixtures/runners/native"), { recursive: true });
        return { cwd, source: "mock-plumbing" };
      },
      runScenario: async (options) => {
        const entry = CASES.find((item) => item.command === options.command);
        assert.ok(entry, `Unexpected issued command: ${options.command}`);
        transports.push(entry.id);
        return await runScenario({ ...options, binary: process.execPath, binaryArgs: [fakeHost], setup: async (context) => {
          roots.add(context.root);
          await options.setup(context);
          assert.equal(await readFile(path.join(context.cwd, "README.md"), "utf8"), README);
          assert.equal(context.env.GIT_CONFIG_NOSYSTEM, "1");
          assert.equal(context.env.OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER, "1");
          assert.equal(JSON.parse(await readFile(path.join(context.env.OPENCODE_CONFIG_DIR, "node_modules/@opencode-ai/plugin/package.json"), "utf8")).fixture, "mock-plumbing");
          if (entry.id === "cargo-native") {
            assert.equal(context.env.CARGO_HOME, path.join(path.dirname(context.cwd), "cargo-home"));
            assert.equal(context.env.CARGO_NET_OFFLINE, "true");
            for (const file of ["Cargo.toml", "main.rs"]) assert.deepEqual(await readFile(path.join(context.cwd, file)), await readFile(path.join(repoRoot, "fixtures/runners/native", file)));
          }
          if (entry.truncated) assert.equal((await readdir(path.join(context.cwd, "host-stress"))).length, 1800);
          context.env.PLUMBING_ENTRY = JSON.stringify(entry);
          context.env.PLUMBING_NO_COMPLETION = entry.id === rejectOn ? "1" : "0";
        } });
      },
    };
    return { root, compiled, sdk, execution, checks, resolutions, transports, cleanup: async () => {
      for (const retained of roots) await rm(retained, { recursive: true, force: true });
      await rm(root, { recursive: true, force: true });
    } };
  } catch (error) { await rm(root, { recursive: true, force: true }); throw error; }
}
