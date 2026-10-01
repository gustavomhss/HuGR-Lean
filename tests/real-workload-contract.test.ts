import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const workloads = await import(new URL("../scripts/real-world/workloads.mjs", import.meta.url).href);
const setup = await import(new URL("../scripts/real-world/setup.mjs", import.meta.url).href);
type Entry = {
  id: string; project: string; category: string; command: string; oracle: string; expectExit: string; cwd: string;
  allowEmpty: boolean; controlledFailure?: boolean; marker?: string; cache?: string; follows?: string;
  modifications: { path: string }[]; prepare(): Promise<void>; restore(): Promise<void>;
};
const ids = ["itoa", "gjson", "boltons", "ms", "ufo", "hugr"];
const projects = (root: string) => ids.map((id) => ({ id, path: path.join(root, id) }));
const catalog = (root: string): Entry[] => workloads.catalog(projects(root));

// Independent frozen manifest: ID, project, category, literal command, oracle, exit policy.
const manifest = [
  ["cargo-build-cold", "itoa", "primary", "cargo build", "cargo-build", "zero"],
  ["cargo-build-warm", "itoa", "primary", "cargo build", "cargo-build", "zero"],
  ["cargo-test", "itoa", "primary", "cargo test", "cargo-test", "zero"],
  ["cargo-test-lib", "itoa", "primary", "cargo test --lib", "cargo-test", "zero"],
  ["cargo-compile-failure", "itoa", "control", "cargo build", "cargo-build", "nonzero"],
  ["go-test-verbose-cold", "gjson", "primary", "go test -v ./...", "go", "zero"],
  ["go-test-verbose-cached", "gjson", "primary", "go test -v ./...", "go", "zero"],
  ["go-test-default", "gjson", "primary", "go test", "go", "zero"],
  ["go-test-failure", "gjson", "control", "go test -v ./...", "go", "nonzero"],
  ["pytest-default", "boltons", "primary", "pytest", "pytest", "zero"],
  ["pytest-quiet", "boltons", "primary", "pytest -q", "pytest", "zero"],
  ["pytest-upstream-doctests", "boltons", "primary", "pytest --doctest-modules boltons tests", "pytest", "zero"],
  ["pytest-failure", "boltons", "control", "pytest", "pytest", "nonzero"],
  ["jest-direct", "ms", "primary", "jest --env node", "jest", "zero"],
  ["jest-npm", "ms", "primary", "npm run test:nodejs", "jest", "zero"],
  ["jest-failure", "ms", "control", "jest --env node", "jest", "nonzero"],
  ["vitest-direct", "ufo", "primary", "vitest run", "vitest", "zero"],
  ["vitest-npm", "ufo", "primary", "npm test", "vitest", "zero"],
  ["ufo-lint", "ufo", "primary", "npm run lint", "exact", "zero"],
  ["vitest-failure", "ufo", "control", "vitest run", "vitest", "nonzero"],
  ["hugr-build", "hugr", "primary", "npm run build", "exact", "zero"],
  ["hugr-typecheck", "hugr", "primary", "npm run typecheck", "exact", "zero"],
  ["hugr-tsc-direct", "hugr", "primary", "tsc --noEmit", "exact", "zero"],
  ["hugr-native-tests", "hugr", "primary", "tsx --test tests/core.test.ts tests/runners.test.ts", "node", "zero"],
  ["git-status-clean", "hugr", "primary", "git status", "git", "zero"],
  ["git-status-mixed", "hugr", "control", "git status", "git", "zero"],
  ["rg-source", "hugr", "primary", "rg -n 'export' src", "rg", "zero"],
  ["git-diff-history", "hugr", "primary", "git diff HEAD~1", "exact", "zero"],
  ["read-readme", "hugr", "primary", "cat README.md", "exact", "zero"],
  ["ls-repository", "hugr", "primary", "ls", "exact", "zero"],
];

test("complete manifest pins every case identity, command, oracle and exit policy", () => {
  const root = path.resolve("offline-contract"), entries = catalog(root);
  assert.deepEqual(entries.map(({ id, project, category, command, oracle, expectExit }) =>
    [id, project, category, command, oracle, expectExit]), manifest);
  assert.deepEqual(entries.filter((entry) => entry.allowEmpty).map((entry) => entry.id), ["hugr-tsc-direct"]);
  for (const entry of entries) assert.equal(entry.cwd, path.join(root, entry.project));
});

test("all repository license and source paths match independent exact fixtures", () => {
  const expected = [
    ["itoa", ["LICENSE-MIT", "LICENSE-APACHE"], ["Cargo.toml", "src/lib.rs", "tests/test.rs"]],
    ["gjson", ["LICENSE"], ["go.mod", "gjson.go", "gjson_test.go"]],
    ["boltons", ["LICENSE"], ["pyproject.toml", "tox.ini", "tests/test_iterutils.py"]],
    ["ms", ["LICENSE"], ["package.json", "pnpm-lock.yaml", "jest.config.ts", "src/index.test.ts"]],
    ["ufo", ["LICENSE"], ["package.json", "pnpm-lock.yaml", "test/parse.test.ts"]],
    ["hugr", ["LICENSE"], ["package.json", "package-lock.json", "src/core/types.ts", "tests/core.test.ts", "tests/runners.test.ts"]],
  ];
  assert.deepEqual(setup.PINS.map((pin: { id: string; licensePaths: string[]; sourcePaths: string[] }) =>
    [pin.id, pin.licensePaths, pin.sourcePaths]), expected);
});

test("warm/cached membership is pinned before chronological checks", () => {
  const entries = catalog(path.resolve("offline-contract"));
  const expected = [
    ["cargo-build-warm", "warm", "cargo-build-cold"],
    ["go-test-verbose-cached", "cached", "go-test-verbose-cold"],
  ];
  assert.deepEqual(entries.filter((entry) => ["warm", "cached"].includes(entry.cache ?? ""))
    .map((entry) => [entry.id, entry.cache, entry.follows]), expected);
  for (const [id, cache, follows] of expected) {
    const index = entries.findIndex((entry) => entry.id === id), predecessor = entries.findIndex((entry) => entry.id === follows);
    assert.ok(predecessor >= 0 && index > predecessor, `${id}: missing or nonchronological predecessor`);
    assert.equal(entries[index]?.cache, cache);
    assert.equal(entries[predecessor]?.cache, "cold");
    assert.equal(entries[index]?.command, entries[predecessor]?.command);
  }
});

test("catalog rejects duplicate, missing and invalid project inputs by name", () => {
  const root = path.resolve("offline-contract"), valid = projects(root);
  assert.doesNotThrow(() => workloads.catalog(valid));
  for (const value of [undefined, null, {}, "projects"]) {
    assert.throws(() => workloads.catalog(value), /CATALOG_INVALID_PROJECTS/);
  }
  for (const value of [null, undefined, {}, { id: 0 }, { id: "" }, { id: "foreign", path: root }]) {
    assert.throws(() => workloads.catalog([...valid, value]), /CATALOG_INVALID_PROJECT/);
  }
  for (const project of valid) {
    for (const duplicate of [project, { ...project, path: path.join(root, "other") }]) {
      assert.throws(() => workloads.catalog([...valid, duplicate]), new RegExp(`CATALOG_DUPLICATE_PROJECT: ${project.id}`));
    }
    assert.throws(() => workloads.catalog(valid.filter((entry) => entry.id !== project.id)), new RegExp(`CATALOG_MISSING_PROJECT: ${project.id}`));
    for (const invalidPath of [undefined, null, "", " ", "relative", 42, `${root}\0bad`]) {
      assert.throws(() => workloads.catalog(valid.map((entry) => entry.id === project.id ? { ...entry, path: invalidPath } : entry)),
        new RegExp(`CATALOG_INVALID_PROJECT_PATH: ${project.id}`));
    }
  }
  assert.throws(() => workloads.catalog([]), /CATALOG_MISSING_PROJECT: itoa/);
});

// Independent fixed control IDs, paths, append policy and complete executable recipes.
const failures = [
  { id: "cargo-compile-failure", project: "itoa", file: "src/lib.rs", append: true,
    code: '\n// HuGR benchmark controlled modification; restored after capture.\ncompile_error!("BENCH_EXPECTED_FAILURE");\n' },
  { id: "go-test-failure", project: "gjson", file: "bench_expected_failure_test.go", append: false,
    code: '// HuGR benchmark control, not an upstream test.\npackage gjson\nimport "testing"\nfunc TestBenchExpectedFailure(t *testing.T) { t.Fatal("BENCH_EXPECTED_FAILURE") }\n' },
  { id: "pytest-failure", project: "boltons", file: "tests/bench_expected_failure_test.py", append: false,
    code: '# HuGR benchmark control, not an upstream test.\ndef test_bench_expected_failure():\n    assert False, "BENCH_EXPECTED_FAILURE"\n' },
  { id: "jest-failure", project: "ms", file: "src/bench-expected-failure.test.ts", append: false,
    code: "// HuGR benchmark control, not an upstream test.\nimport { test, expect } from '@jest/globals';\ntest('BENCH_EXPECTED_FAILURE', () => { expect(true).toBe(false); });\n" },
  { id: "vitest-failure", project: "ufo", file: "test/bench-expected-failure.test.ts", append: false,
    code: "// HuGR benchmark control, not an upstream test.\nimport { test, expect } from 'vitest';\ntest('BENCH_EXPECTED_FAILURE', () => { expect(true).toBe(false); });\n" },
];

test("five failure controls prepare fixed failing recipes and restore independently named fixture paths", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "hugr-control-contract-"));
  const original = Buffer.from([0, 255, ...Buffer.from("// upstream 🦣\r\n")]);
  try {
    for (const id of ids) for (const directory of ["src", "test", "tests"]) await mkdir(path.join(root, id, directory), { recursive: true });
    await writeFile(path.join(root, "itoa/src/lib.rs"), original);
    const entries = catalog(root);
    assert.deepEqual(entries.filter((entry) => entry.controlledFailure).map((entry) => entry.id), failures.map((spec) => spec.id));
    for (const spec of failures) {
      const entry = entries.find((candidate) => candidate.id === spec.id);
      assert.ok(entry, `Missing control ${spec.id}`);
      assert.equal(entry.project, spec.project);
      assert.equal(entry.expectExit, "nonzero");
      assert.equal(entry.marker, "BENCH_EXPECTED_FAILURE");
      assert.deepEqual(entry.modifications.map((modification) => modification.path), [spec.file], `${spec.id}: edit ledger`);
      const file = path.join(root, spec.project, spec.file);
      try {
        await entry.prepare();
        assert.deepEqual(await readFile(file), spec.append ? Buffer.concat([original, Buffer.from(spec.code)]) : Buffer.from(spec.code), spec.id);
      } finally { await entry.restore(); }
      if (spec.append) assert.deepEqual(await readFile(file), original, spec.id);
      else await assert.rejects(readFile(file), { code: "ENOENT" });
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
