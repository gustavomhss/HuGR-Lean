import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const ROOTS = ["src", "tests", "scripts"];
const DOCS = ["README.md", "OWNERSHIP.md", "MAINTENANCE.md", "MANUAL.md", "BLAST_RADIUS.md"];
const SCRIPT_KINDS = new Map([
  [".ts", ts.ScriptKind.TS], [".tsx", ts.ScriptKind.TSX],
  [".mts", ts.ScriptKind.TS], [".cts", ts.ScriptKind.TS],
  [".js", ts.ScriptKind.JS], [".jsx", ts.ScriptKind.JSX],
  [".mjs", ts.ScriptKind.JS], [".cjs", ts.ScriptKind.JS],
]);

// Logical LOC means physical lines containing parsed language tokens, not statements.
// Comment-only/blank lines do not count; multiline literal payloads do count.
// The parser handles regex/template/string context; no comment-stripping regex.
function logicalLOC(path, text) {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true,
    SCRIPT_KINDS.get(extname(path)));
  if (source.parseDiagnostics.length) {
    const diagnostic = source.parseDiagnostics[0];
    const { line, character } = source.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
    throw new Error(`${path}:${line + 1}:${character + 1}: cannot count invalid syntax: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`);
  }
  const lines = new Set();
  function visit(node) {
    if (node.kind === ts.SyntaxKind.EndOfFileToken ||
        (node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode)) return;
    const children = node.getChildren(source);
    if (children.length) { children.forEach(visit); return; }
    if (node.kind < ts.SyntaxKind.FirstToken || node.kind > ts.SyntaxKind.LastToken) return;
    const start = node.getStart(source), end = node.getEnd();
    if (end <= start) return;
    const first = source.getLineAndCharacterOfPosition(start).line;
    const last = source.getLineAndCharacterOfPosition(end - 1).line;
    for (let line = first; line <= last; line++) lines.add(line);
  }
  visit(source);
  return lines.size;
}

/** Checks known code roots and direct src modules; document quality needs human review. */
export function checkStructure(root) {
  const base = resolve(root), errors = [], files = [], modules = [], warnings = [];
  function entries(path) {
    try {
      if (!lstatSync(join(base, path)).isDirectory()) throw new Error("expected a real directory");
      return readdirSync(join(base, path), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) { errors.push(`Cannot enumerate ${path}: ${error.message}`); return []; }
  }
  function scan(path, items) {
    for (const item of items) {
      const name = `${path}/${item.name}`;
      if (item.isDirectory()) scan(name, entries(name));
      else if (!item.isFile()) errors.push(`Unsupported filesystem entry: ${name}`);
      else if (SCRIPT_KINDS.has(extname(name))) {
        try {
          const count = logicalLOC(name, readFileSync(join(base, name), "utf8"));
          const band = count > 600 ? "tolerated" : count > 400 ? "allowed" : "target";
          files.push({ path: name, logicalLOC: count, band });
          if (count > 750) errors.push(`${name}: ${count} logical LOC exceeds hard limit 750; split required`);
          else if (count > 400) warnings.push(`${name}: ${count} logical LOC ${band}; target 400, allowed through 600, tolerated through 750`);
        } catch (error) { errors.push(`Cannot inspect ${name}: ${error.message}`); }
      }
    }
  }
  for (const path of ROOTS) {
    const items = entries(path);
    if (!items.length) errors.push(`Empty root: ${path}`);
    if (path === "src") modules.push(...items.filter((item) => item.isDirectory()).map((item) => `src/${item.name}`));
    const before = files.length;
    scan(path, items);
    const inspected = files.slice(before);
    if (!inspected.length) errors.push(`Empty source list: ${path} has no inspectable ${[...SCRIPT_KINDS.keys()].join("/")} files`);
    else if (!inspected.some((file) => file.logicalLOC > 0)) errors.push(`Code-less root: ${path} has no positive logical LOC; empty/comment-only files do not count`);
  }
  if (!modules.length) errors.push("Empty module list: src has no direct module directories");
  for (const module of modules) {
    if (!files.some((file) => file.path.startsWith(`${module}/`) && file.logicalLOC > 0)) errors.push(`Empty module: ${module}`);
    for (const name of ["index.ts", ...DOCS]) {
      const path = `${module}/${name}`;
      try {
        if (!lstatSync(join(base, path)).isFile()) throw new Error("expected a regular file");
        if (!readFileSync(join(base, path), "utf8").trim()) throw new Error("file is empty");
        if (name === "index.ts" && !files.some((file) => file.path === path && file.logicalLOC > 0)) throw new Error("entrypoint has no inspectable code");
      } catch (error) { errors.push(`Required module file ${path}: ${error.message}`); }
    }
  }
  if (errors.length) throw new Error(`Structure check failed:\n${errors.map((error) => `- ${error}`).join("\n")}`);
  return { files, modules, warnings };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    if (process.argv.length > 3) throw new Error("Usage: node scripts/check-structure.mjs [root]");
    const report = checkStructure(process.argv[2] ?? process.cwd());
    for (const warning of report.warnings) console.warn(`Warning: ${warning}`);
    console.log(`Structure OK: ${report.files.length} code files, ${report.modules.length} modules. Documentation presence/nonempty checked; quality needs review.`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
