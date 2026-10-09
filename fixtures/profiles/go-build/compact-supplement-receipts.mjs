// Metadata-only derivation: compact JSON layout; native streams/hashes unchanged.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
for (const family of ["go-build", "cargo-fmt"]) {
  const file = new URL(`../${family}/supplement-receipt.json`, import.meta.url);
  const before = JSON.parse(await readFile(file, "utf8"));
  const after = JSON.stringify(before) + "\n";
  assert.deepEqual(JSON.parse(after), before);
  await writeFile(file, after);
}
