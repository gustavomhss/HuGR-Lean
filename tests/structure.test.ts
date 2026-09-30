import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

const script = new URL("../scripts/check-structure.mjs", import.meta.url);
type Report = { files: { path: string; logicalLOC: number; band: string }[]; modules: string[]; warnings: string[] };
const { checkStructure }: { checkStructure: (root: string) => Report } = await import(script.href);
const docs = ["README.md", "OWNERSHIP.md", "MAINTENANCE.md", "MANUAL.md", "BLAST_RADIUS.md"];
const code = (count: number): string => "void 0;\n".repeat(count);
function put(root: string, path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}
function fixture(t: TestContext, complete = true): string {
  const root = mkdtempSync(join(tmpdir(), "lean-structure-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  if (complete) {
    for (const name of ["engine", "future-module"]) {
      put(root, `src/${name}/index.ts`, "export {};\n");
      for (const doc of docs) put(root, `src/${name}/${doc}`, `# ${name} ${doc}\n`);
    }
    put(root, "tests/example.test.ts", code(1));
    put(root, "scripts/example.mjs", code(1));
  }
  return root;
}
function fails(root: string, message: RegExp): void {
  assert.throws(() => checkStructure(root), message);
}

test("complete synthetic tree passes; discovery includes future modules and every code root", (t) => {
  const root = fixture(t), report = checkStructure(root);
  assert.deepEqual(report.modules, ["src/engine", "src/future-module"]);
  assert.deepEqual(report.files.map((file) => file.path).sort(), ["scripts/example.mjs", "src/engine/index.ts", "src/future-module/index.ts", "tests/example.test.ts"]);
  assert.deepEqual(report.warnings, []);
});

test("empty tree, missing/non-directory roots, and roots with no code fail explicitly", (t) => {
  const empty = fixture(t, false);
  fails(empty, /Cannot enumerate src/);
  for (const name of ["src", "tests", "scripts"]) mkdirSync(join(empty, name));
  fails(empty, /Empty root: src/);
  fails(empty, /Empty source list: tests/);
  for (const name of ["src", "tests", "scripts"]) {
    const root = fixture(t);
    rmSync(join(root, name), { recursive: true });
    fails(root, new RegExp(`Cannot enumerate ${name}`));
    put(root, name, "not a directory");
    fails(root, new RegExp(`Cannot enumerate ${name}: expected a real directory`));
    rmSync(join(root, name)); mkdirSync(join(root, name));
    put(root, `${name}/notes.md`, "# Not code\n");
    fails(root, new RegExp(`Empty source list: ${name}`));
  }
});

for (const name of ["src", "tests", "scripts"]) test(`required root rejects empty/comment-only source files: ${name}`, (t) => {
  const root = fixture(t), files = checkStructure(root).files.filter((file) => file.path.startsWith(`${name}/`));
  assert.ok(files.length > 0, "Positive control needs existing code files");
  for (const text of ["", " \n\t\n", "// comment\n/* comment */\n", "/**\n * documentation only\n */\n"]) {
    for (const file of files) put(root, file.path, text);
    fails(root, new RegExp(`Code-less root: ${name} has no positive logical LOC`));
  }
  for (const file of files) put(root, file.path, code(1));
  assert.ok(checkStructure(root).files.some((file) => file.path.startsWith(`${name}/`) && file.logicalLOC > 0));
});

test("module list and each module must be nonempty; index.ts is mandatory code", (t) => {
  const root = fixture(t);
  rmSync(join(root, "src"), { recursive: true });
  put(root, "src/index.ts", "export {};\n");
  fails(root, /Empty module list/);
  mkdirSync(join(root, "src/new-module"));
  fails(root, /Empty module: src\/new-module/);
  for (const doc of docs) put(root, `src/new-module/${doc}`, "# Present\n");
  fails(root, /Required module file src\/new-module\/index\.ts/);
  put(root, "src/new-module/index.ts", "// No code\n");
  fails(root, /index\.ts: entrypoint has no inspectable code/);
  put(root, "src/new-module/index.ts", "export {};\n");
  assert.deepEqual(checkStructure(root).modules, ["src/new-module"]);
});

for (const name of ["index.ts", ...docs]) test(`missing, empty, or directory module file fails: ${name}`, (t) => {
  const root = fixture(t), path = `src/future-module/${name}`;
  assert.ok(checkStructure(root).modules.includes("src/future-module"));
  rmSync(join(root, path));
  fails(root, new RegExp(`Required module file src/future-module/${name.replaceAll(".", "\\.")}`));
  put(root, path, " \n\t\n");
  fails(root, /file is empty/);
  rmSync(join(root, path)); mkdirSync(join(root, path));
  fails(root, /expected a regular file/);
});

test("400/600/750 boundaries warn by band; 751 requires split in every root and extension", (t) => {
  for (const path of ["src/engine/nested/index.ts", "tests/nested/example.js", "scripts/nested/config.mjs"]) {
    const root = fixture(t);
    for (const [count, band] of [[400, "target"], [401, "allowed"], [600, "allowed"], [601, "tolerated"], [750, "tolerated"]] as const) {
      put(root, path, code(count));
      const report = checkStructure(root), file = report.files.find((item) => item.path === path);
      assert.deepEqual(file, { path, logicalLOC: count, band });
      assert.equal(report.warnings.length, count > 400 ? 1 : 0);
      if (count > 400) assert.ok(report.warnings[0]?.includes(`${count} logical LOC ${band}`));
    }
    put(root, path, code(751));
    fails(root, /751 logical LOC exceeds hard limit 750; split required/);
  }
});

test("all eight JS/TS extensions parse native syntax and reject renamed 751-LOC files", (t) => {
  const root = fixture(t);
  const syntax = [
    [".ts", "const value: number = 1;\n"], [".tsx", "const element: JSX.Element = <div />;\n"],
    [".mts", "export const value: number = 1;\n"], [".cts", "export const value: number = 1;\n"],
    [".js", "const value = 1;\n"], [".jsx", "const element = <div title='/* payload */' />;\n"],
    [".mjs", "export const value = 1;\n"], [".cjs", "module.exports = 1;\n"],
  ] as const;
  for (const [extension, sample] of syntax) {
    const path = `scripts/renamed${extension}`;
    put(root, path, sample);
    assert.equal(checkStructure(root).files.find((file) => file.path === path)?.logicalLOC, 1, path);
    rmSync(join(root, path));
    put(root, "scripts/original.ts", code(751));
    renameSync(join(root, "scripts/original.ts"), join(root, path));
    fails(root, new RegExp(`scripts/renamed${extension.replace(".", "\\.")}: 751 logical LOC exceeds hard limit 750; split required`));
    rmSync(join(root, path));
  }
});

test("parser ignores comments, counts literals/regex correctly, and rejects broken syntax", (t) => {
  const root = fixture(t), path = "src/engine/lexical.ts";
  put(root, path, "/**\n * doc-only\n */\n// comment\n\nconst open = '/*'; // not a comment opener\nconst regex = /\\/\\*/;\nconst template = `first\n// payload\n\n${1 + 2}\nlast`;\n/* end */\n");
  assert.equal(checkStructure(root).files.find((file) => file.path === path)?.logicalLOC, 7);
  put(root, path, "// padding\n\n".repeat(1000) + code(750));
  assert.equal(checkStructure(root).files.find((file) => file.path === path)?.logicalLOC, 750);
  put(root, path, "const broken = ;\n");
  fails(root, /lexical\.ts:1:\d+: cannot count invalid syntax/);
  rmSync(join(root, path));
  for (const extension of [".jsx", ".tsx"]) {
    const jsx = `src/engine/payload${extension}`;
    put(root, jsx, "const element = <div>\n// payload\n/* payload */\n\n</div>;\n");
    assert.equal(checkStructure(root).files.find((file) => file.path === jsx)?.logicalLOC, 5, "JSX text is payload, not comment trivia");
    rmSync(join(root, jsx));
  }
});

test("no basename exclusions inside roots; generated/dependency trees outside roots are out of scope", (t) => {
  const root = fixture(t);
  put(root, "node_modules/vendor.js", code(751)); put(root, "dist/generated.js", code(751));
  assert.ok(checkStructure(root).files.length > 0);
  for (const path of ["tests/node_modules/vendor.js", "scripts/dist/generated.js", "src/engine/.hidden/index.ts"]) {
    put(root, path, code(751));
    fails(root, new RegExp(path.replaceAll(".", "\\.")));
    rmSync(join(root, path));
  }
  symlinkSync(join(root, "dist"), join(root, "scripts/alias.js"), process.platform === "win32" ? "junction" : "dir");
  fails(root, /Unsupported filesystem entry: scripts\/alias\.js/);
});

test("CLI passes complete fixture, warns on tolerated LOC, and names failures with exit 1", (t) => {
  const root = fixture(t), run = () => spawnSync(process.execPath, [fileURLToPath(script), root], { encoding: "utf8" });
  put(root, "scripts/large.js", code(601));
  const good = run();
  assert.equal(good.error, undefined); assert.equal(good.status, 0);
  assert.match(good.stdout, /Structure OK: 5 code files, 2 modules/);
  assert.match(good.stderr, /large\.js: 601 logical LOC tolerated/);
  rmSync(join(root, "src/engine/OWNERSHIP.md"));
  put(root, "scripts/large.js", code(751));
  const broken = run();
  assert.equal(broken.status, 1); assert.match(broken.stderr, /src\/engine\/OWNERSHIP\.md/);
  assert.match(broken.stderr, /large\.js: 751 logical LOC/);
  const empty = spawnSync(process.execPath, [fileURLToPath(script), fixture(t, false)], { encoding: "utf8" });
  assert.equal(empty.status, 1); assert.match(empty.stderr, /Cannot enumerate src/);
});
