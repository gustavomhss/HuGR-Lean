import assert from "node:assert/strict";
import { test } from "node:test";
import path from "node:path";
const proof = await import(new URL("../scripts/automatic-host-proof.mjs", import.meta.url).href);
const producer = await import(new URL("../scripts/automatic-proof-server.mjs", import.meta.url).href);

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
