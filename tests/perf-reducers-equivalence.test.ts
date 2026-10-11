import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { tokenizeAutomaticCommand } from "../src/core/automatic-command.js";
import { tokenizeCommand } from "../src/core/command.js";
import { parseJson, scalar, type JsonNode } from "../src/core/structured-json.js";
import { renderReduction } from "../src/core/structured-render.js";
import { filterAutomatic } from "../src/core/automatic.js";
import { automaticReducers } from "../src/core/automatic-registry.js";
import type { AutomaticEntry, AutomaticObservation, AutomaticReducer } from "../src/core/automatic-types.js";
import type { Piece, Reduction, Span } from "../src/core/types.js";
import * as nextJson from "../src/profiles/auto-json.js";
import * as nextCdp from "../src/profiles/auto-cdp.js";
import * as nextCli from "../src/profiles/auto-cli.js";

/*
 * Differential oracle for the performance rewrite of auto-json/auto-cdp/auto-cli (ps).
 * REFERENCE: the three reducers below are copied verbatim from git 716578a (blob ids in each header);
 * modification record: their import lines were replaced by the imports above and the `export` keywords
 * were dropped so they can share this module with the new implementations. Same license (MIT, this repo).
 * Observable result = undefined or the rendered bytes (and the end-to-end filterAutomatic result); the new
 * required evidence must also cover every byte the reference declared.
 */
// ---- src/profiles/auto-json.ts @ 716578a (blob ddbf361d6aa52e8f53aaea649f697733c4ecd327) ----

/** Full lexical evidence, including keys and meaningful empty-container delimiters. */
function lexicalJson(node: JsonNode, pieces: Piece[], required: Span[]): void {
  if (node.kind === "scalar") { pieces.push(node.span); required.push(node.span); return; }
  if ((node.kind === "array" ? node.items : node.entries).length === 0) {
    const [start, end] = node.span;
    const delimiters: Span[] = [[start, start + 1], [end - 1, end]];
    pieces.push(...delimiters); required.push(...delimiters); return;
  }
  pieces.push({ text: node.kind === "array" ? "[" : "{" });
  if (node.kind === "array") node.items.forEach((item, i) => {
    if (i) pieces.push({ text: "," }); lexicalJson(item, pieces, required);
  });
  else node.entries.forEach((entry, i) => {
    if (i) pieces.push({ text: "," });
    lexicalJson(entry.key, pieces, required); pieces.push({ text: ":" }); lexicalJson(entry.value, pieces, required);
  });
  pieces.push({ text: node.kind === "array" ? "]" : "}" });
}

function jsonField(node: JsonNode, name: string): JsonNode | undefined {
  return node.kind === "object" ? node.entries.find(entry => entry.name === name)?.value : undefined;
}
function protocolError(node: JsonNode): boolean {
  const error = jsonField(node, "error");
  return error?.kind === "object" && typeof scalar(jsonField(error, "code")) === "number"
    && typeof scalar(jsonField(error, "message")) === "string"
    && (scalar(jsonField(node, "jsonrpc")) === "2.0"
      || (typeof scalar(jsonField(node, "id")) === "number" && !jsonField(node, "result")));
}
function jsonCarrier(observation: AutomaticObservation): boolean {
  if (observation.status !== "success" || observation.completeness !== "complete") return false;
  if (observation.source === "mcp") return true;
  if (observation.tool !== "bash" || observation.metadata.exit !== 0 || observation.metadata.truncated !== false
    || typeof observation.args.command !== "string") return false;
  const argv = tokenizeAutomaticCommand(observation.args.command);
  if (!argv) return false;
  const [executable, ...args] = argv, name = executable!.split(/[\\/]/).at(-1)!.replace(/\.exe$/i, "").toLowerCase();
  const pair = (flags: string[], value: string) => args.some((arg, i) => flags.includes(arg) && args[i + 1] === value);
  switch (name) {
    // User scripts only: package CLIs under node_modules (test runners, bundlers) keep their own exact families.
    case "node": return args.length > 0 && !args.some(arg => arg === "--test" || arg.startsWith("--test=") || arg.split(/[\\/]/).includes("node_modules"));
    case "python": case "python3": return args.length > 0 && !pair(["-m"], "pytest");
    case "jq": case "curl": return true;
    case "system_profiler": return args.includes("-json");
    case "npm": return ["ls", "list"].includes(args[0] ?? "") && args.includes("--json");
    case "docker": return pair(["--format"], "json") || pair(["--format"], "{{json .}}");
    case "kubectl": return pair(["-o", "--output"], "json");
    case "gh": return args[0] === "api";
    case "powershell": case "pwsh": return args.some(arg => /(?:^|\s)ConvertTo-Json(?:\s|$)/i.test(arg));
    default: return false;
  }
}

/** Exact native wrappers only. Payload spans are virtual UTF-16 offsets into the response. */
function nativeJsonSection(observation: AutomaticObservation): { output: string; start: number; end: number } | undefined {
  const { output, tool, source } = observation;
  if (Buffer.byteLength(output, "utf8") > 16 * 1024 * 1024) return;
  const named = (name: string) => tool === name || tool.endsWith(`_${name}`);
  let start = 0, end = output.length;
  if (source === "mcp" && (named("browser_evaluate") || named("browser_run_code_unsafe")) && output.startsWith("### Result\n")) {
    start = "### Result\n".length; end = output.indexOf("\n### Ran Playwright code\n", start);
    if (end < start || output.length - end > 65536) return;
  } else if (source === "mcp" && named("evaluate_script") && output.startsWith("Script ran on page and returned:\n```json\n")) {
    start = "Script ran on page and returned:\n```json\n".length;
    const closing = output.endsWith("\n```\n") ? 5 : output.endsWith("\n```") ? 4 : 0;
    if (!closing) return;
    end -= closing;
  }
  if (start && !parseJson(output.slice(start, end))) return;
  return { output: output.slice(start, end), start, end };
}
function nativeJsonReduction(observation: AutomaticObservation, section: { start: number; end: number }, reduction: Reduction): Reduction {
  const shift = ([start, end]: Span): Span => [start + section.start, end + section.start];
  const pieces: Piece[] = reduction.pieces.map(piece => Array.isArray(piece) ? shift(piece as Span) : piece);
  const required = reduction.required.map(shift);
  if (section.start) { const prefix: Span = [0, section.start]; pieces.unshift(prefix); required.push(prefix); }
  if (section.end < observation.output.length) {
    const suffix: Span = [section.end, observation.output.length]; pieces.push(suffix); required.push(suffix);
  }
  return { pieces, required };
}

/** JSON and NDJSON share one global syntax-node budget, never one budget per record. */
const reduceAutomaticJson: AutomaticReducer = observation => {
  if (!jsonCarrier(observation) || Buffer.byteLength(observation.output, "utf8") > 16 * 1024 * 1024) return;
  const section = nativeJsonSection(observation);
  if (!section) return;
  const { output } = section, pieces: Piece[] = [], required: Span[] = [];
  let budget = 25000;
  const spend = (node: JsonNode): boolean => {
    if (--budget < 0) return false;
    return node.kind === "scalar" || (node.kind === "array" ? node.items.every(spend)
      : node.entries.every(entry => spend(entry.key) && spend(entry.value)));
  };
  const whole = parseJson(output);
  if (whole) {
    if (protocolError(whole) || !spend(whole)) return;
    lexicalJson(whole, pieces, required);
  } else {
    let offset = 0, records = 0;
    for (const line of output.split("\n")) {
      if (offset === output.length && line === "") break;
      if (++records > 25000) return;
      const node = parseJson(line);
      if (!node || protocolError(node) || !spend(node)) return;
      const localPieces: Piece[] = [], localRequired: Span[] = [];
      lexicalJson(node, localPieces, localRequired);
      if (pieces.length) pieces.push({ text: "\n" });
      pieces.push(...localPieces.map(piece => Array.isArray(piece) ? [piece[0] + offset, piece[1] + offset] as Span : piece));
      required.push(...localRequired.map(([start, end]) => [start + offset, end + offset] as Span));
      offset += line.length + 1;
    }
    if (output.endsWith("\n")) pieces.push({ text: "\n" });
  }
  return required.length ? nativeJsonReduction(observation, section, { pieces, required }) : undefined;
};
// ---- src/profiles/auto-cdp.ts @ 716578a (blob c4b3623def97c09fb9c35309e79c42f5270c709c) ----

/** Native AX nodes only; sparse cells preserve absence separately from null/empty values. */
const reduceAutomaticCdp: AutomaticReducer = observation => {
  if (!jsonCarrier(observation) || Buffer.byteLength(observation.output, "utf8") > 16 * 1024 * 1024) return;
  const section = nativeJsonSection(observation);
  if (!section) return;
  const root = parseJson(section.output);
  if (!root || protocolError(root)) return;
  const result = jsonField(root, "result");
  const accessibility = jsonField(root, "accessibility");
  const nodes = jsonField(root, "nodes") ?? (jsonField(root, "id") ? result && jsonField(result, "nodes") : undefined)
    ?? (accessibility && jsonField(accessibility, "nodes"));
  const ids = new Set<string>();
  if (nodes?.kind !== "array" || nodes.items.length === 0 || !nodes.items.every(node => node.kind === "object"
    && (() => {
      const id = scalar(jsonField(node, "nodeId"));
      if (typeof id !== "string" || !id.length || ids.has(id) || typeof scalar(jsonField(node, "ignored")) !== "boolean") return false;
      ids.add(id); return true;
    })())) return;
  const keys = new Map<string, JsonNode>(), edges = new Map<string, Set<string>>(), incoming = new Map<string, number>();
  for (const node of nodes.items) {
    if (node.kind !== "object") return;
    let previous: string | undefined;
    for (const entry of node.entries) {
      // Sparse rows must reconstruct each node's original field order and key lexemes.
      const key = keys.get(entry.name);
      if (key && section.output.slice(...key.span) !== section.output.slice(...entry.key.span)) return;
      if (!key) { keys.set(entry.name, entry.key); edges.set(entry.name, new Set()); incoming.set(entry.name, 0); }
      if (previous !== undefined && !edges.get(previous)!.has(entry.name)) {
        edges.get(previous)!.add(entry.name); incoming.set(entry.name, incoming.get(entry.name)! + 1);
      }
      previous = entry.name;
    }
  }
  const ready = [...keys.keys()].filter(name => incoming.get(name) === 0), columns: { name: string; key: JsonNode }[] = [];
  for (let i = 0; i < ready.length; i++) {
    const name = ready[i]!; columns.push({ name, key: keys.get(name)! });
    for (const next of edges.get(name)!) {
      incoming.set(next, incoming.get(next)! - 1);
      if (incoming.get(next) === 0) ready.push(next);
    }
  }
  if (columns.length !== keys.size) return;
  // Bound sparse expansion as well as parser work.
  if (columns.length * nodes.items.length > 25000) return;
  const rows = nodes.items;
  const pieces: Piece[] = [], required: Span[] = [];
  function emit(node: JsonNode): void {
    if (node === nodes) {
      pieces.push({ text: "{" }, { text: '"columns":' }, { text: "[" });
      columns.forEach((column, i) => { if (i) pieces.push({ text: "," }); lexicalJson(column.key, pieces, required); });
      pieces.push({ text: "]" }, { text: "," }, { text: '"rows":' }, { text: "[" });
      rows.forEach((row, i) => {
        const values = new Map(row.kind === "object" ? row.entries.map(entry => [entry.name, entry.value]) : []);
        if (i) pieces.push({ text: "," }); pieces.push({ text: "[" });
        columns.forEach((column, j) => {
          if (j) pieces.push({ text: "," }); pieces.push({ text: "[" });
          const value = values.get(column.name);
          if (value) lexicalJson(value, pieces, required);
          pieces.push({ text: "]" });
        });
        pieces.push({ text: "]" });
      });
      pieces.push({ text: "]" }, { text: "," }, { text: '"cellEncoding":"optional"' }, { text: "}" });
    } else if (node.kind === "object") {
      if (!node.entries.length) { lexicalJson(node, pieces, required); return; }
      pieces.push({ text: "{" });
      node.entries.forEach((entry, i) => {
        if (i) pieces.push({ text: "," }); lexicalJson(entry.key, pieces, required); pieces.push({ text: ":" }); emit(entry.value);
      });
      pieces.push({ text: "}" });
    } else lexicalJson(node, pieces, required);
  }
  emit(root);
  return nativeJsonReduction(observation, section, { pieces, required });
};
// ---- src/profiles/auto-cli.ts @ 716578a (blob 02b654b421d63520044bd51a8f88ba4c8d104edc) ----

// Narrow fixed-width Darwin/procps layouts. Never split the command/name tail.
function processes(output: string): Reduction | undefined {
  const lines = output.slice(0, -1).split("\n"), header = lines.shift()!;
  if (!["  PID  PPID STAT COMM", "    PID    PPID STAT COMMAND"].includes(header) || !lines.length) return;
  const second = header.indexOf("PPID") + 4, first = header.indexOf("PID") + 3;
  const state = second + 1, command = header.indexOf("COMM");
  // Fixed widths already cap Darwin at 5 and procps at 7 digits (inside int32 pid_t). Bound to the
  // kernel ranges: xnu PID_MAX 99999; Linux pid < pid_max <= PID_MAX_LIMIT 4*1024*1024 (threads.h).
  const pidMax = header.startsWith("    PID") ? "4194303" : "99999";
  const pieces: Piece[] = [], required: Span[] = [], ids = new Set<string>();
  function cells(spans: Span[]) {
    spans.forEach((span, i) => { if (i) pieces.push({ text: "\t" }); pieces.push(span); required.push(span); });
    pieces.push({ text: "\n" });
  }
  cells([[header.indexOf("PID"), first], [header.indexOf("PPID"), second], [state, state + 4], [command, header.length]]);
  let offset = header.length + 1;
  for (const line of lines) {
    if (line[first] !== " " || line[second] !== " " || line[command - 1] !== " ") return;
    const pid = line.slice(0, first), ppid = line.slice(first + 1, second), stat = line.slice(state, command - 1);
    if (!/^ *[1-9]\d*$/.test(pid) || !/^ *(?:0|[1-9]\d*)$/.test(ppid) ||
        !within(pid.trim(), pidMax) || !within(ppid.trim(), pidMax) ||
        !/^[IDRSTtUVWZX][<NLPsl+EXW-]* *$/.test(stat) || !line.slice(command).trim() || ids.has(pid.trim())) return;
    ids.add(pid.trim());
    cells([[offset + pid.search(/\d/), offset + first], [offset + first + 1 + ppid.search(/\d/), offset + second],
      [offset + state, offset + state + stat.trimEnd().length], [offset + command, offset + line.length]]);
    offset += line.length + 1;
  }
  return { pieces, required };
}

// Producer-native bounds, checked lexically BEFORE any Number/BigInt conversion. printf-family
// decimal output never has leading zeros, so a canonical digit string compares by length then text.
const INT64_MAX = "9223372036854775807", UINT64_MAX = "18446744073709551615";
// ffmpeg out_time hours = |pts| / AV_TIME_BASE / 3600 with int64 pts: floor(INT64_MAX / 1e6 / 3600).
const CLOCK_HOURS_MAX = "2562047788";
function within(value: string, max: string): boolean {
  return /^(?:0|[1-9]\d*)$/.test(value) && (value.length < max.length || (value.length === max.length && value <= max));
}

function listing(output: string): Reduction | undefined {
  const pieces: Piece[] = [], required: Span[] = [];
  let offset = 0, rows = 0;
  for (const line of output.slice(0, -1).split("\n")) {
    // Apple ls prints total with %llu, GNU ls as uintmax_t: unsigned 64-bit.
    if (offset === 0 && /^total \d+$/.test(line) && within(line.slice(6), UINT64_MAX)) {
      const span: Span = [0, line.length]; pieces.push(span, { text: "\n" }); required.push(span);
    } else {
      // English C locale ordinary file/directory/link, ACL/xattr marker, all nine cells.
      const match = /^([-dl][r-][w-][xSs-][r-][w-][xSs-][r-][w-][xTt-][@+.]?) +(\d+) +(\S+) +(\S+) +(\d+) +(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) +(\d{1,2}) +(\d{2}:\d{2}|\d{4}) (.+)$/.exec(line);
      // nlink: Darwin nlink_t uint16 (%ju), Linux nlink_t up to uint64 (uintmax_t); size: off_t int64.
      if (!match || !within(match[2]!, UINT64_MAX) || !within(match[5]!, INT64_MAX) ||
          Number(match[2]) < 1 || Number(match[7]) < 1 || Number(match[7]) > 31 ||
          (match[8]!.includes(":") && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(match[8]!)) ||
          (match[1]![0] === "l" && !/^.+ -> .+$/.test(match[9]!))) return;
      let cursor = 0;
      for (let i = 1; i <= 9; i++) {
        const value = match[i]!, start = line.indexOf(value, cursor), span: Span = [offset + start, offset + start + value.length];
        if (i > 1) pieces.push({ text: "\t" });
        pieces.push(span); required.push(span); cursor = start + value.length;
      }
      pieces.push({ text: "\n" }); rows++;
    }
    offset += line.length + 1;
  }
  return rows ? { pieces, required } : undefined;
}

function ffmpegArgv(args: readonly string[]): boolean {
  const seen = new Set<string>(); let input = false, destination = false;
  for (let i = 1; i < args.length; i++) {
    const arg = args[i]!;
    if (!arg.startsWith("-") || arg === "-") {
      if (!input || destination || i !== args.length - 1) return false;
      destination = true; continue;
    }
    const key = arg === "-v" ? "-loglevel" : arg, identity = key === "-f" ? `${key}:${input}` : key;
    if (["-hide_banner", "-nostats", "-re", "-an", "-vn", "-y", "-n"].includes(key)) {
      if (seen.has(key)) return false; seen.add(key); continue;
    }
    if (!["-loglevel", "-progress", "-f", "-i", "-t", "-c:v", "-c:a", "-threads"].includes(key)) return false;
    if (seen.has(identity)) return false;
    const value = args[++i];
    if (!value || value.startsWith("-") || (key === "-loglevel" && value !== "error") || (key === "-progress" && value !== "pipe:1")) return false;
    if (key === "-i") input = true;
    seen.add(identity);
  }
  return input && destination && !(seen.has("-y") && seen.has("-n")) &&
    ["-hide_banner", "-loglevel", "-nostats", "-progress"].every(key => seen.has(key));
}

function progress(output: string): Reduction | undefined {
  const video = output.startsWith("frame="), prefix = video ? ["frame", "fps", "stream_0_0_q"] : [];
  const keys = [...prefix, "bitrate", "total_size", "out_time_us", "out_time_ms", "out_time", "dup_frames", "drop_frames", "speed", "progress"];
  const lines = output.slice(0, -1).split("\n");
  if (lines.length % keys.length) return;
  let previous: bigint[] | undefined, sizeKind: boolean | undefined, offset = 0, finalStart = 0;
  const decimal = /^\d+(?:\.\d+)?$/;
  for (let start = 0; start < lines.length; start += keys.length) {
    const values: string[] = []; finalStart = offset;
    for (const [i, key] of keys.entries()) {
      const line = lines[start + i]!;
      if (!line.startsWith(`${key}=`)) return;
      values.push(line.slice(key.length + 1)); offset += line.length + 1;
    }
    const [frame, fps, quality, bitrate, size, us, ms, time, dup, drop, speed, status] = (video ? values : ["0", "0", "0", ...values]) as [string, string, string, string, string, string, string, string, string, string, string, string];
    const clock = /^(\d{2,}):([0-5]\d):([0-5]\d)\.(\d{6})$/.exec(time);
    // ffmpeg print_report writes frame/total_size/out_time_us/out_time_ms/dup_frames/drop_frames
    // with %PRId64, so admitted values are non-negative signed 64-bit; out_time hours use %02PRId64.
    if (![frame, us, ms, dup, drop].every(v => within(v, INT64_MAX)) || !decimal.test(fps) ||
        !clock || !(clock[1]!.length === 2 || within(clock[1]!, CLOCK_HOURS_MAX)) ||
        !/^-?\d+(?:\.\d+)?$/.test(quality) || !/^(?:N\/A|\s*\d+(?:\.\d+)?kbits\/s)$/.test(bitrate) ||
        !(size === "N/A" || within(size, INT64_MAX)) || !/^(?:N\/A| *\d+(?:\.\d+)?(?:e[+-]?\d+)?x)$/.test(speed) ||
        status !== (start + keys.length === lines.length ? "end" : "continue")) return;
    const micros = ((BigInt(clock[1]!) * 60n + BigInt(clock[2]!)) * 60n + BigInt(clock[3]!)) * 1000000n + BigInt(clock[4]!);
    if (BigInt(us) !== BigInt(ms) || BigInt(us) !== micros || (sizeKind !== undefined && sizeKind !== (size === "N/A"))) return;
    sizeKind = size === "N/A";
    const counters = [frame, us, dup, drop, size === "N/A" ? "0" : size].map(v => BigInt(v));
    if (previous && counters.some((value, i) => value < previous![i]!)) return;
    previous = counters;
  }
  const span: Span = [finalStart, output.length];
  return { pieces: [span], required: [span] };
}

/** Pure native CLI leaf. Host facts are genuine; no shell execution or CR normalization. */
const reduceAutomaticCli: AutomaticReducer = observation => {
  const { source, tool, status, completeness, args, metadata, output } = observation;
  if (source !== "native" || tool !== "bash" || status !== "success" || completeness !== "complete" ||
      metadata.exit !== 0 || metadata.truncated !== false || typeof args.command !== "string" ||
      !output.endsWith("\n") || /[\r\t\x00-\x08\x0b-\x1f\x7f]/.test(output)) return;
  const argv = tokenizeCommand(args.command);
  if (!argv) return;
  const executable = argv[0]!.split("/").pop();
  if (executable === "ps" && argv.length === 3 && ["-axo", "-eo"].includes(argv[1]!) && argv[2] === "pid,ppid,stat,comm") return processes(output);
  if (executable === "ls" && ["-l", "-la", "-al"].includes(argv[1]!)) {
    const tail = argv.slice(2), separated = tail[0] === "--";
    if (separated) tail.shift();
    if (tail.length <= 1 && (!tail.length || separated || !tail[0]!.startsWith("-"))) return listing(output);
  }
  if (executable === "ffmpeg" && ffmpegArgv(argv)) return progress(output);
  return;
};

// ---- differential harness ----
type Obs = AutomaticObservation;
const success = { status: "success", completeness: "complete" } as const;
const mcp = (output: string, tool = "unknown_inventory"): Obs => ({ source: "mcp", tool, output, args: {}, metadata: {}, ...success });
const bash = (command: string, output: string, metadata: Record<string, unknown> = { exit: 0, truncated: false }): Obs =>
  ({ source: "native", tool: "bash", output, args: { command }, metadata, ...success });
const pairs: [string, AutomaticReducer, AutomaticReducer][] = [
  ["auto-cli", reduceAutomaticCli, nextCli.reduceAutomaticCli], ["auto-cdp", reduceAutomaticCdp, nextCdp.reduceAutomaticCdp],
  ["auto-json", reduceAutomaticJson, nextJson.reduceAutomaticJson]];
const references = new Map<string, AutomaticReducer>(pairs.map(([id, reference]) => [id, reference]));
const referenceRegistry: AutomaticEntry[] = automaticReducers.map(entry => ({ id: entry.id, reduce: references.get(entry.id) ?? entry.reduce }));
assert.equal(referenceRegistry.filter(entry => references.has(entry.id)).length, 3);

function outcome(reduction: Reduction | undefined, output: string): string {
  if (reduction === undefined) return "undefined";
  try { return `render:${renderReduction(output, reduction)}`; } catch { return "invalid"; }
}
/** Every byte the reference declared required is still required by the new reduction. */
function covers(next: readonly Span[], reference: readonly Span[]): boolean {
  const merged: [number, number][] = [];
  for (const [start, end] of [...next].sort((a, b) => a[0] - b[0])) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end); else merged.push([start, end]);
  }
  return reference.every(([start, end]) => {
    let low = 0, high = merged.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1, span = merged[mid]!;
      if (span[1] < end) low = mid + 1; else if (span[0] > start) high = mid - 1; else return true;
    }
    return false;
  });
}
const stats = { cases: 0, admitted: new Map<string, number>() };
function check(observation: Obs, label: string): void {
  stats.cases++;
  // One frozen object per side, reducers in registry order, as filterAutomatic shares it (exercises the parse memo).
  const left = Object.freeze({ ...observation }), right = Object.freeze({ ...observation });
  for (const [id, reference, next] of pairs) {
    const expected = reference(left), actual = next(right);
    const a = outcome(expected, observation.output), b = outcome(actual, observation.output);
    if (a !== b) assert.fail(`${label} ${id}: reference ${a.slice(0, 160)} != new ${b.slice(0, 160)}`);
    if (expected && actual) {
      assert.ok(covers(actual.required, expected.required), `${label} ${id}: required evidence weakened`);
      stats.admitted.set(id, (stats.admitted.get(id) ?? 0) + 1);
    }
  }
  const reference = filterAutomatic(observation, { reducers: referenceRegistry }), current = filterAutomatic(observation);
  if (JSON.stringify(reference) !== JSON.stringify(current)) assert.fail(`${label}: filterAutomatic ${JSON.stringify(reference).slice(0, 200)} != ${JSON.stringify(current).slice(0, 200)}`);
}

// ---- seeded generators ----
function rng(seed: number) {
  let state = seed >>> 0;
  const next = () => { state = (state + 0x6d2b79f5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const int = (n: number) => Math.floor(next() * n), pick = <T>(list: readonly T[]): T => list[int(list.length)]!;
  return { next, int, pick, chance: (p: number) => next() < p };
}
type R = ReturnType<typeof rng>;
const NUMBERS = ["0", "-0", "1", "42", "1e+03", "1E3", "9007199254740993", "1.50", "-12.5e-3", "3.0"];
const STRINGS = ['"a"', '""', '"😀 opaque"', '"\\u0061"', '"line\\nbreak"', '"with space"', '"\\"q\\""', '"日本"', '"\\ud83d\\ude00"', '"error"'];
const KEYS = ['"id"', '"data"', '"error"', '"result"', '"jsonrpc"', '"code"', '"message"', '"\\u006b"', '"k"', '"nodes"', '"value"', '"a b"'];
const SPACES = ["", "", "", " ", "\n", "  ", "\t", "\r\n", "\n    "];
/** Random JSON lexemes with per-boundary whitespace drawn from a style (compact, pretty-ish or mixed). */
function randomJson(r: R, depth: number, ws: () => string): string {
  const roll = r.int(depth > 3 ? 4 : 9);
  if (roll < 2) return r.pick(NUMBERS);
  if (roll < 3) return r.pick(STRINGS);
  if (roll < 4) return r.pick(["true", "false", "null"]);
  const count = r.int(5), parts: string[] = [];
  if (roll < 6) {
    for (let i = 0; i < count; i++) parts.push(ws() + randomJson(r, depth + 1, ws) + ws());
    return `[${parts.join(",") || ws()}]`;
  }
  const keys = new Set<string>();
  for (let i = 0; i < count; i++) {
    const key = r.pick(KEYS);
    if (keys.has(key) && !r.chance(0.05)) continue; // occasional duplicate key
    keys.add(key);
    parts.push(`${ws()}${key}${ws()}:${ws()}${randomJson(r, depth + 1, ws)}${ws()}`);
  }
  return `{${parts.join(",") || ws()}}`;
}
function style(r: R): () => string {
  const kind = r.int(3);
  return kind === 0 ? () => "" : kind === 1 ? () => (r.chance(0.7) ? " " : "\n  ") : () => r.pick(SPACES);
}
function mutate(r: R, text: string): string {
  const at = r.int(text.length + 1);
  switch (r.int(8)) {
    case 0: return text.slice(0, at) + r.pick([" ", "\n", "\t", "\r"]) + text.slice(at);
    case 1: return text.slice(0, at) + text.slice(at + 1);
    case 2: return text.slice(0, at);
    case 3: return text.replace(/\d/, r.pick(["0", "01", "x", "9"]));
    case 4: return text.replace(/"[a-z]/, match => `"\\u00${match.charCodeAt(1).toString(16)}`);
    case 5: return `{"jsonrpc":"2.0","error":{"code":${r.pick(["1", "-32600", '"1"'])},"message":${r.pick(['"bad"', "1"])}},"data":${text}}`;
    case 6: return `{"id":${r.pick(["1", '"1"'])},"error":{"code":-1,"message":"bad"}${r.chance(0.5) ? `,"result":${text}` : ""}}`;
    default: return text;
  }
}
const JSON_COMMANDS = ["node script.js", "python3 script.py", "jq . file.json", "curl -fsS http://127.0.0.1/x", "system_profiler -json",
  "npm ls --json", "docker ps --format json", 'docker ps --format "{{json .}}"', "kubectl get pods -o json", "gh api user",
  "pwsh -Command ConvertTo-Json", "'C:\\tools\\node.exe' script.js", "node --test script.js", "python -m pytest", "npm ls",
  "node node_modules/vitest/vitest.mjs run", "curl localhost | jq .", "git status", "unknown --json", "node --test=x a.js", "node"];
function carrier(r: R, payload: string): Obs {
  switch (r.int(7)) {
    case 0: return mcp(`### Result\n${payload}\n### Ran Playwright code\n\`\`\`js\nreturn x;\n\`\`\``, r.pick(["browser_evaluate", "pw_browser_run_code_unsafe", "browser_run_code_unsafe", "other"]));
    case 1: return mcp(`Script ran on page and returned:\n\`\`\`json\n${payload}${r.pick(["\n```\n", "\n```", ""])}`, r.pick(["evaluate_script", "x_evaluate_script"]));
    case 2: case 3: return bash(r.pick(JSON_COMMANDS), payload, r.chance(0.9) ? { exit: 0, truncated: false } : r.pick([{}, { exit: 1, truncated: false }, { exit: 0, truncated: true }]));
    default: return mcp(payload);
  }
}

function jsonCases(r: R, count: number): void {
  for (let i = 0; i < count; i++) {
    let payload = randomJson(r, 0, style(r));
    if (r.chance(0.25)) payload = Array.from({ length: 1 + r.int(4) }, () => {
      const record = randomJson(r, 1, style(r)).replace(/\n/g, " ");
      // NDJSON records may themselves be protocol error envelopes (refusal) or near misses (admitted).
      return r.chance(0.15) ? r.pick([`{"jsonrpc":"2.0","error":{"code":1,"message":"x"},"r":${record}}`, `{"id":2,"error":{"code":-1,"message":"x"}}`,
        `{"id":2,"error":{"code":-1,"message":"x"},"result":${record}}`, `{"error":{"code":1,"message":"x"},"r":${record}}`]) : record;
    }).join(r.pick(["\n", "\r\n", "\n\n"])) + r.pick(["", "\n"]);
    if (r.chance(0.3)) payload = mutate(r, payload);
    if (r.chance(0.2)) payload = r.pick(SPACES) + payload + r.pick(SPACES);
    check(carrier(r, payload), `json#${i} ${JSON.stringify(payload).slice(0, 80)}`);
  }
}

/** CDP AX node lists with order/alias/ignored/id/envelope mutations, serialized compact, pretty or mixed. */
function cdpCases(r: R, count: number): void {
  const FIELDS = ["nodeId", "ignored", "ignoredReasons", "role", "name", "properties", "parentId", "childIds", "backendDOMNodeId", "value", "extension"];
  const values: unknown[] = [false, 0, "", null, {}, [], { type: "role", value: "button" }, [{ name: "hidden", value: { type: "boolean", value: false } }], "😀", 9];
  for (let i = 0; i < count; i++) {
    const length = 1 + r.int(6), nodes: Record<string, unknown>[] = [];
    for (let n = 0; n < length; n++) {
      const node: Record<string, unknown> = {};
      for (const field of FIELDS) {
        if (field === "nodeId") node.nodeId = r.chance(0.97) ? String(r.chance(0.95) ? n + 1 : 1) : r.pick(["", 7, undefined]);
        else if (field === "ignored") { if (r.chance(0.97)) node.ignored = r.chance(0.95) ? r.chance(0.5) : r.pick(["false", 0, null]); }
        else if (r.chance(0.5)) node[field] = r.pick(values);
      }
      if (r.chance(0.1)) { const keys = Object.keys(node); const k = keys[r.int(keys.length)]; if (k) { const v = node[k]; delete node[k]; node[k] = v; } }
      nodes.push(node);
    }
    const envelope: unknown = r.pick([() => ({ nodes }), () => ({ id: 4, result: { nodes, extra: [] }, sessionId: "s" }), () => ({ result: { nodes } }),
      () => ({ accessibility: { nodes, tree: "full" }, control: { hasMore: true } }), () => ({ jsonrpc: "2.0", id: 1, result: { nodes } }),
      () => ({ id: 1, error: { code: -1, message: "bad" } }), () => ({ hugr: { nodes } })])();
    const kind = r.int(3), ws = style(r);
    let text = kind === 0 ? JSON.stringify(envelope) : kind === 1 ? JSON.stringify(envelope, null, 2) : serialize(envelope, ws);
    if (r.chance(0.15)) { const key = `"${r.pick(FIELDS)}":`; const at = text.lastIndexOf(key); if (at >= 0) text = `${text.slice(0, at)}"\\u00${key.charCodeAt(1).toString(16)}${key.slice(2)}${text.slice(at + key.length)}`; }
    if (r.chance(0.05)) text = mutate(r, text);
    check(r.chance(0.3) ? mcp(`### Result\n${text}\n### Ran Playwright code\n\`\`\`js\nreturn x;\n\`\`\``, "browser_run_code_unsafe") : r.chance(0.2) ? bash("node ax.js", text) : mcp(text, "cdp"), `cdp#${i}`);
  }
}
function serialize(value: unknown, ws: () => string): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(item => ws() + serialize(item, ws) + ws()).join(",") || ws()}]`;
  return `{${Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => `${ws()}${JSON.stringify(k)}${ws()}:${ws()}${serialize(v, ws)}${ws()}`).join(",") || ws()}}`;
}

/** ps column grammar: widths, PID/PPID bounds and duplicates, STAT alphabet, tails, header and argv variants. */
function psCases(r: R, count: number): void {
  const COMMANDS = ["/sbin/launchd", "/Applications/日本 😀 app/command suffix  ", "systemd", "(gh)", "a", "x y", " lead", "\u00a0nbsp", "\u3000", "\u2028", "  ", ""];
  const STATS = ["Ss", "S+", "R", "Ss+", "I<", "Z", "SNs", "Tl", "UE", "W", "X-", "?", "??", "S s", "s", "Ssss", "Sssss", "", "ÿ", "D<NL"];
  const ARGV = ["ps -axo pid,ppid,stat,comm", "ps -eo pid,ppid,stat,comm", "/bin/ps -axo pid,ppid,stat,comm", "ps aux", "ps -axo pid,ppid,stat,args", "ps -axo pid,ppid,stat,comm extra"];
  for (let i = 0; i < count; i++) {
    const linux = r.chance(0.4), width = linux ? 7 : 5, max = linux ? 4194303 : 99999, used = new Set<number>();
    const header = linux ? "    PID    PPID STAT COMMAND" : "  PID  PPID STAT COMM";
    const rows = [r.chance(0.97) ? header : r.pick([header.replace("COMM", "ARGS"), "  PID  PPID STAT COMMAND", ` ${header}`])];
    for (let n = 0, length = 1 + r.int(8); n < length; n++) {
      let pid = r.chance(0.5) ? 1 + r.int(200) : 1 + r.int(max);
      if (used.has(pid) && r.chance(0.7)) pid = max - n;
      used.add(pid);
      let pidText = String(pid), ppidText = String(r.chance(0.2) ? 0 : 1 + r.int(max));
      if (r.chance(0.05)) pidText = r.pick(["0", "01", String(max + 1), String(max), "1 2", "12a", "4194304", "100000", "00"]);
      if (r.chance(0.05)) ppidText = r.pick(["00", "01", String(max + 1), String(max), "-1", ""]);
      const stat = r.chance(0.85) ? r.pick(STATS.slice(0, 11)) : r.pick(STATS);
      const command = r.chance(0.85) ? r.pick(COMMANDS.slice(0, 6)) : r.pick(COMMANDS);
      let line = `${pidText.padStart(width)} ${ppidText.padStart(width)} ${stat.padEnd(4)} ${command}`;
      if (r.chance(0.03)) line = line.slice(0, r.int(line.length));
      if (r.chance(0.02)) line = ` ${line}`;
      rows.push(line);
    }
    let output = rows.join("\n") + "\n";
    if (r.chance(0.03)) output = r.pick([output.slice(0, -1), `${output}\n`, output.replace("\n", "\r\n"), output.replace(" ", "\t"), `${output}warning\n`]);
    check(bash(r.chance(0.95) ? (linux ? ARGV[1]! : r.pick(ARGV.slice(0, 3))) : r.pick(ARGV), output), `ps#${i} ${JSON.stringify(output).slice(0, 120)}`);
  }
}

// ---- fixed corpora: test inputs, counterexamples and real captures ----
const fixture = (path: string) => readFileSync(new URL(`../fixtures/automatic/${path}`, import.meta.url), "utf8");
function fixedCases(): void {
  for (const input of [' { "\\u006b" : 1e+03, "k2" : -0, "huge" : 9007199254740993, "text" : "😀\\n", "error" : "application", "empty" : { }, "list" : [ ], "null" : null } ',
    '{ "id": 1, "data": {} }\r\n{ "id": 2, "data": [] }\r\n{ "done": true, "cursor": null }\n', '{ "id": 1 }\nnot JSON', '{ "id": 1 }\n\n{ "id": 2 }',
    '{ "a":1,"a":2 }', '{ "a":1, }', '[1,]', '{', '{ "jsonrpc":"2.0", "error":{"code":-1,"message":"bad"} }', '{ "id":1, "error":{"code":-1,"message":"bad"} }',
    `${'[ '.repeat(65)}0${' ]'.repeat(65)}`, `${'[ '.repeat(64)}0${' ]'.repeat(64)}`, '{ "v": 1 }\n'.repeat(9000), '{ "v": 1 }\n'.repeat(8333), ' [ 1 ]\n'.repeat(12500),
    ' [ 1 ]\n'.repeat(12500) + "1\n", " 1\n".repeat(25000), " 1\n".repeat(25001), `[ ${Array(24999).fill("1").join(" , ")} ]`, `[ ${Array(25000).fill("1").join(" , ")} ]`,
    '{ "id":1, "result":{}, "error":{"code":1,"message":"data"} }', '{"a":1}\n{"jsonrpc":"2.0","error":{"code":1,"message":"x"}}\n', '{"a":1}\n{"id":3,"error":{"code":1,"message":"x"}}', ' { } ', ' [ ] ', '{ "nested": [ { }, [ ] ] }', "{}", "[]", '{"a":{}}', "", "\n", " "]) {
    check(mcp(input), "auto-json fixed");
    for (const command of JSON_COMMANDS) check(bash(command, input.length < 4096 ? input : '{ "native": [ 1, 2 ] }'), `auto-json argv ${command}`);
  }
  for (const file of ["playwright", "devtools"]) {
    const capture = JSON.parse(fixture(`browser/native/${file}.json`)), calls = new Map<number, string>();
    for (const { direction, message } of capture.records) {
      if (direction === "send" && message.method === "tools/call") calls.set(message.id, message.params.name);
      if (direction !== "receive" || !calls.has(message.id)) continue;
      for (const block of message.result?.content ?? []) if (block.type === "text") {
        for (const tool of [calls.get(message.id)!, `capture_${calls.get(message.id)}`, "unknown"]) check(mcp(block.text, tool), `${file} ${tool}`);
      }
    }
  }
  for (const state of ["before", "modal"]) { const input = fixture(`browser/native/cdp-${state}.json`); check(mcp(input, "cdp"), state); check(mcp(JSON.stringify(JSON.parse(input)), "cdp"), `${state} compact`); }
  const empties = [false, 0, "", null, {}, []];
  const sparse = (extra: boolean) => ({ nodes: Array.from({ length: 50 }, (_, i) => {
    const node: Record<string, unknown> = { nodeId: String(i + 1), ignored: i % 2 === 1 };
    if (i) node.parentId = String(i);
    node.childIds = i < 49 ? [String(i + 2)] : [];
    for (let j = 0; j < 196; j++) node[`vendorExtensionSharedByEveryAxNode${j}`] = empties[(i + j) % 6];
    for (let j = 0; j < 6; j++) node[`vendorExtensionUniqueToNode${i}_${j}`] = empties[j];
    if (extra && i === 49) node.vendorExtensionBeyondBudget = null;
    return node;
  }) });
  for (const extra of [false, true]) for (const indent of [0, 2]) check(mcp(JSON.stringify(sparse(extra), null, indent), "cdp"), `sparse ${extra} ${indent}`);
  const root = { nodeId: "1", ignored: false, extra: 0, childIds: ["2"], value: "" };
  for (const child of [{ nodeId: "2", ignored: true, parentId: "1", extra: false, childIds: [], value: [] }, { extra: false, nodeId: "2", ignored: true, parentId: "1", childIds: [], value: [] }]) {
    check(mcp(JSON.stringify({ nodes: [root, child] }, null, 2), "cdp"), "order");
  }
  const aliased = JSON.stringify({ nodes: [{ nodeId: "1", ignored: false, x: 0 }, { nodeId: "2", ignored: true, x: null }] }, null, 2);
  check(mcp(aliased.replaceAll('"x":', '"\\u0078":'), "cdp"), "alias all");
  check(mcp(aliased.replace('"x":', '"\\u0078":'), "cdp"), "alias one");
  for (const file of readdirSync(new URL("../fixtures/automatic/cli/", import.meta.url)).filter(name => name.endsWith(".json"))) {
    const receipt = JSON.parse(fixture(`cli/${file}`)), command = receipt.argv.map((arg: string, i: number) => i && arg.includes(" ") ? `'${arg}'` : arg).join(" ");
    check(bash(command, receipt.original), file);
  }
  const ps = "  PID  PPID STAT COMM\n    1     0 Ss   /sbin/launchd\n  123     1 S+   /Applications/日本 😀 app/command suffix  \n";
  for (const output of [ps, ps + "warning\n", ps.replace("Ss  ", "??? "), ps.replace("COMM", "ARGS"), ps.slice(0, -1), ps.replace("\n", "\r\n"),
    ps + "46503 40672 ?    (gh)\n", ps + "38889 38884 ?E   (bun)\n", "    PID    PPID STAT COMMAND\n      1       0 Ss   systemd\n    123       1 Sl   command 日本 suffix  \n",
    "    PID    PPID STAT COMMAND\n4194303 4194303 Ss   systemd\n", "    PID    PPID STAT COMMAND\n4194304       1 Ss   systemd\n", "  PID  PPID STAT COMM\n99999     0 Ss   launchd\n",
    "  PID  PPID STAT COMM\n    1     0 Ss   a\n    1     0 Ss   b\n", "  PID  PPID STAT COMM\n", "  PID  PPID STAT COMM\n\n"]) {
    for (const command of ["ps -axo pid,ppid,stat,comm", "ps -eo pid,ppid,stat,comm", "X=1 ps -axo pid,ppid,stat,comm"]) check(bash(command, output), "ps fixed");
  }
}

test("new reducers equal the 716578a reference over fixtures, counterexamples and seeded mutations", () => {
  fixedCases();
  const r = rng(0x5eed1e55);
  jsonCases(r, 2600); cdpCases(r, 1800); psCases(r, 2400);
  assert.ok(stats.cases >= 5000, `only ${stats.cases} differential cases`);
  // Positive controls: every pair admitted a substantial share, so equality is not refusal-only.
  for (const [id] of pairs) assert.ok((stats.admitted.get(id) ?? 0) >= 200, `${id} admitted only ${stats.admitted.get(id) ?? 0}`);
  console.log(`differential cases: ${stats.cases}; admitted: ${JSON.stringify(Object.fromEntries(stats.admitted))}`);
});

test("parse memo revalidates a reused, mutated observation object", () => {
  const observation = { ...mcp('{ "nodes": [ { "nodeId": "1", "ignored": false } ] }', "cdp") };
  for (const output of ['{ "x" : 1 }', '{ "y" : [ 1 , 2 ] }', '### Result\n{ "z" : 1 }\n### Ran Playwright code\n']) {
    for (const tool of ["cdp", "browser_evaluate"]) {
      observation.output = output; (observation as { tool: string }).tool = tool;
      for (const [id, reference, next] of pairs) assert.equal(outcome(next(observation), output), outcome(reference({ ...observation }), output), `${id} ${tool} ${output}`);
    }
  }
});

// ---- round 3: review follow-ups and new fast paths ----
const reduceTo = (reducer: AutomaticReducer, observation: Obs): string => outcome(reducer(Object.freeze({ ...observation })), observation.output);

test("ps STAT keeps W as a modifier, not only as a leading state", () => {
  const header = "  PID  PPID STAT COMM\n";
  for (const stat of ["SW  ", "S<W ", "IW  ", "R+W ", "WW  ", "SNW ", "W<  ", "SWs "]) {
    const output = `${header}    1     0 ${stat} launchd\n  123     1 Ss   /usr/bin/thing\n`;
    check(bash("ps -axo pid,ppid,stat,comm", output), `ps W modifier ${stat}`);
    assert.match(reduceTo(nextCli.reduceAutomaticCli, bash("ps -axo pid,ppid,stat,comm", output)), /^render:/, `STAT ${stat} admitted`);
  }
});

test("CDP sparse-cell bound: exactly 25,000 cells admit and 25,001 refuse", () => {
  // Few keys per node keep parser nodes far below 25,000; the column union sets the cell count.
  const cdp = (columns: number, nodes: number) => JSON.stringify({ nodes: Array.from({ length: nodes }, (_, i) => {
    const node: Record<string, unknown> = { nodeId: String(i + 1), ignored: false };
    node[`k${i % (columns - 2)}`] = i % 3 ? null : "";
    return node;
  }) });
  for (const [columns, nodes, admitted] of [[25, 1000, true], [23, 1087, false], [20, 1250, true], [20, 1251, false]] as const) {
    const input = mcp(cdp(columns, nodes), "cdp");
    check(input, `cdp cells ${columns}x${nodes}`);
    assert.equal(reduceTo(nextCdp.reduceAutomaticCdp, input).startsWith("render:"), admitted, `${columns} columns x ${nodes} nodes`);
  }
});

test("CDP key lexemes: equal length but different spelling (hex case) refuses like the original", () => {
  for (const [first, second] of [['"\\u004a"', '"\\u004A"'], ['"\\u004a"', '"\\u004a"'], ['"J"', '"J"'], ['"\\u0041b"', '"A\\u0062"']]) {
    const text = `{"nodes":[{"nodeId":"1","ignored":false,${first}:1},{"nodeId":"2","ignored":true,${second}:2}]}`;
    check(mcp(text, "cdp"), `cdp lexeme ${first} ${second}`);
  }
});

test("auto-json returns fresh span arrays, so mutating a reduction never reaches the memoized parse", () => {
  for (const output of ['[1, "abc", 22]', '{ "a" : "abc" , "b" : [ 1 ] }', '[1, "abc", 22]\n[3]\n']) {
    const observation = Object.freeze(mcp(output));
    const first = nextJson.reduceAutomaticJson(observation)!, expected = renderReduction(output, first);
    for (const span of first.required) { (span as unknown as number[])[0] = 1; (span as unknown as number[])[1] = 2; }
    for (const piece of first.pieces) if (Array.isArray(piece)) { (piece as unknown as number[])[0] = 1; (piece as unknown as number[])[1] = 2; }
    const again = nextJson.reduceAutomaticJson(observation)!;
    assert.equal(renderReduction(output, again), expected, `${output}: reduction changed after mutating an earlier result`);
    const cdpObservation = Object.freeze(mcp('{"nodes":[{"nodeId":"1","ignored":false,"v":"abc"}, {"nodeId":"2","ignored":true}]}', "cdp"));
    const cdpFirst = nextCdp.reduceAutomaticCdp(cdpObservation)!, cdpExpected = renderReduction(cdpObservation.output, cdpFirst);
    for (const span of cdpFirst.required) { (span as unknown as number[])[0] = 1; (span as unknown as number[])[1] = 2; }
    assert.equal(renderReduction(cdpObservation.output, nextCdp.reduceAutomaticCdp(cdpObservation)!), cdpExpected, "cdp reduction changed");
  }
});

test("shared formatting pieces are frozen: mutation throws and later reductions are unchanged", () => {
  // Deliberate: one shared piece per token kind, so a mutable piece would leak into every later reduction.
  const output = '[ 1 , 2 ]', observation = Object.freeze(mcp(output)), expected = renderReduction(output, nextJson.reduceAutomaticJson(observation)!);
  for (const piece of Object.values(nextJson.JSON_TEXT)) {
    assert.ok(Object.isFrozen(piece), `${JSON.stringify(piece)} is frozen`);
    assert.throws(() => { (piece as { text: string }).text = "FAKE"; }, TypeError);
  }
  const reduction = nextJson.reduceAutomaticJson(observation)!;
  for (const piece of reduction.pieces) if (!Array.isArray(piece)) assert.throws(() => { (piece as { text: string }).text = "FAKE"; }, TypeError);
  assert.equal(renderReduction(output, nextJson.reduceAutomaticJson(observation)!), expected);
});

test("auto-json declares exactly its emitted spans as evidence (a collapsed subtree leaves no stale leaf spans)", () => {
  for (const output of ['{"a": [1,2,{"b":3}], "c" : 1}', '[ {"x":[1,[2,[3]]]} , "s" , [] , [ ] , { } ]', '{"k":1}\n{ "k" : [1,2] }\n', '[[1,2],[3, 4],{"a":{"b":{}}}]']) {
    const reduction = nextJson.reduceAutomaticJson(Object.freeze(mcp(output)))!;
    const spans = reduction.pieces.filter(piece => Array.isArray(piece));
    assert.deepEqual(reduction.required, spans, `${output}: required differs from emitted spans`);
    check(mcp(output), `exact evidence ${output}`);
  }
});
