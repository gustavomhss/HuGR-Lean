// Literal developer commands, chosen by ecosystem/project coverage, never reducer acceptance.
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { setupProjects } from "./setup.mjs";

export const FAILURE_MARKER = "BENCH_EXPECTED_FAILURE";

/** Transactional file edits; restoration also works after a partial prepare or failed capture. */
export function edits(projectPath, changes) {
  let saved;
  return {
    async prepare() {
      if (saved) throw new Error("CASE_ALREADY_PREPARED");
      saved = [];
      try {
        for (const change of changes) {
          const file = path.join(projectPath, change.path);
          let original;
          try { original = await readFile(file); }
          catch (error) { if (error.code !== "ENOENT" || change.append) throw error; }
          if (!change.append && original !== undefined) throw new Error(`CASE_WOULD_OVERWRITE: ${file}`);
          saved.push({ file, original });
          await writeFile(file, change.append ? Buffer.concat([original, Buffer.from(change.text)]) : change.text);
        }
      } catch (error) { await this.restore(); throw error; }
    },
    async restore() {
      if (!saved) return;
      for (const { file, original } of saved.toReversed()) {
        if (original === undefined) await rm(file, { force: true });
        else await writeFile(file, original);
      }
      saved = undefined;
    },
  };
}

/** Pure catalog construction supports offline CI; provision supplies the real setup runner. */
export function catalog(projects, run) {
  const byId = Object.fromEntries(projects.map((project) => [project.id, project]));
  for (const id of ["itoa", "gjson", "boltons", "ms", "ufo", "hugr"]) if (!byId[id]?.path) throw new Error(`CATALOG_MISSING_PROJECT: ${id}`);
  const cases = [];
  const add = (id, project, command, oracle, options = {}) => {
    const entry = { id, project, category: "primary", command, cwd: byId[project].path, expectExit: "zero", oracle,
      allowEmpty: false, prepare: async () => {}, restore: async () => {}, modifications: [], ...options };
    cases.push(entry);
    return entry;
  };
  const cold = (id, file, args) => async () => {
    if (!run) throw new Error(`CASE_SETUP_RUNNER_MISSING: ${id}`);
    await run(`prepare-${id}`, file, args, { cwd: byId[id.startsWith("cargo") ? "itoa" : "gjson"].path });
  };
  const failure = (id, project, command, oracle, changes) => {
    const transaction = edits(byId[project].path, changes);
    add(id, project, command, oracle, { category: "control", expectExit: "nonzero", marker: FAILURE_MARKER,
      controlledFailure: true, modifications: changes.map(({ path: file, append }) => ({ phase: "case", path: file, change: append ? "Append marked failing code; restore original bytes after capture." : "Add marked failing framework test; remove after capture." })),
      prepare: () => transaction.prepare(), restore: () => transaction.restore() });
  };

  add("cargo-build-cold", "itoa", "cargo build", "cargo-build", { prepare: cold("cargo-build-cold", "cargo", ["clean"]), cache: "cold" });
  add("cargo-build-warm", "itoa", "cargo build", "cargo-build", { cache: "warm", follows: "cargo-build-cold" });
  add("cargo-test", "itoa", "cargo test", "cargo-test");
  add("cargo-test-lib", "itoa", "cargo test --lib", "cargo-test");
  failure("cargo-compile-failure", "itoa", "cargo build", "cargo-build", [
    { path: "src/lib.rs", append: true, text: `\n// HuGR benchmark controlled modification; restored after capture.\ncompile_error!("${FAILURE_MARKER}");\n` },
  ]);
  add("go-test-verbose-cold", "gjson", "go test -v ./...", "go", { prepare: cold("go-test-verbose-cold", "go", ["clean", "-cache", "-testcache"]), cache: "cold" });
  add("go-test-verbose-cached", "gjson", "go test -v ./...", "go", { cache: "cached", follows: "go-test-verbose-cold" });
  add("go-test-default", "gjson", "go test", "go");
  failure("go-test-failure", "gjson", "go test -v ./...", "go", [
    { path: "bench_expected_failure_test.go", text: `// HuGR benchmark control, not an upstream test.\npackage gjson\nimport "testing"\nfunc TestBenchExpectedFailure(t *testing.T) { t.Fatal("${FAILURE_MARKER}") }\n` },
  ]);
  add("pytest-default", "boltons", "pytest", "pytest");
  add("pytest-quiet", "boltons", "pytest -q", "pytest");
  add("pytest-upstream-doctests", "boltons", "pytest --doctest-modules boltons tests", "pytest", { commandSource: "tox.ini [testenv] commands; source checkout replaces installed boltons path." });
  failure("pytest-failure", "boltons", "pytest", "pytest", [
    { path: "tests/bench_expected_failure_test.py", text: `# HuGR benchmark control, not an upstream test.\ndef test_bench_expected_failure():\n    assert False, "${FAILURE_MARKER}"\n` },
  ]);
  add("jest-direct", "ms", "jest --env node", "jest", { commandSource: "package.json scripts.test:nodejs" });
  add("jest-npm", "ms", "npm run test:nodejs", "jest");
  failure("jest-failure", "ms", "jest --env node", "jest", [
    { path: "src/bench-expected-failure.test.ts", text: `// HuGR benchmark control, not an upstream test.\nimport { test, expect } from '@jest/globals';\ntest('${FAILURE_MARKER}', () => { expect(true).toBe(false); });\n` },
  ]);
  add("vitest-direct", "ufo", "vitest run", "vitest");
  add("vitest-npm", "ufo", "npm test", "vitest", { commandSource: "package.json scripts.test: pnpm lint && vitest run --typecheck" });
  add("ufo-lint", "ufo", "npm run lint", "exact");
  failure("vitest-failure", "ufo", "vitest run", "vitest", [
    { path: "test/bench-expected-failure.test.ts", text: `// HuGR benchmark control, not an upstream test.\nimport { test, expect } from 'vitest';\ntest('${FAILURE_MARKER}', () => { expect(true).toBe(false); });\n` },
  ]);
  add("hugr-build", "hugr", "npm run build", "exact");
  add("hugr-typecheck", "hugr", "npm run typecheck", "exact");
  add("hugr-tsc-direct", "hugr", "tsc --noEmit", "exact", { allowEmpty: true });
  add("hugr-native-tests", "hugr", "tsx --test tests/core.test.ts tests/runners.test.ts", "node");
  add("git-status-clean", "hugr", "git status", "git");
  const mixedChanges = [
    { path: "README.md", append: true, text: "\nHuGR benchmark staged modification.\n" },
    { path: "PLAN.md", append: true, text: "\nHuGR benchmark unstaged modification.\n" },
    { path: "bench-untracked.txt", text: "HuGR benchmark untracked control.\n" },
  ];
  const mixed = edits(byId.hugr.path, mixedChanges);
  let mixedPrepared = false;
  const restoreMixed = async () => {
    if (!mixedPrepared) return;
    try { await run("restore-git-status-mixed", "git", ["restore", "--staged", "--", "README.md"], { cwd: byId.hugr.path }); }
    finally { await mixed.restore(); }
    mixedPrepared = false;
  };
  add("git-status-mixed", "hugr", "git status", "git", { category: "control",
    modifications: mixedChanges.map(({ path: file }) => ({ phase: "case", path: file, change: "Controlled staged/unstaged/untracked status; restored after capture." })),
    async prepare() {
      if (!run) throw new Error("CASE_SETUP_RUNNER_MISSING: git-status-mixed");
      if (mixedPrepared) throw new Error("CASE_ALREADY_PREPARED");
      const status = (await run("prepare-git-clean-check", "git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: byId.hugr.path })).text;
      if (status !== "") throw new Error(`CASE_DIRTY_CHECKOUT: git-status-mixed: ${status}`);
      await mixed.prepare();
      mixedPrepared = true;
      try { await run("prepare-git-status-mixed", "git", ["add", "--", "README.md"], { cwd: byId.hugr.path }); }
      catch (error) { await restoreMixed(); throw error; }
    },
    restore: restoreMixed,
  });
  add("rg-source", "hugr", "rg -n 'export' src", "rg");
  add("git-diff-history", "hugr", "git diff HEAD~1", "exact");
  add("read-readme", "hugr", "cat README.md", "exact");
  add("ls-repository", "hugr", "ls", "exact");
  return cases;
}

export async function provision(root, { repoRoot }) {
  const { projects, env, versions, run } = await setupProjects(root, { repoRoot });
  const cases = catalog(projects, run);
  for (const project of projects) project.modifications.push(...cases.filter((entry) => entry.project === project.id).flatMap((entry) => entry.modifications.map((modification) => ({ ...modification, case: entry.id }))));
  const result = { projects, cases, env, versions };
  // Functions remain in memory; the serializable catalog documents commands and planned edits.
  await writeFile(path.join(path.resolve(root), "catalog.json"), JSON.stringify(result, null, 2) + "\n");
  return result;
}
