// Literal developer commands, chosen by ecosystem/project coverage, never reducer acceptance.
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { setupProjects } from "./setup.mjs";
import { caseWorkspace } from "./case-workspace.mjs";

export const FAILURE_MARKER = "BENCH_EXPECTED_FAILURE";

/** Pure catalog construction supports offline CI; provision supplies the real setup runner. */
export function catalog(projects, run) {
  const required = ["itoa", "gjson", "boltons", "ms", "ufo", "hugr"], seen = new Set();
  if (!Array.isArray(projects)) throw new Error("CATALOG_INVALID_PROJECTS: expected array");
  for (const [index, project] of projects.entries()) {
    if (!project || typeof project !== "object" || !required.includes(project.id)) {
      throw new Error(`CATALOG_INVALID_PROJECT: ${index}`);
    }
    if (seen.has(project.id)) throw new Error(`CATALOG_DUPLICATE_PROJECT: ${project.id}`);
    if (typeof project.path !== "string" || !project.path.trim() || project.path.includes("\0") || !path.isAbsolute(project.path)) {
      throw new Error(`CATALOG_INVALID_PROJECT_PATH: ${project.id}`);
    }
    seen.add(project.id);
  }
  for (const id of required) if (!seen.has(id)) throw new Error(`CATALOG_MISSING_PROJECT: ${id}`);
  const byId = Object.fromEntries(projects.map((project) => [project.id, project]));
  const cases = [];
  const add = (id, project, command, oracle, options = {}, transaction) => {
    const entry = { id, project, category: "primary", command, cwd: byId[project].path, expectExit: "zero", oracle,
      allowEmpty: false, prepare: async () => {}, restore: async () => {}, modifications: [], ...options };
    // Define after construction: spreading options would snapshot live getters.
    Object.defineProperties(entry, {
      cwd: { enumerable: true, get: () => transaction?.cwd ?? byId[project].path },
      workspace: { enumerable: true, get: () => transaction?.workspace },
    });
    cases.push(entry);
    return entry;
  };
  const cold = (id, file, args) => async () => {
    if (!run) throw new Error(`CASE_SETUP_RUNNER_MISSING: ${id}`);
    await run(`prepare-${id}`, file, args, { cwd: byId[id.startsWith("cargo") ? "itoa" : "gjson"].path });
  };
  const failure = (id, project, command, oracle, changes) => {
    const transaction = caseWorkspace(byId[project].path, changes);
    add(id, project, command, oracle, { category: "control", expectExit: "nonzero", marker: FAILURE_MARKER,
      controlledFailure: true, modifications: changes.map(({ path: file, append }) => ({ phase: "case", path: file, change: append ? "Append marked failing code in retained copy; source unchanged; workspace retained after capture." : "Add marked failing framework test in retained copy; source unchanged; workspace retained after capture." })),
      async prepare() {
        try { await transaction.prepare(); }
        catch (error) {
          if (error.code !== "CASE_ALREADY_PREPARED") await transaction.restore();
          throw error;
        }
      }, restore: () => transaction.restore() }, transaction);
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
  const mixed = caseWorkspace(byId.hugr.path, mixedChanges);
  let mixedPrepared = false;
  const restoreMixed = async () => {
    await mixed.restore();
    mixedPrepared = false;
  };
  add("git-status-mixed", "hugr", "git status", "git", { category: "control",
    modifications: mixedChanges.map(({ path: file }) => ({ phase: "case", path: file, change: "Controlled staged/unstaged/untracked status in retained copy; source/index unchanged; workspace retained after capture." })),
    async prepare() {
      if (!run) throw new Error("CASE_SETUP_RUNNER_MISSING: git-status-mixed");
      if (mixedPrepared) throw new Error("CASE_ALREADY_PREPARED");
      const status = (await run("prepare-git-clean-check", "git", ["--no-optional-locks", "status", "--porcelain=v1", "--untracked-files=all"], { cwd: byId.hugr.path })).text;
      if (status !== "") throw new Error(`CASE_DIRTY_CHECKOUT: git-status-mixed: ${status}`);
      try {
        await mixed.prepare();
        mixedPrepared = true;
        await run("prepare-git-status-mixed", "git", ["add", "--", "README.md"], { cwd: mixed.cwd });
      }
      catch (error) { await restoreMixed(); throw error; }
    },
    restore: restoreMixed,
  }, mixed);
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
