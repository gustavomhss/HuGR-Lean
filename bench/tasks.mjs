// Task definitions for the HuGR-Lean A/B benchmark. Both arms get the identical prompt.
// `source` pins a public repository; `setup` names the minimal patch that creates the failing state.
// `history: false` means the workspace is a fresh one-commit repository (the bug patch cannot be
// recovered with git diff/log). `protect` lists paths whose content must be unchanged after the run.

const SUFFIX = "\n\nWork autonomously and do not ask questions. Stop when the task is done.";

export const SOURCES = {
  semver: { url: "https://github.com/dtolnay/semver.git", commit: "280ebcb6edac3aa4cdc545dbff8a26c5ac4861fe", license: "MIT OR Apache-2.0" },
  pflag: { url: "https://github.com/spf13/pflag.git", commit: "c966cfef47379dcb01e7929504d66d94b540945b", license: "BSD-3-Clause" },
  "more-itertools": { url: "https://github.com/more-itertools/more-itertools.git", commit: "b21ec4ee8e139ebe297e2221980a694bebb69523", license: "MIT" },
  ufo: { url: "https://github.com/unjs/ufo.git", commit: "f06c800d0c59f2a4a1b9ba65eb6cb61a84419be6", license: "MIT" },
};

export const TASKS = [
  {
    id: "t1-rust-semver", source: "semver", setup: "setup.patch", history: false, prebuild: "cargo",
    protect: ["tests"],
    prompt: "The test suite of this Rust crate is failing (`cargo test`). Find the bug in the library source " +
      "and fix it so that `cargo test` passes. Do not modify any test files. Keep the change minimal." + SUFFIX,
    check: { kind: "command", cmd: ["cargo", "test", "--offline", "-q"] },
  },
  {
    id: "t2-go-pflag", source: "pflag", setup: "setup.patch", history: false, prebuild: null,
    protect: ["*_test.go"],
    prompt: "The test suite of this Go module is failing (`go test ./...`). Find the bug in the library source " +
      "and fix it so that `go test ./...` passes. Do not modify any test files. Keep the change minimal." + SUFFIX,
    check: { kind: "command", cmd: ["go", "test", "-count=1", "./..."] },
  },
  {
    id: "t3-py-more-itertools", source: "more-itertools", setup: "setup.patch", history: false, prebuild: null,
    protect: ["tests"],
    prompt: "The test suite of this Python package is failing (run it with `python3 -m pytest`). Find the bug in " +
      "the library source and fix it so that the whole test suite passes. Do not modify any test files. " +
      "Keep the change minimal." + SUFFIX,
    check: { kind: "command", cmd: ["python3", "-m", "pytest", "-q", "-p", "no:cacheprovider"] },
  },
  {
    id: "t4-vitest-ufo", source: "ufo", setup: "setup.patch", history: false, prebuild: "pnpm",
    protect: ["test"],
    prompt: "The vitest test suite of this TypeScript library is failing (`npx vitest run`). Find the bug in the " +
      "library source and fix it so that `npx vitest run` passes. Do not modify any test files. " +
      "Keep the change minimal." + SUFFIX,
    check: { kind: "command", cmd: ["npx", "vitest", "run"] },
  },
  {
    id: "t5-git-review", source: "more-itertools", setup: null, history: true, prebuild: null, protect: [],
    prompt: "Review what changed in this repository between the git tags v10.8.0 and v11.0.0, using git " +
      "(git log, git diff, git show). Then write a file ANSWER.json in the repository root containing one JSON " +
      "object with exactly these keys:\n" +
      "- \"commit_count\": number of commits in v10.8.0..v11.0.0 (all paths);\n" +
      "- \"added_public_names\": sorted list of names present in the `__all__` list of more_itertools/more.py " +
      "at v11.0.0 but not at v10.8.0;\n" +
      "- \"removed_public_names\": sorted list of names present in that `__all__` at v10.8.0 but not at v11.0.0;\n" +
      "- \"most_changed_file\": the path with the most changed lines (added plus deleted) in " +
      "`git diff v10.8.0 v11.0.0`;\n" +
      "- \"zip_equal_removal_commit\": the full 40-character hash of the commit in that range that removed " +
      "`zip_equal` from the `__all__` list of more_itertools/more.py.\n" +
      "Do not modify any other file." + SUFFIX,
    check: {
      kind: "answer",
      expected: {
        commit_count: 153,
        added_public_names: ["Stats", "concurrent_tee", "running_max", "running_min", "running_statistics",
          "serialize", "sized_iterator", "synchronized"],
        removed_public_names: ["UnequalIterablesError", "zip_equal"],
        most_changed_file: "tests/test_more.py",
        zip_equal_removal_commit: "361b92567361f377489ce608d5e6280e4f6f986b",
      },
    },
  },
  {
    id: "t6-ci-log", source: null, setup: null, history: false, prebuild: null, protect: ["ci"],
    fixture: { from: "run-37465844384.failed.log.gz", to: "ci/run-37465844384.log",
      sha256: "215fcd5b677122a9c6bbc5860ef0c807becc9b84fc48061f6cf1d21d93c8c4bc" },
    prompt: "The file ci/run-37465844384.log is the saved output of `gh run view 37465844384 -R pytest-dev/pytest " +
      "--log-failed` (a failed GitHub Actions run of the pytest project). Diagnose the failure using shell " +
      "commands. Then write a file ANSWER.json in the current directory containing one JSON object with exactly " +
      "these keys:\n" +
      "- \"failed_jobs\": sorted list of the names of the jobs whose test step had failing tests (exclude the " +
      "aggregate `check` job);\n" +
      "- \"failed_tests\": an object mapping each of those job names to the sorted list of pytest node ids " +
      "(for example `testing/test_x.py::TestY::test_z`) reported as FAILED in that job;\n" +
      "- \"python_versions\": an object mapping each of those job names to the exact Python version " +
      "(for example `3.12.4`) that ran the tests in that job.\n" +
      "Do not modify the log." + SUFFIX,
    check: {
      kind: "answer",
      expected: {
        failed_jobs: ["build (ubuntu-py310-xdist)", "build (windows-py311)"],
        failed_tests: {
          "build (ubuntu-py310-xdist)": ["testing/test_debugging.py::TestPDB::test_pdb_unittest_postmortem"],
          "build (windows-py311)": ["testing/test_terminal.py::TestProgressOutputStyle::test_times"],
        },
        python_versions: { "build (ubuntu-py310-xdist)": "3.10.22", "build (windows-py311)": "3.11.9" },
      },
    },
  },
  {
    id: "t7-large-file", source: "more-itertools", setup: null, history: false, prebuild: null, protect: ["tests"],
    prompt: "Add a new public function `pairwise_diff(iterable)` to more_itertools/more.py. It lazily yields " +
      "`b - a` for each pair of consecutive items `a, b` of the iterable (so `[1, 4, 9, 16]` gives `3, 5, 7`; " +
      "fewer than two items give nothing). Follow the conventions of the surrounding code:\n" +
      "- define it directly after the existing function `difference` in more_itertools/more.py, with a docstring " +
      "in the same style;\n" +
      "- add it to `__all__` in both more_itertools/more.py and more_itertools/more.pyi, keeping those lists " +
      "sorted, and add a type stub for it in more.pyi;\n" +
      "- document it in docs/api.rst next to `difference` with an `.. autofunction::` entry.\n" +
      "Do not modify existing tests. Make sure `python3 -m pytest tests/test_more.py` still passes." + SUFFIX,
    check: { kind: "script", cmd: ["python3", "-I", "{task}/check_hidden.py", "{ws}"] },
  },
  {
    id: "t8-control", source: "ufo", setup: null, history: false, prebuild: "pnpm", protect: ["test"],
    prompt: "Add an exported function `isHttpsURL(input: string): boolean` to src/utils.ts. It returns true " +
      "exactly when the input starts with `https://`, compared case-insensitively, and false otherwise. " +
      "Keep the change small." + SUFFIX,
    check: { kind: "hidden-vitest", file: "bench_hidden.test.ts", cmd: ["npx", "vitest", "run"] },
  },
];
