import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
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
function decodeMatches(text: string, factored: boolean): { raw: string; header: string; groups: { path: string; rows: { line: string; text: string }[] }[] } {
  const lines = text.split("\n");
  const header = lines.shift()!;
  const prefix = factored ? lines.shift()!.slice(0, -1) : "";
  const groups: { path: string; rows: { line: string; text: string }[] }[] = [];
  const restored = [header];
  for (const row of lines) {
    if (row === "") { restored.push(row); continue; }
    if (row.startsWith("  Line ")) {
      const match = /^  Line (\d+): (.*)$/u.exec(row);
      assert.ok(match);
      assert.ok(groups.length);
      groups.at(-1)!.rows.push({ line: match[1]!, text: match[2]! });
      restored.push(row);
    } else {
      assert.ok(row.endsWith(":"));
      groups.push({ path: prefix + row.slice(0, -1), rows: [] });
      restored.push(prefix + row);
    }
  }
  assert.ok(groups.every(group => group.rows.length));
  return { raw: restored.join("\n"), header, groups };
}

test("actual installed 1.18.17 grep capture: exact native packet and LF reconstruction", () => {
  const bytes = readFileSync(new URL("../fixtures/automatic/files/host-grep.jsonl", import.meta.url));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), "b30f0aab179ddd1ed55447984c7c46930518da5e50591908b137bbb1dc94e470");
  const events = bytes.toString("utf8").trimEnd().split("\n").map(line => JSON.parse(line));
  const event = events[0];
  assert.equal(event.phase, "before");
  assert.equal(event.output.title, "inventory evidence");
  assert.deepEqual(event.output.metadata, { matches: 3, truncated: false });
  assert.deepEqual(events[1].output, event.output); // Original host proof did not reduce.
  const input = observation(event.input.tool, event.output.output, event.output.metadata, event.input.args);
  const original = JSON.stringify(event);
  assert.deepEqual(decodeMatches(replacement(input), true), decodeMatches(input.output, false));
  assert.equal(JSON.stringify(event), original);
});

test("synthetic extension: same-file native LF, empty text and final newline", () => {
  const output = "Found 3 matches\n/workspace/project with spaces/日本語😀/alpha.ts:\n  Line 1: first\n\n  Line 2: \n\n\n/workspace/project with spaces/日本語😀/beta.ts:\n  Line 9: last\n";
  assert.deepEqual(decodeMatches(replacement(grep(output)), true), decodeMatches(output, false));
  for (const bad of [output.replace("\n\n  Line 2", "\n\nunknown\n  Line 2"), output + "unknown\n", output + "(Results truncated. Consider using a more specific path or pattern.)\n"]) refuse(grep(bad));
  for (const matches of [2, 4, undefined]) refuse({ ...grep(output), metadata: { truncated: false, matches } });
});

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
  for (const output of [fixture.grep!.replace("Found 3", "Found 4"), fixture.grep!.replace(" matches", " matches (more matches available)"), fixture.grep!.replace("Line 12", "Line 0"), fixture.grep!.replace("  Line 13: ", "unknown"), fixture.grep!.replace("\n\n/workspace", "\n/workspace")]) refuse(grep(output));
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
