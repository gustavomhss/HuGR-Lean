import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createAfterHook } from "../src/opencode/index.js";

const host = await import(new URL("../scripts/real-world/host.mjs", import.meta.url).href);
const boundary = await import(new URL("../scripts/opencode-boundary.mjs", import.meta.url).href);
const gitCase = host.HOST_SCENARIOS.find((item: { oracle: string }) => item.oracle === "git");
const sha = (text: string) => createHash("sha256").update(text).digest("hex");

async function nativeGit(root: string) {
  const cwd = path.join(root, "project");
  await mkdir(cwd);
  const env = boundary.isolatedEnvironment(root, {
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_COUNT: "2", GIT_CONFIG_KEY_0: "core.quotePath", GIT_CONFIG_VALUE_0: "false", GIT_CONFIG_KEY_1: "color.ui", GIT_CONFIG_VALUE_1: "false",
  });
  const git = async (args: string[]) => {
    const result = await boundary.runProcess("git", args, { cwd, env, timeout: 5000 });
    assert.equal(result.code, 0, result.stderr);
    return result.stdout as string;
  };
  await git(["init", "--quiet", "-b", "host-native"]);
  await writeFile(path.join(cwd, "README.md"), "native tracked file\n");
  await git(["add", "--", "README.md"]);
  await git(["-c", "user.name=Host Unit", "-c", "user.email=host-unit@example.invalid", "commit", "--quiet", "-m", "Create the native Git oracle control"]);
  await writeFile(path.join(cwd, "README.md"), "native tracked file\nactual change café 🔥\n");
  await writeFile(path.join(cwd, "host-staged-café.txt"), "staged\n");
  await git(["add", "--", "host-staged-café.txt"]);
  await writeFile(path.join(cwd, "host-untracked-🔥.txt"), "untracked\n");
  return { cwd, env, original: await git(["status"]) };
}

// Unit specimens use native Git bytes, synthetic host metadata. Native-host proof is host.mjs CLI.
function specimen(original: string, model: string, command = gitCase.command, exit = 0, truncated = false) {
  const metadata = { exit, truncated, output: original, futureNativeField: { nested: ["café", "🔥", { retained: true }] } };
  const input = { tool: "bash", args: { command, description: "Local deterministic boundary probe", timeout: 30000 }, callID: "unit-call", sessionID: "unit-session" };
  const before = { title: "native unit title", output: original, metadata };
  const after = { ...structuredClone(before), output: model };
  return {
    result: { command, requests: 2, modelResult: { content: model }, tool: { callID: input.callID, state: { status: "completed", input: input.args, ...structuredClone(after) } } },
    rows: [{ kind: "loaded", hookPresent: true, options: { enabled: true, raw: false } },
      { kind: "before", input: structuredClone(input), boundary: structuredClone(before), originalSha256: sha(original) },
      { kind: "after", input: structuredClone(input), boundary: structuredClone(after), hookElapsedMs: 0.25 }],
  };
}

test("native Git calibrates reduction oracle; no-op hook, wrong original and evidence loss fail", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "hugr-real-host-oracle-"));
  try {
    const { original } = await nativeGit(root);
    const output = { title: "native unit title", output: original, metadata: { exit: 0, truncated: false, output: original } };
    await createAfterHook({ enabled: true, raw: false })({ tool: "bash", args: { command: "git status" } }, output);
    assert.ok(Buffer.byteLength(output.output) < Buffer.byteLength(original), "Native Git positive control must really reduce");
    const good = specimen(original, output.output);
    const facts = host.verifyHostScenario(gitCase, good.result, good.rows);
    assert.equal(facts.savedBytes, Buffer.byteLength(original) - Buffer.byteLength(output.output));
    assert.equal(facts.metadataExact, true);
    assert.deepEqual(facts.metadataBefore.futureNativeField, facts.nativeMetadata.futureNativeField);
    const noOp = specimen(original, original);
    assert.throws(() => host.verifyHostScenario(gitCase, noOp.result, noOp.rows), /REAL_HOST_KNOWN_GIT_NOT_REDUCED/);
    const wrong = specimen(original, output.output);
    wrong.rows[1]!.boundary!.output = output.output;
    assert.throws(() => host.verifyHostScenario(gitCase, wrong.result, wrong.rows), /REAL_HOST_ORIGINAL_MISMATCH/);
    const forged = specimen("forged original\n", "forged\n");
    forged.rows[1]!.boundary!.metadata.output = original;
    forged.rows[2]!.boundary!.metadata.output = original;
    forged.result.tool.state.metadata.output = original;
    assert.throws(() => host.verifyHostScenario(gitCase, forged.result, forged.rows), /REAL_HOST_ORIGINAL_NATIVE_MISMATCH/);
    const lost = specimen(original, output.output.replace("On branch host-native\n", ""));
    assert.throws(() => host.verifyHostScenario(gitCase, lost.result, lost.rows), /REAL_HOST_GIT_EVIDENCE_LOST/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("oracle names absent observers, requests, changed commands and nested/exit metadata", () => {
  const exactCase = host.HOST_SCENARIOS.find((item: { id: string }) => item.id === "unknown-read");
  const good = specimen("native unknown café 🔥\n", "native unknown café 🔥\n", exactCase.command);
  host.verifyHostScenario(exactCase, good.result, good.rows);
  assert.throws(() => host.verifyHostScenario(exactCase, good.result, []), /REAL_HOST_OBSERVER_MISSING/);
  assert.throws(() => host.verifyHostScenario(exactCase, good.result, good.rows.slice(0, 1)), /REAL_HOST_OBSERVER_ROUNDTRIP_MISSING/);
  const missing = structuredClone(good);
  missing.result.requests = 1;
  assert.throws(() => host.verifyHostScenario(exactCase, missing.result, missing.rows), /REAL_HOST_SECOND_REQUEST_MISSING/);
  const changed = structuredClone(good);
  changed.result.tool.state.input.command = "rewritten";
  assert.throws(() => host.verifyHostScenario(exactCase, changed.result, changed.rows), /REAL_HOST_COMMAND_CHANGED/);
  for (const field of ["timeout", "description"] as const) {
    for (const scope of ["all", "before", "after", "native"] as const) {
      const args = structuredClone(good);
      const inputs = [args.rows[1]!.input!.args, args.rows[2]!.input!.args, args.result.tool.state.input];
      const targets = scope === "all" ? inputs : [inputs[{ before: 0, after: 1, native: 2 }[scope]!]];
      for (const input of targets) Object.assign(input!, { [field]: field === "timeout" ? 30001 : "mutated description" });
      assert.throws(() => host.verifyHostScenario(exactCase, args.result, args.rows), /REAL_HOST_ARGUMENTS_CHANGED/, `${field}/${scope} must match issued arguments`);
    }
  }
  const facts = host.verifyHostScenario(exactCase, good.result, good.rows);
  assert.deepEqual(facts.issuedArgs, good.result.tool.state.input);
  assert.deepEqual(facts.observerArgsBefore, facts.nativeInput);
  assert.equal(facts.requests, 2);
  const nested = structuredClone(good);
  nested.rows[2]!.boundary!.metadata.futureNativeField.nested[2] = "lost";
  assert.throws(() => host.verifyHostScenario(exactCase, nested.result, nested.rows), /REAL_HOST_METADATA_CHANGED/);
  const exit = structuredClone(good);
  exit.result.tool.state.metadata.exit = 7;
  assert.throws(() => host.verifyHostScenario(exactCase, exit.result, exit.rows), /REAL_HOST_EXIT_METADATA_MISMATCH/);
  const changedText = specimen("native unknown café 🔥\n", "native unknown\n", exactCase.command);
  assert.throws(() => host.verifyHostScenario(exactCase, changedText.result, changedText.rows), /REAL_HOST_EXACT_OUTPUT_CHANGED/);
});

test("rg evidence, failed exits, Cargo ignored evidence and upstream truncation have teeth", () => {
  const rgCase = host.HOST_SCENARIOS.find((item: { oracle: string }) => item.oracle === "rg");
  const rg = specimen("src/café.ts:1:readonly café\nsrc/café.ts:2:readonly 🔥\n", "src/café.ts:\n1:readonly café\n2:readonly 🔥\n", rgCase.command);
  host.verifyHostScenario(rgCase, rg.result, rg.rows);
  const lostRg = specimen(rg.rows[1]!.boundary!.output, "src/café.ts:\n1:readonly café\n", rgCase.command);
  assert.throws(() => host.verifyHostScenario(rgCase, lostRg.result, lostRg.rows), /REAL_HOST_RG_EVIDENCE_LOST/);
  const failedCase = host.HOST_SCENARIOS.find((item: { oracle: string }) => item.oracle === "failure");
  const failure = "fatal: ambiguous argument 'missing-HuGR-real-host-ref': unknown revision or path not in the working tree.\n";
  const failed = specimen(failure, failure, failedCase.command, 128);
  host.verifyHostScenario(failedCase, failed.result, failed.rows);
  const changedFailure = specimen(failure, "fatal: missing ref\n", failedCase.command, 128);
  assert.throws(() => host.verifyHostScenario(failedCase, changedFailure.result, changedFailure.rows), /REAL_HOST_EXACT_OUTPUT_CHANGED/);
  const fakeExit = specimen(failure, failure, failedCase.command, 0);
  assert.throws(() => host.verifyHostScenario(failedCase, fakeExit.result, fakeExit.rows), /REAL_HOST_UNEXPECTED_EXIT/);
  const cargoCase = host.HOST_SCENARIOS.find((item: { oracle: string }) => item.oracle === "cargo");
  const cargoText = "    Finished `test` profile [unoptimized + debuginfo] target(s) in 0.01s\n     Running unittests main.rs (target/debug/deps/unit-0000)\nrunning 3 tests\ntest tests::arithmetic ... ok\ntest tests::café ... ok\ntest tests::network ... ignored, needs network 🔥\ntest result: ok. 2 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.00s\n";
  const cargo = specimen(cargoText, cargoText, cargoCase.command);
  host.verifyHostScenario(cargoCase, cargo.result, cargo.rows);
  const lostCargo = specimen(cargoText, cargoText.replace("test tests::network ... ignored, needs network 🔥\n", ""), cargoCase.command);
  assert.throws(() => host.verifyHostScenario(cargoCase, lostCargo.result, lostCargo.rows), /REAL_HOST_CARGO_EVIDENCE_LOST/);
  const stressCase = host.HOST_SCENARIOS.find((item: { oracle: string }) => item.oracle === "truncated");
  const text = "...output truncated...\n\nFull output saved to: /unit/native-output\n\nretained native tail\n";
  const stress = specimen(text, text, stressCase.command, 0, true);
  for (const row of stress.rows.slice(1)) Object.assign(row.boundary!.metadata, { outputPath: "/unit/native-output", output: "...\n\nretained native tail\n" });
  Object.assign(stress.result.tool.state.metadata, { outputPath: "/unit/native-output", output: "...\n\nretained native tail\n" });
  assert.equal(host.verifyHostScenario(stressCase, stress.result, stress.rows).savedBytes, 0);
  const lostStress = structuredClone(stress);
  lostStress.result.modelResult.content = lostStress.result.tool.state.output = lostStress.rows[2]!.boundary!.output = "native status prefix\n";
  assert.throws(() => host.verifyHostScenario(stressCase, lostStress.result, lostStress.rows), /REAL_HOST_EXACT_OUTPUT_CHANGED/);
  const wrongTail = structuredClone(stress);
  for (const row of wrongTail.rows.slice(1)) row.boundary!.metadata.output = "...\n\nwrong original tail\n";
  wrongTail.result.tool.state.metadata.output = "...\n\nwrong original tail\n";
  assert.throws(() => host.verifyHostScenario(stressCase, wrongTail.result, wrongTail.rows), /REAL_HOST_ORIGINAL_NATIVE_MISMATCH/);
});

test("Cargo requires a complete grammar; every unknown/warning row stays exact", () => {
  const scenario = host.HOST_SCENARIOS.find((item: { oracle: string }) => item.oracle === "cargo");
  const finished = "    Finished `test` profile [unoptimized + debuginfo] target(s) in 0.01s\n";
  const runner = "     Running unittests main.rs (target/debug/deps/unit-0000)\n";
  const firstSkip = "test tests::network ... ignored, needs network 🔥\n", secondSkip = "test tests::café ... ignored, café context\n";
  const summary = "test result: ok. 1 passed; 0 failed; 2 ignored; 0 measured; 0 filtered out; finished in 0.00s\n";
  const compiling = "   Compiling runner-fixture v0.1.0 (/unit/café)\n";
  const original = `${compiling}${finished}${runner}\nrunning 3 tests\ntest tests::arithmetic ... ok\n${firstSkip}${secondSkip}\n${summary}\n`;
  const reduced = `${finished}${runner}${firstSkip}${secondSkip}${summary}`;
  const good = specimen(original, reduced, scenario.command);
  const facts = host.verifyHostScenario(scenario, good.result, good.rows);
  assert.equal(facts.cargoGrammarAdmitted, true);
  assert.equal(facts.savedBytes, Buffer.byteLength(original) - Buffer.byteLength(reduced));
  for (const altered of [
    `${finished}${runner}${secondSkip}${firstSkip}${summary}`, // Correct rows, wrong ignored order.
    reduced.replace(firstSkip, firstSkip.replace("needs network 🔥", "different context")),
    reduced.replace(secondSkip, ""),
    reduced.replace(firstSkip, firstSkip + firstSkip),
    reduced.replace(summary, summary + summary),
    reduced.replace("in 0.01s", "in 0.02s"),
  ]) {
    const lost = specimen(original, altered, scenario.command);
    assert.throws(() => host.verifyHostScenario(scenario, lost.result, lost.rows), /REAL_HOST_CARGO_EVIDENCE_LOST/);
  }
  const invalid = [
    ...["warning: native compiler warning café 🔥\n", "unexpected native row\n", "error[E0001]: native diagnostic\n", "note: native diagnostic context\n", "test captured warning ... diagnostic\n"].flatMap((row) => [
      row + original, original.replace(runner, runner + row), original.replace(firstSkip, firstSkip + row), original.replace(summary, row + summary), original + row,
    ]),
    original.replace("running 3 tests", "running 4 tests"),
    original.replace("running 3 tests", "running 3 test"),
    original.replace("1 passed; 0 failed; 2 ignored", "2 passed; 0 failed; 1 ignored"),
    original.replace("test tests::arithmetic ... ok", "test tests::network ... ok"),
    original.replace("0 filtered out", "9007199254740993 filtered out"),
    original.replace("test tests::arithmetic ... ok\n", ""),
    original + summary,
  ];
  for (const text of invalid) {
    const exact = specimen(text, text, scenario.command);
    assert.equal(host.verifyHostScenario(scenario, exact.result, exact.rows).cargoGrammarAdmitted, false);
    const dropped = specimen(text, reduced, scenario.command);
    assert.throws(() => host.verifyHostScenario(scenario, dropped.result, dropped.rows), /REAL_HOST_CARGO_UNKNOWN_CHANGED/);
  }
  // CRLF is admitted, and every retained row keeps its original ending and Unicode context.
  const crlf = specimen(original.replaceAll("\n", "\r\n"), reduced.replaceAll("\n", "\r\n"), scenario.command);
  assert.equal(host.verifyHostScenario(scenario, crlf.result, crlf.rows).cargoGrammarAdmitted, true);
  const changedEnding = specimen(crlf.rows[1]!.boundary!.output, reduced, scenario.command);
  assert.throws(() => host.verifyHostScenario(scenario, changedEnding.result, changedEnding.rows), /REAL_HOST_CARGO_EVIDENCE_LOST/);
});

// FAKE HOST: harness failure paths only. Never used by runRealHost/native measurements.
const UNIT_HOST = `import { readFile } from "node:fs/promises";
const cfg = JSON.parse(await readFile(process.env.OPENCODE_CONFIG, "utf8"));
const messages = [{role: "user", content: "HUGR_BOUNDARY"}];
const request = async () => { const response = await fetch(cfg.provider["hugr-mock"].options.baseURL + "/chat/completions", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({model: "boundary", messages, tools: [{function: {name: "bash"}}], stream: false})}); return await response.json(); };
const assistant = (await request()).choices[0].message;
const call = assistant.tool_calls[0], args = JSON.parse(call.function.arguments);
if (process.env.UNIT_PROBE === "no-second") process.exit(0);
const original = process.env.UNIT_ORIGINAL;
const output = {title: "unit fake host", output: original, metadata: {exit: 0, truncated: false, output: original, unitFuture: {nested: [1, "🔥"]}}};
if (process.env.UNIT_PROBE !== "no-observer") {
  const [url, options] = cfg.plugin[0];
  const hooks = await (await import(url)).default({}, options);
  await hooks["tool.execute.after"]({tool: "bash", args, callID: call.id, sessionID: "unit"}, output);
}
messages.push(assistant, {role: "tool", tool_call_id: call.id, content: output.output});
await request();
console.log(JSON.stringify({type: "tool_use", part: {tool: "bash", callID: call.id, state: {status: "completed", input: args, ...output}}}));
`;

test("fake-host units prove before-call sidecar, no observer/request and ignored hook failures", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "hugr-real-host-plumbing-"));
  try {
    const { original } = await nativeGit(root);
    const fakeHost = path.join(root, "unit-host.mjs"), unitPlugin = path.join(root, "unit-plugin.mjs"), outputs = path.join(root, "outputs");
    await writeFile(fakeHost, UNIT_HOST);
    await writeFile(unitPlugin, `import { readFile } from "node:fs/promises";
export default async () => ({"tool.execute.after": async (_, output) => {
  const rows = (await readFile(process.env.UNIT_SIDECAR, "utf8")).trim().split("\\n").map(JSON.parse);
  if (rows.length !== 2 || rows[1].kind !== "before" || rows[1].boundary.output !== output.output) throw new Error("Original sidecar was not persisted BEFORE hook");
  if (process.env.UNIT_PROBE !== "no-filter") output.output = output.output.split("\\n").filter(line => !line.startsWith('  (use "git ')).join("\\n");
}});
`);
    for (const probe of ["good", "no-observer", "no-second", "wrong-original", "no-filter"]) {
      const scenario = { ...gitCase, id: probe };
      const options = { scenario, plugin: unitPlugin, outputDir: outputs, binary: process.execPath, binaryArgs: [fakeHost], dependencies: false,
        setup: async ({ env }: { env: NodeJS.ProcessEnv }) => {
          env.UNIT_ORIGINAL = original; env.UNIT_PROBE = probe; env.UNIT_SIDECAR = path.join(outputs, probe, "observer.jsonl");
          if (probe === "wrong-original") {
            const wrapper = path.join(outputs, probe, "observer.mjs");
            await writeFile(wrapper, (await readFile(wrapper, "utf8")).replace("const original = output.output;", 'const original = "WRONG_UNIT_ORIGINAL";'));
          }
        } };
      if (probe === "good") {
        const result = await host.runObservedScenario(options);
        assert.ok(result.savedBytes > 0);
        assert.deepEqual(result.metadataBefore.unitFuture, { nested: [1, "🔥"] });
        assert.equal(await readFile(path.join(result.artifacts, "original.txt"), "utf8"), original);
        const retained = JSON.parse(await readFile(path.join(result.artifacts, "host-result.json"), "utf8")) as { root: string };
        await rm(retained.root, { recursive: true, force: true });
      } else {
        const name = { "no-observer": "REAL_HOST_OBSERVER_MISSING", "no-second": "REAL_HOST_SECOND_REQUEST_MISSING", "wrong-original": "REAL_HOST_ORIGINAL_MISMATCH", "no-filter": "REAL_HOST_KNOWN_GIT_NOT_REDUCED" }[probe]!;
        await assert.rejects(host.runObservedScenario(options), new RegExp(name));
        const failure = JSON.parse(await readFile(path.join(outputs, probe, "failure.json"), "utf8")) as { status: string; name: string; isolatedRoot: string };
        assert.equal(failure.status, "failed"); assert.equal(failure.name, name);
        await rm(failure.isolatedRoot, { recursive: true, force: true });
      }
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("public runner refuses missing host and retains named setup failure", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "hugr-real-host-missing-"));
  let retained: string | undefined;
  try {
    const outputDir = path.join(root, "outputs");
    await assert.rejects(host.runRealHost({ repoRoot: root, outputDir, binary: path.join(root, "missing-opencode") }), /REAL_HOST_MISSING_HOST/);
    const report = JSON.parse(await readFile(path.join(outputDir, "report.json"), "utf8")) as { status: string; failure: { name: string }; setupRoot: string; scenarios: unknown[] };
    assert.equal(report.status, "failed"); assert.equal(report.failure.name, "REAL_HOST_MISSING_HOST"); assert.deepEqual(report.scenarios, []);
    retained = report.setupRoot;
  } finally { if (retained) await rm(retained, { recursive: true, force: true }); await rm(root, { recursive: true, force: true }); }
});

test("tool path reporting resolves the real Node executable and names missing tools", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "hugr-host-path-"));
  try {
    const context = { cwd: root, env: { PATH: `${path.join(root, "missing-directory")}${path.delimiter}${path.dirname(process.execPath)}` } };
    assert.equal(await host.resolvedTool(path.basename(process.execPath), context), await realpath(process.execPath));
    assert.equal(await host.resolvedTool(process.execPath, context), await realpath(process.execPath));
    await assert.rejects(host.resolvedTool("hugr-native-tool-that-does-not-exist", context), /REAL_HOST_TOOL_PATH_MISSING/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
