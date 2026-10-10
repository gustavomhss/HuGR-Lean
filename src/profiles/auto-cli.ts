import { tokenizeCommand } from "../core/command.js";
import type { AutomaticReducer } from "../core/automatic-types.js";
import type { Piece, Reduction, Span } from "../core/types.js";

// Narrow fixed-width Darwin/procps layouts. Never split the command/name tail.
function processes(output: string): Reduction | undefined {
  const lines = output.slice(0, -1).split("\n"), header = lines.shift()!;
  if (!["  PID  PPID STAT COMM", "    PID    PPID STAT COMMAND"].includes(header) || !lines.length) return;
  const second = header.indexOf("PPID") + 4, first = header.indexOf("PID") + 3;
  const state = second + 1, command = header.indexOf("COMM");
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
        !/^[IDRSTtUVWZX][<NLPsl+EXW-]* *$/.test(stat) || !line.slice(command).trim() || ids.has(pid.trim())) return;
    ids.add(pid.trim());
    cells([[offset + pid.search(/\d/), offset + first], [offset + first + 1 + ppid.search(/\d/), offset + second],
      [offset + state, offset + state + stat.trimEnd().length], [offset + command, offset + line.length]]);
    offset += line.length + 1;
  }
  return { pieces, required };
}

function listing(output: string): Reduction | undefined {
  const pieces: Piece[] = [], required: Span[] = [];
  let offset = 0, rows = 0;
  for (const line of output.slice(0, -1).split("\n")) {
    if (offset === 0 && /^total \d+$/.test(line)) {
      const span: Span = [0, line.length]; pieces.push(span, { text: "\n" }); required.push(span);
    } else {
      // English C locale ordinary file/directory/link, ACL/xattr marker, all nine cells.
      const match = /^([-dl][r-][w-][xSs-][r-][w-][xSs-][r-][w-][xTt-][@+.]?) +(\d+) +(\S+) +(\S+) +(\d+) +(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) +(\d{1,2}) +(\d{2}:\d{2}|\d{4}) (.+)$/.exec(line);
      if (!match || Number(match[2]) < 1 || Number(match[7]) < 1 || Number(match[7]) > 31 ||
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
  const integer = /^\d+$/, decimal = /^\d+(?:\.\d+)?$/;
  for (let start = 0; start < lines.length; start += keys.length) {
    const values: string[] = []; finalStart = offset;
    for (const [i, key] of keys.entries()) {
      const line = lines[start + i]!;
      if (!line.startsWith(`${key}=`)) return;
      values.push(line.slice(key.length + 1)); offset += line.length + 1;
    }
    const [frame, fps, quality, bitrate, size, us, ms, time, dup, drop, speed, status] = (video ? values : ["0", "0", "0", ...values]) as [string, string, string, string, string, string, string, string, string, string, string, string];
    const clock = /^(\d{2,}):([0-5]\d):([0-5]\d)\.(\d{6})$/.exec(time);
    if (![frame, us, ms, dup, drop].every(v => integer.test(v)) || !decimal.test(fps) ||
        !/^-?\d+(?:\.\d+)?$/.test(quality) || !/^(?:N\/A|\s*\d+(?:\.\d+)?kbits\/s)$/.test(bitrate) ||
        !(size === "N/A" || integer.test(size)) || !/^(?:N\/A| *\d+(?:\.\d+)?(?:e[+-]?\d+)?x)$/.test(speed) || !clock ||
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
