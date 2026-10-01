// Literal developer commands, chosen by ecosystem/project coverage, never reducer acceptance.
import { constants } from "node:fs";
import fs, { writeFile } from "node:fs/promises";
import path from "node:path";
import { setupProjects } from "./setup.mjs";

export const FAILURE_MARKER = "BENCH_EXPECTED_FAILURE";

const sameFile = (left, right) => left.isFile() && right.isFile() && left.dev === right.dev && left.ino === right.ino;
const inside = (root, file) => {
  const relative = path.relative(root, file);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};
const readWrite = constants.O_RDWR | (constants.O_NOFOLLOW ?? 0);

async function editPath(root, relative) {
  if (typeof relative !== "string" || !relative || path.isAbsolute(relative) || relative.split(path.sep).includes("..")) {
    throw new Error(`CASE_PATH_OUTSIDE: ${relative}`);
  }
  const file = path.resolve(root, relative), parent = await fs.realpath(path.dirname(file));
  if (file === root || !inside(root, file) || !inside(root, parent)) throw new Error(`CASE_PATH_OUTSIDE: ${relative}`);
  return path.join(parent, path.basename(file));
}

async function writeAt(handle, bytes, position, progress = () => {}) {
  let offset = 0;
  while (offset < bytes.length) {
    const { bytesWritten } = await handle.write(bytes, offset, bytes.length - offset, position + offset);
    if (!bytesWritten) throw new Error("CASE_WRITE_INCOMPLETE");
    offset += bytesWritten;
    progress(offset);
  }
}

/** Transactional file edits; restoration also works after a partial prepare or failed capture. */
export function edits(projectPath, changes) {
  let saved, root;
  return {
    async prepare() {
      if (saved) throw new Error("CASE_ALREADY_PREPARED");
      saved = [];
      try {
        root = await fs.realpath(projectPath);
        for (const change of changes) {
          const file = await editPath(root, change.path);
          let entry;
          try { entry = await fs.lstat(file); }
          catch (error) { if (error.code !== "ENOENT" || change.append) throw error; }
          if (!change.append && entry) throw new Error(`CASE_WOULD_OVERWRITE: ${file}`);
          if (change.append && !entry.isFile()) throw new Error(`CASE_APPEND_NOT_REGULAR: ${file}`);
          // Failed exclusive creation establishes no ownership and must never enter rollback.
          const handle = await fs.open(file, change.append ? readWrite : "wx+");
          try {
            const identity = await handle.stat();
            if (!sameFile(identity, await fs.lstat(file)) || (entry && !sameFile(identity, entry))) {
              throw new Error(`CASE_PREPARE_FOREIGN: ${file}`);
            }
            const original = change.append ? await handle.readFile() : undefined;
            const base = original ?? Buffer.alloc(0), bytes = Buffer.from(change.text);
            const record = { file, original, identity, expected: base };
            saved.push(record);
            await writeAt(handle, bytes, base.length, (offset) => {
              record.expected = Buffer.concat([base, bytes.subarray(0, offset)]);
            });
          } finally { await handle.close(); }
        }
      } catch (error) {
        try { await this.restore(); }
        catch (rollback) { throw new AggregateError([error, rollback], `CASE_ROLLBACK_FAILED: ${error.message}; ${rollback.message}`); }
        throw error;
      }
    },
    async restore() {
      if (!saved) return;
      const failures = [];
      for (const record of saved.toReversed()) {
        const { file, original, identity, expected } = record;
        let handle;
        try {
          if (await fs.realpath(root) !== root || await editPath(root, path.relative(root, file)) !== file ||
              !sameFile(identity, await fs.lstat(file))) throw new Error("identity changed");
          handle = await fs.open(file, readWrite);
          if (!sameFile(identity, await handle.stat()) || !(await handle.readFile()).equals(expected) ||
              !sameFile(identity, await fs.lstat(file))) throw new Error("identity or content changed");
        } catch (cause) {
          await handle?.close();
          failures.push(new Error(`CASE_RESTORE_FOREIGN: ${file}`, { cause }));
          continue;
        }
        try {
          if (original === undefined) await fs.unlink(file);
          else { await writeAt(handle, original, 0); await handle.truncate(original.length); }
          saved.splice(saved.indexOf(record), 1);
        } finally { await handle.close(); }
      }
      if (!saved.length) saved = undefined;
      if (failures.length === 1) throw failures[0];
      if (failures.length) throw new AggregateError(failures, "CASE_RESTORE_FOREIGN: multiple files");
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
