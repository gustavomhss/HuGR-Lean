import { tokenizeCommand } from "../core/command.js";
import type { AutomaticReducer } from "../core/automatic-types.js";
import type { Piece, Reduction, Span } from "../core/types.js";

// Narrow fixed-width Darwin/procps layouts. Never split the command/name tail.
// STAT grammar ^[IDRSTtUVWZX][<NLPsl+EXW-]* *$ as an ASCII table: bit 1 leading state, bit 2 modifier.
const STAT = new Uint8Array(128);
for (const char of "IDRSTtUVWZX") STAT[char.charCodeAt(0)]! |= 1;
for (const char of "<NLPsl+EXW-") STAT[char.charCodeAt(0)]! |= 2;
const TAB: Piece = Object.freeze({ text: "\t" });
// String.prototype.trim and \s share WhiteSpace + LineTerminator; \n bounds the line.
const NON_BLANK = /[^\S\n]*\S/y;
const digit = (code: number) => code >= 48 && code <= 57;
function processes(output: string): Reduction | undefined {
  const headerEnd = output.indexOf("\n"), header = output.slice(0, headerEnd);
  if (!["  PID  PPID STAT COMM", "    PID    PPID STAT COMMAND"].includes(header) || headerEnd + 1 >= output.length) return;
  const second = header.indexOf("PPID") + 4, first = header.indexOf("PID") + 3;
  const state = second + 1, command = header.indexOf("COMM");
  // Fixed widths already cap Darwin at 5 and procps at 7 digits (inside int32 pid_t). Bound to the
  // kernel ranges: xnu PID_MAX 99999; Linux pid < pid_max <= PID_MAX_LIMIT 4*1024*1024 (threads.h).
  const pidMax = header.startsWith("    PID") ? 4194303 : 99999;
  const pieces: Piece[] = [], required: Span[] = [], ids = new Set<number>();
  function cells(a: Span, b: Span, c: Span, d: Span) {
    // The source newline closes the tail cell: one span instead of span + text, identical bytes.
    pieces.push(a, TAB, b, TAB, c, TAB, d); required.push(a, b, c, d);
  }
  cells([header.indexOf("PID"), first], [header.indexOf("PPID"), second], [state, state + 4], [command, headerEnd + 1]);
  for (let offset = headerEnd + 1; offset < output.length;) {
    const end = output.indexOf("\n", offset);
    if (end - offset < command || output.charCodeAt(offset + first) !== 32 || output.charCodeAt(offset + second) !== 32
        || output.charCodeAt(offset + command - 1) !== 32) return;
    // PID: ^ *[1-9]\d*$ over [0, first), within the kernel bound.
    let i = offset, pid = 0;
    while (i < offset + first && output.charCodeAt(i) === 32) i++;
    const pidStart = i;
    if (i === offset + first || output.charCodeAt(i) === 48) return;
    for (; i < offset + first; i++) { const code = output.charCodeAt(i); if (!digit(code)) return; pid = pid * 10 + code - 48; }
    // PPID: ^ *(?:0|[1-9]\d*)$ over [first + 1, second), within the kernel bound.
    let j = offset + first + 1, ppid = 0;
    while (j < offset + second && output.charCodeAt(j) === 32) j++;
    const ppidStart = j;
    if (j === offset + second || (output.charCodeAt(j) === 48 && j + 1 !== offset + second)) return;
    for (; j < offset + second; j++) { const code = output.charCodeAt(j); if (!digit(code)) return; ppid = ppid * 10 + code - 48; }
    if (pid > pidMax || ppid > pidMax || ids.has(pid)) return;
    // STAT over [state, command - 1): one state letter, modifiers, then only spaces.
    let k = offset + state;
    const lead = output.charCodeAt(k++);
    if (lead >= 128 || !(STAT[lead]! & 1)) return;
    while (k < offset + command - 1) { const code = output.charCodeAt(k); if (code >= 128 || !(STAT[code]! & 2)) break; k++; }
    const statEnd = k;
    for (; k < offset + command - 1; k++) if (output.charCodeAt(k) !== 32) return;
    // COMM/COMMAND tail must contain a non-whitespace character (trim() semantics).
    const tail = output.charCodeAt(offset + command);
    if (!(tail > 32 && tail < 127)) { NON_BLANK.lastIndex = offset + command; if (!NON_BLANK.test(output)) return; }
    ids.add(pid);
    cells([pidStart, offset + first], [ppidStart, offset + second], [offset + state, statEnd], [offset + command, end + 1]);
    offset = end + 1;
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
export const reduceAutomaticCli: AutomaticReducer = observation => {
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
