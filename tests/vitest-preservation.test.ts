import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { filter } from "../src/core/engine.js";
import { lines } from "../src/core/lines.js";
import { formatProfiles } from "../src/profiles/formats.js";
import type { Observation } from "../src/types.js";

const raw = readFileSync(new URL("../fixtures/vitest-preservation/R03-direct-reporter-config.raw", import.meta.url), "utf8");
const observation = (output: string): Observation => ({ source: "shell", command: "vitest run",
  output, termination: { kind: "exited", code: 0 }, completeness: "complete", presentation: "unknown" });

test("Vitest R03 configured reporter preserves every source row including user timing", () => {
  const hash = (text: string) => createHash("sha1").update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest("hex");
  assert.equal(Buffer.byteLength(raw), 136);
  assert.equal(hash(raw), "5cf7147e37377e3e6e4bd5a1e613cc53f3749b81");
  assert.notEqual(hash(raw.replace(" 123ms", "")), hash(raw), "Damaged native witness must trip integrity check");
  const profile = formatProfiles.find((entry) => entry.id === "vitest"); assert.ok(profile);
  for (const input of [raw, raw.replaceAll("\n", "\r\n"), raw.trimEnd(),
    raw.replace("user-evidence", "café🔥-user-evidence"), raw.replace(" 123ms", ""),
    "\n RUN  v3.2.4 /tmp/café🔥\n\n" + raw + "\n"]) {
    const obs = observation(input), reduction = profile.reduce(input, obs); assert.ok(reduction);
    const spans = lines(input).map((line) => line.span);
    assert.deepEqual(reduction.required, spans, "Every complete row must be required, including timing and endings");
    assert.deepEqual(reduction.pieces, spans, "Every complete row must be emitted intact");
    assert.equal(reduction.pieces.map((piece) => "text" in piece ? piece.text : input.slice(...piece)).join(""), input);
    const result = filter(obs);
    assert.deepEqual(result, { status: "passthrough", reason: "not_smaller",
      inputBytes: Buffer.byteLength(input), outputBytes: Buffer.byteLength(input) });
  }
});

test("Vitest installed legacy goldens retain raw exact streams", () => {
  const goldens = JSON.parse(readFileSync(new URL("../fixtures/installed-goldens.json", import.meta.url), "utf8"));
  for (const name of ["vitest_all_passed", "vitest_native"]) {
    const input = readFileSync(new URL(`../fixtures/formats/${name}.txt`, import.meta.url), "utf8");
    assert.equal(goldens.outputs[`formats/${name}.txt`], input);
    const result = filter(observation(input));
    assert.equal(result.status, "passthrough"); assert.equal("replacement" in result, false);
  }
});
