import assert from "node:assert/strict";
import { test } from "node:test";
import path from "node:path";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
const proof = await import(new URL("../scripts/automatic-host-proof.mjs", import.meta.url).href);
const producer = await import(new URL("../scripts/automatic-proof-server.mjs", import.meta.url).href);
const boundary = await import(new URL("../scripts/opencode-boundary.mjs", import.meta.url).href);
const temporary = "/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode";

test("whole-case deadline bounds setup and refuses late process launch", async () => {
  const root = await mkdtemp(path.join(temporary, "automatic-deadline-test-")); let success = false;
  try {
    const control = path.join(root, "control"); await mkdir(control);
    const result = await proof.hostProcess(process.execPath, ["-e", 'console.log("OWNED_CONTROL")'], { cwd: root, timeout: 10000 }, control);
    assert.equal(result.stdout, "OWNED_CONTROL\n"); assert.ok(JSON.parse(await readFile(path.join(control, "process-start.json"), "utf8")).pid > 0);
    let finished = false;
    await assert.rejects(proof.caseDeadline(root, 30, async (signal: AbortSignal) => {
      await delay(100);
      try { await proof.hostProcess(process.execPath, ["-e", 'console.log("LATE_LAUNCH")'], { cwd: root, timeout: 10000, signal }, root); }
      finally { finished = true; }
    }), /Case deadline 30 ms/);
    const deadline = Date.now() + 10000; while (!finished && Date.now() < deadline) await delay(10);
    assert.equal(finished, true, "Aborted setup stayed pending");
    await assert.rejects(readFile(path.join(root, "process-start.json")), { code: "ENOENT" });
    assert.match(await readFile(path.join(root, "deadline.json"), "utf8"), /Case deadline/); success = true;
  } finally { if (success) await rm(root, { recursive: true, force: true }); else console.error(`Deadline test artifacts: ${root}`); }
});

test("SIGTERM records failure streams and kills only owned live host group", async () => {
  const root = await mkdtemp(path.join(temporary, "automatic-signal-test-")); let success = false, pid = 0;
  const moduleURL = new URL("../scripts/automatic-host-proof.mjs", import.meta.url).href;
  const childCode = 'console.log("OWNED_STDOUT"); console.error("OWNED_STDERR"); setInterval(()=>{},1000);';
  const script = `import {caseDeadline,hostProcess} from ${JSON.stringify(moduleURL)}; try { await caseDeadline(${JSON.stringify(root)}, 30000, signal => hostProcess(process.execPath, ["-e", ${JSON.stringify(childCode)}], {cwd:${JSON.stringify(root)},timeout:30000,signal}, ${JSON.stringify(root)})); } catch(e) { console.error(e.message); }`;
  const runner = spawn(process.execPath, ["--input-type=module", "-e", script], { detached: true, env: boundary.isolatedEnvironment(root), stdio: ["ignore", "pipe", "pipe"] });
  let stderr = ""; runner.stderr.on("data", (chunk: Buffer) => { stderr += chunk; }); runner.stdout.resume();
  const exited = new Promise<number | null>((resolve, reject) => { runner.once("close", resolve); runner.once("error", reject); });
  const watchdog = setTimeout(() => runner.kill("SIGKILL"), 20000);
  try {
    const deadline = Date.now() + 12000; let ready = false;
    while (!ready && Date.now() < deadline) { try { ready = await readFile(path.join(root, "process-stdout"), "utf8") === "OWNED_STDOUT\n" && await readFile(path.join(root, "process-stderr"), "utf8") === "OWNED_STDERR\n"; } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; } if (!ready) await delay(10); }
    assert.equal(ready, true, "Owned process streams never became ready");
    const record = JSON.parse(await readFile(path.join(root, "process-start.json"), "utf8")); pid = record.pid;
    assert.deepEqual(record.args, ["-e", childCode]); assert.equal(record.binary, process.execPath); process.kill(pid, 0);
    runner.kill("SIGTERM"); assert.equal(await exited, 143, stderr);
    assert.match(stderr, /Harness received SIGTERM/);
    assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
    assert.equal(await readFile(path.join(root, "process-stdout"), "utf8"), "OWNED_STDOUT\n");
    assert.equal(await readFile(path.join(root, "process-stderr"), "utf8"), "OWNED_STDERR\n"); success = true;
  } finally {
    clearTimeout(watchdog); if (pid) { try { process.kill(-pid, "SIGKILL"); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ESRCH") throw e; } }
    if (runner.pid) { try { process.kill(-runner.pid, "SIGKILL"); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ESRCH") throw e; } }
    if (success) await rm(root, { recursive: true, force: true }); else console.error(`Signal test artifacts: ${root}`);
  }
});

test("native view oracle reconstructs full paths and rejects changed prefix/order", () => {
  const before = { input: { tool: "glob", args: { path: "/owned" } }, output: { output: "/owned/a.txt\n/owned/b.txt" } };
  proof.assertNativePaths(before, "/owned/:\na.txt\nb.txt");
  assert.throws(() => proof.assertNativePaths(before, "/wrong/:\na.txt\nb.txt"), /absolute directory prefix/);
  assert.throws(() => proof.assertNativePaths(before, "/owned/:\nb.txt\na.txt"), /full paths\/order/);
});

test("directory oracle verifies actual display path/type/count and every exact entry", () => {
  const view = "<path>/owned</path>\n<type>directory</type>\na.txt\nsub/\n\n(2 entries)";
  const before = { input: { tool: "read", args: { filePath: "/owned" } }, output: { metadata: { display: { path: "/owned", type: "directory", totalEntries: 2, entries: ["a.txt", "sub/"] } } } };
  proof.assertNativePaths(before, view);
  for (const [changed, error] of [[view.replace("sub/\n", ""), /entries\/order/], [view.replace("directory", "file"), /changed type/], [view.replace("2 entries", "3 entries"), /changed count/], [view.replace("/owned", "/wrong"), /root path/]] as const) assert.throws(() => proof.assertNativePaths(before, changed), error);
});

test("snapshot oracle retains refs, indentation, complete payload and surrounding source", () => {
  const source = '### Page\n- URL: http://localhost/\n### Snapshot\n```yaml\n- main [ref=e1]\n  - button "[ref=e99] quoted" [ref=e2] [disabled]\n```\n### Events\nsource suffix\n';
  const view = '### Page\n- URL: http://localhost/\n### Snapshot\n```text\ne1 main \n  e2 button "[ref=e99] quoted"  [disabled]\n```\n### Events\nsource suffix\n';
  proof.assertSnapshot(source, view, "browser_browser_snapshot");
  for (const mutant of [view.replace("e2 button", "e3 button"), view.replace("  e2", "e2"), view.replace(" [disabled]", ""), view.replace("main \n", "main\n"), view.replace("source suffix", "lost"), view.replace("http://localhost/", "http://wrong/")]) assert.throws(() => proof.assertSnapshot(source, mutant, "browser_snapshot"), /Snapshot lost/);
  const cdp = '## Latest page snapshot\nuid=1_0 RootWebArea "source"\n  uid=1_1 button "Keep"\n';
  proof.assertSnapshot(cdp, cdp.replaceAll("uid=", ""), "devtools_take_snapshot");
  assert.throws(() => proof.assertSnapshot(cdp, cdp.replaceAll("uid=", "").replace('"Keep"', '"Lost"'), "take_snapshot"), /Snapshot lost/);
});

// Synthetic packets calibrate oracle teeth only; real host compatibility is executable proof.
test("next-model oracle rejects altered arguments, missing result and wrong IDs", () => {
  const call = { id: "native", type: "function", function: { name: "glob", arguments: '{"path":"/owned","pattern":"**/*"}' } };
  const body = { messages: [{ role: "assistant", tool_calls: [call] }, { role: "tool", tool_call_id: "native", content: "source" }] };
  assert.equal(proof.assertNextRequest(body, call).content, "source");
  const changed = structuredClone(body); changed.messages[0]!.tool_calls![0]!.function.arguments = '{"path":"/elsewhere"}';
  assert.throws(() => proof.assertNextRequest(changed, call), /changed arguments/);
  assert.throws(() => proof.assertNextRequest({ messages: [body.messages[0]] }, call), /missing unique result/);
  const wrong = structuredClone(body); wrong.messages[1]!.tool_call_id = "wrong";
  assert.throws(() => proof.assertNextRequest(wrong, call), /wrong call ID/);
});

test("preservation oracle detects metadata identity, refs, attachments and unknown data loss", async () => {
  const root = path.resolve("fixtures/automatic/host/inventory");
  const packet = await producer.packet(root, "attachments");
  const before = { input: { tool: "proof_inventory", args: { mode: "attachments" } }, output: packet };
  const after = { ...structuredClone(before), metadataSame: true, inputSame: true, untouchedBlocksSame: true };
  after.output.content[0].text = JSON.stringify(JSON.parse(packet.content[0].text));
  const joined = () => after.output.content.filter((b: { type: string }) => b.type === "text" || b.type === "resource").map((b: { text?: string; resource?: { text: string } }) => b.text ?? b.resource!.text).join("\n\n");
  proof.assertObservation(before, after, { content: joined() }, "json");
  assert.throws(() => proof.assertObservation(before, { ...after, metadataSame: false }, { content: joined() }, "json"), /metadata reference/);
  assert.throws(() => proof.assertObservation(before, { ...after, untouchedBlocksSame: false }, { content: joined() }, "json"), /attachment reference/);
  const lost = structuredClone(after); lost.output.content[1].resource.text = "lost source";
  assert.throws(() => proof.assertObservation(before, lost, { content: joined() }, "json"), /attachment source/);
  const value = JSON.parse(after.output.content[0].text); delete value.opaque.ref;
  const missingRef = structuredClone(after); missingRef.output.content[0].text = JSON.stringify(value);
  assert.throws(() => proof.assertObservation(before, missingRef, { content: missingRef.output.content.map((b: { text?: string; resource?: { text: string } }) => b.text ?? b.resource?.text).filter(Boolean).join("\n\n") }, "json"), /full source values\/refs/);
  assert.throws(() => proof.assertObservation(before, after, { content: joined() }, "preserved"), /Negative control changed output/);
});
