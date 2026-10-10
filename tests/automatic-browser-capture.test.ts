import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const { StdioClient, saveClient, decodeLine, resultJson, sha256, PAGE } = await import(
  new URL("../scripts/automatic-browser-capture.mjs", import.meta.url).href
);

test("stdio preserves full native-shaped errors, opaque fields and exact Unicode bytes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lean-browser-"));
  // Protocol-control producer, not a native browser fixture.
  const response = { jsonrpc: "2.0", id: 1, result: { isError: true,
    content: [{ type: "text", text: "### Error\n雪 \"quoted\"\r\n" }],
    structuredContent: { unknown: [null, false, "東京"] }, _meta: { extension: 7 } } };
  const wire = JSON.stringify(response) + "\n";
  const warning = "original stderr — 雪\n";
  const source = `process.stdin.once('data',()=>{process.stdout.write(${JSON.stringify(wire)});process.stderr.write(${JSON.stringify(warning)});});process.stdin.on('end',()=>process.exit(7));`;
  const client = new StdioClient([process.execPath, "-e", source], directory, 2000);
  try {
    assert.deepEqual(await client.call("owned_control", { untouched: "雪" }), response);
    await client.close();
    const files = await saveClient(client, directory, "control");
    assert.equal((await readFile(join(directory, files.stdout.file))).toString(), wire);
    assert.equal((await readFile(join(directory, files.stderr.file))).toString(), warning);
    assert.equal(files.stdout.sha256, sha256(Buffer.from(wire)));
    const decoded = JSON.parse(await readFile(join(directory, files.decoded.file), "utf8"));
    assert.equal(decoded.exit.code, 7);
    assert.deepEqual(decoded.records.find((r: any) => r.direction === "receive").message, response);
    assert.deepEqual(decoded.records[0].message.params.arguments, { untouched: "雪" });
  } finally { await client.close(); await rm(directory, { recursive: true, force: true }); }
});

test("incomplete response times out but keeps original stdout/stderr and argv", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lean-browser-partial-"));
  const prefix = '{"jsonrpc":"2.0","id":1,"result":';
  const source = `process.stdin.once('data',()=>{process.stdout.write(${JSON.stringify(prefix)});process.stderr.write('partial failure');});process.stdin.on('end',()=>process.exit(9));`;
  const argv = [process.execPath, "-e", source];
  const client = new StdioClient(argv, directory, 1000);
  try {
    await assert.rejects(client.call("partial"), /Timeout: tools\/call/);
    await client.close();
    const files = await saveClient(client, directory, "partial");
    assert.equal((await readFile(join(directory, files.stdout.file))).toString(), prefix);
    assert.equal((await readFile(join(directory, files.stderr.file))).toString(), "partial failure");
    const decoded = JSON.parse(await readFile(join(directory, files.decoded.file), "utf8"));
    assert.deepEqual(decoded.argv, argv);
    assert.equal(decoded.exit.code, 9);
  } finally { await client.close(); await rm(directory, { recursive: true, force: true }); }
});

test("decoded extraction refuses errors, malformed JSON and unknown section grammar", () => {
  assert.deepEqual(decodeLine('{"jsonrpc":"2.0","id":3,"result":{}}').result, {});
  assert.throws(() => decodeLine('{"result":{}}'), /Non JSON-RPC stdout/);
  assert.throws(() => decodeLine('{"jsonrpc":'), SyntaxError);
  const native = (text: string) => ({ result: { content: [{ type: "text", text }] } });
  assert.deepEqual(resultJson(native('### Result\n{"nodes":[]}\n### Ran Playwright code\n```js\n```')), { nodes: [] });
  assert.throws(() => resultJson({ ...native('### Result\n{}'), result: { isError: true } }), /Failed native result/);
  assert.throws(() => resultJson({ error: { code: -1 } }), /Failed native result/);
  assert.throws(() => resultJson(native("unexpected")), /Missing native result section/);
  assert.throws(() => resultJson(native('### Result\n{"nodes":')), SyntaxError);
  assert.match(PAGE, /<dialog/);
  assert.match(PAGE, /type="checkbox" checked/);
});

const fixtures = new URL("../fixtures/automatic/browser/native/", import.meta.url);
const load = async (name: string) => JSON.parse(await readFile(new URL(name, fixtures), "utf8"));
function calls(data: any, name: string) {
  return data.records.filter((r: any) => r.direction === "send" && r.message.method === "tools/call" && r.message.params.name === name)
    .map((r: any) => ({ request: r.message, response: data.records.find((s: any) => s.direction === "receive" && s.message.id === r.message.id)?.message }));
}

test("real fixture provenance binds every raw byte and complete decoded MCP field", async () => {
  const receipt = await load("receipt.json");
  assert.equal(receipt.sources.playwright.commit, "1b025d7e20a026371cd5f98ba0cdce48892737c8");
  assert.equal(receipt.sources.devtools.commit, "f08dbe152502d66e75fa07fb2588dc0feb42bc20");
  assert.equal(receipt.sources.playwright.version, "1.63.0");
  assert.equal(receipt.sources.devtools.version, "1.10.1");
  assert.equal(receipt.runtime.product, "HeadlessChrome/147.0.7727.15");
  assert.deepEqual(receipt.failures, []);
  assert.equal(await readFile(new URL("owned-page.html", fixtures), "utf8"), PAGE);
  for (const [file, info] of Object.entries(receipt.artifacts) as [string, any][]) {
    const bytes = await readFile(new URL(file, fixtures));
    assert.equal(bytes.length, info.bytes, file);
    assert.equal(sha256(bytes), info.sha256, file);
  }
  for (const producer of ["playwright", "devtools"]) {
    const decoded = await load(`${producer}.json`);
    for (const [stream, direction] of [["stdout", "receive"], ["stdin", "send"]]) {
      const wire = await readFile(new URL(`${producer}.${stream}.bin`, fixtures), "utf8");
      const messages = wire.trimEnd().split("\n").map((line: string) => JSON.parse(line));
      assert.deepEqual(messages, decoded.records.filter((r: any) => r.direction === direction).map((r: any) => r.message));
    }
    assert.ok(decoded.records.some((r: any) => r.message.result?.tools?.some((t: any) => t.inputSchema)));
    assert.ok(decoded.argv.includes("--headless") && decoded.argv.includes("--isolated"));
  }
});

test("real AX and native snapshot oracles see states, names, hierarchy and intentional failure", async () => {
  const playwright = await load("playwright.json"), devtools = await load("devtools.json");
  const snapshots = calls(playwright, "browser_snapshot");
  assert.equal(snapshots.length, 2);
  const before = snapshots[0].response.result.content[0].text;
  const modal = snapshots[1].response.result.content[0].text;
  assert.match(before, /### Snapshot\n```yaml\n/);
  assert.ok(before.includes('textbox "Name \\"東京\\"" [ref=e4]: Zoë'));
  assert.match(before, /checkbox .*\[checked\].*\[ref=e6\]/);
  assert.match(before, /button "Unavailable" \[disabled\]/);
  assert.match(modal, /textbox "Dialog name" \[active\].*: 東京/);
  const code = calls(playwright, "browser_run_code_unsafe");
  for (const [index, file] of ["cdp-before.json", "cdp-modal.json"].entries()) {
    const cdp = await load(file);
    assert.deepEqual(cdp, resultJson(code[index].response));
    assert.ok(cdp.accessibility.nodes.some((n: any) => n.ignored && n.ignoredReasons?.length));
    assert.ok(cdp.accessibility.nodes.some((n: any) => n.childIds?.length));
    assert.equal(cdp.version.product, "HeadlessChrome/147.0.7727.15");
    assert.ok(cdp.window.bounds.width > 0 && cdp.window.bounds.height > 0);
  }
  const ax = (await load("cdp-modal.json")).accessibility.nodes;
  assert.ok(ax.some((n: any) => n.role?.value === "textbox" && n.value?.value === "東京" && n.properties.some((p: any) => p.name === "focused" && p.value.value === true)));
  const errors = playwright.records.filter((r: any) => r.message.result?.isError);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message.result.content[0].text, /^### Error\nError: Owned intentional failure — 雪/);
  const chrome = calls(devtools, "take_snapshot");
  assert.equal(chrome.length, 2);
  assert.deepEqual(chrome[0].request.params.arguments, {});
  assert.ok(devtools.argv.includes("--no-page-id-routing"));
  assert.ok(chrome[0].response.result.content[0].text.includes('textbox "Name "東京"" value="Zoë"'));
  assert.match(chrome[1].response.result.content[0].text, /dialog "Edit "雪"" modal/);
  assert.match(calls(playwright, "browser_console_messages")[0].response.result.content[0].text, /Owned page ready — 雪/);
  assert.match(calls(playwright, "browser_network_requests")[0].response.result.content[0].text, /owned.json => \[200\] OK/);
});
