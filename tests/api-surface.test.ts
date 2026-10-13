import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import * as root from "../src/index.js";
import * as core from "../src/core/index.js";
import * as raw from "../src/raw/index.js";

test("public package entrypoints and their complete runtime export lists are pinned", () => {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.deepEqual(manifest.exports, {
    ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
    "./server": { types: "./dist/index.d.ts", import: "./dist/index.js" },
    "./core": { types: "./dist/core/index.d.ts", import: "./dist/core/index.js" },
    "./raw": { types: "./dist/raw/index.d.ts", import: "./dist/raw/index.js" },
  });
  assert.deepEqual(Object.keys(root), ["default"]);
  assert.deepEqual(Object.keys(core), ["defaultSummarizeOptions", "filter", "filterAutomatic", "filterStructured", "getProfiles", "recoveryLine", "structuredFormats", "summarize", "tokenizeCommand"]);
  assert.deepEqual(Object.keys(raw), ["RawStore", "defaultRawDirectory", "recallLines"]);
});
