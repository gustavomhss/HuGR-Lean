import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const samples = [
  "fixtures/profiles/go-mod/get-default-added.txt",
  "fixtures/profiles/go-mod/get-default-added.expected.txt",
  "fixtures/profiles/go-mod/cases.json",
  "fixtures/profiles/biome/lint-warning-advice/output.txt",
  "fixtures/profiles/biome/lint-warning-advice/before/warning.js",
  "fixtures/profiles/biome/capture-receipt.json",
  "fixtures/profiles/biome/capture.mjs",
  "fixtures/profiles/biome/SOURCES.md",
  "fixtures/profiles/bun-test/inputs/subject.ts",
  "fixtures/profiles/tsc/direct-build-incremental/native.txt",
  "fixtures/profiles/tsc/direct-build-incremental/independent.expected.txt",
  "fixtures/vitest-preservation/R03-direct-reporter-config.raw",
  "fixtures/vitest-preservation/SOURCES.md",
  "fixtures/utility/node/SOURCES.md",
];
const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

// Real Git checkout, isolated index/worktree; no persistent config or native execution.
function checkout(attributes: Buffer, verifyAttributes: boolean) {
  const scratch = mkdtempSync(join(tmpdir(), "hugr-native-checkout-"));
  assert.deepEqual(readdirSync(scratch), []);
  const worktree = join(scratch, "checkout");
  mkdirSync(worktree);
  assert.deepEqual(readdirSync(worktree), []);
  const env = { ...process.env, GIT_INDEX_FILE: join(scratch, "index"),
    GIT_WORK_TREE: worktree, GIT_ATTR_NOSYSTEM: "1" };
  const git = (args: string[], input?: Buffer) => execFileSync("git", [
    "-c", "core.autocrlf=true", "-c", "core.eol=crlf", "-c", "core.safecrlf=false",
    "-c", "core.attributesFile=", ...args,
  ], { cwd: root, env, ...(input === undefined ? {} : { input }) });
  try {
    git(["read-tree", "HEAD"]);
    const stage = (path: string, bytes: Buffer) => {
      const blob = git(["hash-object", "-w", "--stdin"], bytes).toString().trim();
      git(["update-index", "--add", "--cacheinfo", `100644,${blob},${path}`]);
    };
    stage(".gitattributes", attributes);
    stage("checkout-control.txt", Buffer.from("unprotected LF control\n"));
    git(["checkout-index", "--", ".gitattributes"]);
    // Positive control proves autocrlf really converts eligible text on this host.
    git(["checkout-index", "--", "checkout-control.txt"]);
    assert.equal(readFileSync(join(worktree, "checkout-control.txt"), "utf8"),
      "unprotected LF control\r\n");
    const changed: string[] = [];
    for (const path of samples) {
      const blob = git(["show", `HEAD:${path}`]);
      assert.deepEqual(readFileSync(join(root, path)), blob, `source bytes: ${path}`);
      if (path === "fixtures/vitest-preservation/R03-direct-reporter-config.raw") {
        assert.equal(blob.length, 136);
        assert.equal(git(["hash-object", "--stdin"], blob).toString().trim(),
          "5cf7147e37377e3e6e4bd5a1e613cc53f3749b81");
      }
      if (path === "fixtures/profiles/tsc/direct-build-incremental/native.txt") {
        assert(blob.includes(Buffer.from("\r\n")), "original native CRLF control");
      }
      if (verifyAttributes) {
        const fields = git(["check-attr", "--cached", "-z", "text", "--", path])
          .toString().split("\0");
        assert.deepEqual(fields, [path, "text", "unset", ""], path);
      }
      git(["checkout-index", "--", path]);
      const actual = readFileSync(join(worktree, path));
      if (sha256(actual) !== sha256(blob)) changed.push(path);
      if (verifyAttributes) assert.deepEqual(actual, blob, `checkout bytes: ${path}`);
    }
    return changed;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

test("native fixture attributes preserve Git blob bytes under autocrlf=true", () => {
  const attributes = readFileSync(join(root, ".gitattributes"));
  assert.deepEqual(checkout(attributes, true), []);
  // Mutate only a copy. Same checkout oracle must detect lost profile protection.
  const mutant = Buffer.from(attributes.toString().replace(/^fixtures\/profiles\/\*\* -text\r?\n/m, ""));
  assert.notDeepEqual(mutant, attributes, "profile rule mutation must apply");
  const changed = checkout(mutant, false);
  assert.throws(() => assert.deepEqual(changed, [], "checkout bytes must remain exact"),
    { code: "ERR_ASSERTION" });
  assert(changed.includes("fixtures/profiles/go-mod/get-default-added.txt"));
  assert(changed.includes("fixtures/profiles/biome/capture.mjs"));
  assert(changed.includes("fixtures/profiles/bun-test/inputs/subject.ts"));
  assert(!changed.some(path => path.startsWith("fixtures/vitest-preservation/")));
  assert(!changed.some(path => path.startsWith("fixtures/utility/")));
  assert.deepEqual(checkout(attributes, true), []);
});
