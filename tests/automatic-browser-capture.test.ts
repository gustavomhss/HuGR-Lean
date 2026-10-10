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
