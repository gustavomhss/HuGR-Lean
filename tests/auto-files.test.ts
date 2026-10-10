import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { filterAutomatic } from "../src/core/automatic.js";
import type { AutomaticObservation } from "../src/core/automatic-types.js";
import { renderReduction } from "../src/core/structured-render.js";
import { reduceAutomaticFiles } from "../src/profiles/auto-files.js";

const fixture = JSON.parse(readFileSync(new URL("../fixtures/automatic/files/native.json", import.meta.url), "utf8")) as Record<string, string>;
const observation = (tool: string, output: string, metadata: Record<string, unknown>, args: Record<string, unknown> = {}): AutomaticObservation => ({
  source: "native", tool, output, metadata: { truncated: false, ...metadata }, args, status: "success", completeness: "complete",
});
const glob = (output = fixture.glob!): AutomaticObservation => observation("glob", output, { count: output.split("\n").length });
const grep = (output = fixture.grep!): AutomaticObservation => observation("grep", output, { matches: 3 });
const directory = (): AutomaticObservation => observation("read", fixture.directory!, {}, { filePath: "/workspace/project with spaces/日本語😀" });
function replacement(input: AutomaticObservation): string {
  const result = filterAutomatic(input, { reducers: [{ id: "auto-files", reduce: reduceAutomaticFiles }] });
  assert.equal(result.status, "reduced");
  if (result.status !== "reduced") throw new Error(result.reason);
  assert.ok(Buffer.byteLength(result.replacement) < Buffer.byteLength(input.output));
  return result.replacement;
}
function refuse(input: AutomaticObservation): void {
  assert.equal(reduceAutomaticFiles(input), undefined);
  assert.equal(filterAutomatic(input, { reducers: [{ id: "auto-files", reduce: reduceAutomaticFiles }] }).status, "passthrough");
}

// Independent semantic decoder: no reducer spans or parsing helpers used.
function decodePaths(view: string): string[] {
  const [scope, ...rows] = view.split("\n");
  assert.ok(scope?.endsWith(":"));
  return rows.map(row => scope!.slice(0, -1) + row);
}
function decodeMatches(text: string, factored: boolean): { header: string; groups: { path: string; rows: { line: string; text: string }[] }[] } {
  const lines = text.split("\n");
  const header = lines.shift()!;
  const prefix = factored ? lines.shift()!.slice(0, -1) : "";
  const groups: { path: string; rows: { line: string; text: string }[] }[] = [];
  while (lines.length) {
    const path = lines.shift()!;
    assert.ok(path.endsWith(":"));
    const rows: { line: string; text: string }[] = [];
    while (lines.length && lines[0] !== "") {
      const match = /^  Line (\d+): (.*)$/u.exec(lines.shift()!);
      assert.ok(match);
      rows.push({ line: match[1]!, text: match[2]! });
    }
    assert.ok(rows.length);
    groups.push({ path: prefix + path.slice(0, -1), rows });
    if (lines[0] === "") lines.shift();
  }
  return { header, groups };
}

test("synthetic native glob: reconstruct every full path, duplicate and order", () => {
  for (const prefix of ["/workspace/project with spaces/日本語😀/", "C:\\workspace\\project with spaces\\日本語😀\\", "\\\\server\\share\\project with spaces\\日本語😀\\", "//server/share/日本語😀/"]) {
    const separator = prefix.includes("\\") ? "\\" : "/";
    const paths = [prefix + "src" + separator + "alpha.ts", prefix + "tests" + separator + "beta.ts", prefix + "src" + separator + "alpha.ts"];
    assert.deepEqual(decodePaths(replacement(glob(paths.join("\n")))), paths);
  }
});

test("synthetic native grep: reconstruct all path/line/text associations and order", () => {
  for (const prefix of ["/workspace/project with spaces/日本語😀/", "C:\\workspace\\日本語😀\\", "\\\\server\\share\\日本語😀\\"]) {
    const output = fixture.grep!.replaceAll("/workspace/project with spaces/日本語😀/", prefix);
    assert.deepEqual(decodeMatches(replacement(grep(output)), true), decodeMatches(output, false));
  }
});

test("directory preserves exact path/type, entries, count; effective offset omitted/0/1", () => {
  for (const offset of [undefined, 0, 1]) {
    const input = directory();
    const value = replacement({ ...input, args: { ...input.args, ...(offset === undefined ? {} : { offset }) } });
    assert.equal(value.replace("<type>directory</type>\n", "<type>directory</type>\n<entries>\n") + "\n</entries>", input.output);
  }
  const input = directory();
  const display = { type: "directory", path: input.args.filePath, offset: 1, totalEntries: 3, truncated: false, entries: ["alpha.ts", "folder/", "日本語😀 file.ts"] };
  replacement({ ...input, metadata: { ...input.metadata, display } });
  for (const change of [{ type: "file" }, { path: "/wrong" }, { offset: 0 }, { totalEntries: 4 }, { truncated: true }, { entries: ["alpha.ts", "folder/", "wrong"] }]) {
    refuse({ ...input, metadata: { ...input.metadata, display: { ...display, ...change } } });
  }
  replacement(observation("read", "<path>/empty</path>\n<type>directory</type>\n<entries>\n\n\n(0 entries)\n</entries>", {}, { filePath: "/empty" }));
});

test("full grammar refusal: native failures, clipping, unknown and count contradictions", () => {
  for (const input of [glob(), grep(), directory()]) {
    for (const change of [{ source: "mcp" }, { status: "failure" }, { status: "unknown" }, { completeness: "truncated" }, { completeness: "unknown" }, { tool: "unknown" }] as Partial<AutomaticObservation>[]) refuse({ ...input, ...change });
    for (const truncated of [true, undefined, "false"]) refuse({ ...input, metadata: { ...input.metadata, truncated } });
    for (const suffix of ["\nunknown", "\n(Results truncated. Consider using a more specific path or pattern.)", "\n\n(Results are truncated: showing first 100 results. Consider using a more specific path or pattern.)"]) refuse({ ...input, output: input.output + suffix });
  }
  for (const count of [0, 2, 4, undefined, "3", NaN]) refuse({ ...glob(), metadata: { truncated: false, count } });
  for (const matches of [0, 2, 4, undefined, "3", NaN]) refuse({ ...grep(), metadata: { truncated: false, matches } });
  for (const output of [fixture.glob! + "\n", fixture.glob!.replace("/workspace", "relative"), "No files found", "Error: permission denied"]) refuse(glob(output));
  for (const output of [fixture.grep!.replace("Found 3", "Found 4"), fixture.grep!.replace(" matches", " matches (more matches available)"), fixture.grep!.replace("Line 12", "Line 0"), fixture.grep!.replace("  Line 13: ", "unknown"), fixture.grep! + "\n", fixture.grep!.replace("\n\n/workspace", "\n/workspace")]) refuse(grep(output));
  for (const offset of [2, -1, "1", null]) refuse({ ...directory(), args: { ...directory().args, offset } });
  for (const output of [fixture.directory!.replace("(3 entries)", "(4 entries)"), fixture.directory!.replace("(3 entries)", "(Showing 3 of 4 entries. Use 'offset' parameter to read beyond entry 4)"), fixture.directory!.replace("folder/", "folder/nested"), fixture.directory! + "\n"]) refuse({ ...directory(), output });
  refuse({ ...directory(), args: { ...directory().args, limit: 2 } });
  refuse(observation("read", fixture.file!, {}, { filePath: "/workspace/data.json" }));
});

test("shared core refuses non-shrinking candidate; source spans use UTF-16", () => {
  const input = glob("/a\n/b");
  assert.equal(filterAutomatic(input, { reducers: [{ id: "auto-files", reduce: reduceAutomaticFiles }] }).status, "passthrough");
  const reduction = reduceAutomaticFiles(glob())!;
  assert.deepEqual(decodePaths(renderReduction(fixture.glob!, reduction)), fixture.glob!.split("\n"));
  assert.throws(() => renderReduction(fixture.glob!, { ...reduction, pieces: reduction.pieces.slice(0, -1) }));
});
