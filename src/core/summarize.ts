import { filterAutomatic } from "./automatic.js";

/** Byte budgets are UTF-8; cuts never split a UTF-16 surrogate pair. */
export interface SummarizeOptions {
  /** Shell outputs at or below this size are not shortened to head/tail; lossy CR cleanup still requires recovery. */
  readonly shellThresholdBytes?: number;
  readonly headBytes?: number;
  readonly tailBytes?: number;
  /** Budget for warning lines, and for failure lines of a command that exited 0. */
  readonly errorBytes?: number;
  /** Read replacement budget, including wrapper/suffix but excluding recall; refuses if no whole row fits. */
  readonly readCapBytes?: number;
  readonly webfetchCapBytes?: number;
  /** Keep the host's `N: ` read prefixes instead of compacting them into one header line. */
  readonly readLineNumbers?: boolean;
}

export interface SummarizeObservation {
  readonly tool: string;
  readonly output: string;
  readonly args?: Readonly<Record<string, unknown>>;
  readonly metadata?: Readonly<Record<string, unknown>>;
  /** Disable automatic native views when the caller already ran that pipeline. */
  readonly automatic?: boolean;
}

/**
 * `rewritten`: complete content, losslessly compacted or normalized; no recovery needed.
 * `summarized`: lossy; the caller must store the original and append `recoveryLine(id)`.
 * `outputBytes` of a summary already counts the recovery line.
 */
export type SummarizeResult = { readonly inputBytes: number; readonly outputBytes: number; readonly reason: string } & (
  | { readonly status: "unchanged" }
  | { readonly status: "rewritten" | "summarized"; readonly replacement: string });

export const defaultSummarizeOptions: Required<SummarizeOptions> = Object.freeze({
  shellThresholdBytes: 4 * 1024, headBytes: 1536, tailBytes: 1536, errorBytes: 4 * 1024,
  readCapBytes: 8 * 1024, webfetchCapBytes: 8 * 1024, readLineNumbers: false,
});

export const recoveryLine = (id: string): string => `\n[full output: hugr-lean recall ${id}]`;
const bytes = (text: string): number => Buffer.byteLength(text, "utf8");
const RECOVERY_BYTES = bytes(recoveryLine("0".repeat(32)));
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

// Failure evidence is kept whole. Matching is deliberately broad: a false positive only costs bytes.
const FAILURE = /error|fail|panic|exception|fatal|traceback|assert|denied|abort|segmentation fault|not found|cannot|unable to|[✗✘×]/i;
const WARNING = /warn|deprecat/i;
const CONTINUATION = /^(?:\s+\S|\s*at |\s*[|^~]|\s*-->|\s*File "|\[previous line repeated \d+ more times\]$)/;
const ANSI = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;

function options(value: SummarizeOptions | undefined): Required<SummarizeOptions> {
  const merged = { ...defaultSummarizeOptions, ...(record(value) ? value : {}) };
  for (const [key, number] of Object.entries(merged)) {
    if (key === "readLineNumbers") { if (typeof number !== "boolean") throw new TypeError("readLineNumbers must be a boolean"); }
    else if (!Number.isSafeInteger(number) || (number as number) < 0) throw new RangeError(`${key} must be a nonnegative safe integer`);
  }
  return merged;
}

/** Longest prefix (or suffix) within `max` UTF-8 bytes. */
function cut(text: string, max: number, fromEnd = false): string {
  let low = 0, high = Math.min(text.length, max);
  const take = (count: number) => fromEnd ? text.slice(text.length - count) : text.slice(0, count);
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (bytes(take(middle)) <= max) low = middle; else high = middle - 1;
  }
  const edge = fromEnd ? text.charCodeAt(text.length - low) : text.charCodeAt(low - 1);
  if (low > 0 && (fromEnd ? edge >= 0xdc00 && edge <= 0xdfff : edge >= 0xd800 && edge <= 0xdbff)) low--;
  return take(low);
}

/** ANSI/CRLF normalization and reversible repeated-line marking; CR frame collapse is lossy. */
function shellCleanup(text: string, preserveFrames: boolean): { text: string; lossy: boolean } {
  let lossy = false;
  const normalized = text.replace(ANSI, "");
  preserveFrames ||= FAILURE.test(normalized);
  const lines = normalized.split("\n").map(line => {
    const end = line.endsWith("\r") ? line.slice(0, -1) : line;
    const overwrite = end.lastIndexOf("\r");
    if (overwrite < 0) return end;
    // A failed/unknown command can hide diagnostics in any overwritten frame.
    if (preserveFrames) return end;
    lossy = true;
    return end.slice(overwrite + 1);
  });
  const out: string[] = [];
  for (let i = 0; i < lines.length;) {
    let j = i + 1;
    while (j < lines.length && lines[j] === lines[i]) j++;
    const line = lines[i]!, repeats = j - i - 1, marker = `[previous line repeated ${repeats} more times]`;
    if (line.trim().length && repeats >= 2 && (bytes(line) + 1) * repeats > bytes(marker) + 1) out.push(line, marker);
    else for (let k = i; k < j; k++) out.push(line);
    i = j;
  }
  return { text: out.join("\n"), lossy };
}

/** Display cleanup only. Call summarize() to determine whether recovery is required. */
export function cleanShell(text: string): string {
  return shellCleanup(text, false).text;
}

function omitted(count: number): string {
  return `… [lean: ${count} line${count === 1 ? "" : "s"} omitted] …`;
}

/** Head + tail + failure blocks (+ warnings within budget); markers replace every omitted run. */
function summarizeShell(text: string, o: Required<SummarizeOptions>, failed: boolean): string | undefined {
  const lines = text.split("\n"), keep = new Uint8Array(lines.length), partial = new Map<number, string>();
  let headEnd = 0, used = 0;
  while (headEnd < lines.length && used + bytes(lines[headEnd]!) + 1 <= o.headBytes) used += bytes(lines[headEnd++]!) + 1;
  keep.fill(1, 0, headEnd);
  if (!headEnd && lines.length && o.headBytes > 0) {
    keep[0] = 1; partial.set(0, `${cut(lines[0]!, o.headBytes)} … [lean: line cut]`); headEnd = 1;
  }
  let tailStart = lines.length; used = 0;
  while (tailStart > headEnd && used + bytes(lines[tailStart - 1]!) + 1 <= o.tailBytes) used += bytes(lines[--tailStart]!) + 1;
  keep.fill(1, tailStart);
  if (tailStart === lines.length && tailStart > headEnd && o.tailBytes > 0) {
    tailStart--; keep[tailStart] = 1;
    partial.set(tailStart, `[lean: line cut] … ${cut(lines[tailStart]!, o.tailBytes, true)}`);
  }
  let budget = o.errorBytes;
  // Scan the entire output: a diagnostic may start in the head or continue into a cut tail.
  for (let i = 0; i < lines.length; i++) {
    if (!FAILURE.test(lines[i]!)) continue;
    let end = i + 1;
    // Keep every recognized continuation, including lines that resemble later test success output.
    while (end < lines.length && CONTINUATION.test(lines[end]!) && !FAILURE.test(lines[end]!)) end++;
    const start = Math.max(0, i - 1);
    let size = 0;
    for (let row = start; row < end; row++) if (!keep[row] || partial.has(row)) size += bytes(lines[row]!) + 1;
    if (!failed && size > budget) continue;
    if (!failed) budget -= size;
    keep.fill(1, start, end);
    for (let row = start; row < end; row++) partial.delete(row);
    i = end - 1;
  }
  for (let i = 0; i < lines.length; i++) {
    const size = bytes(lines[i]!) + 1;
    if (!keep[i] && WARNING.test(lines[i]!) && size <= budget) { keep[i] = 1; budget -= size; }
  }
  const rendered: string[] = [];
  let changed = partial.size > 0;
  for (let i = 0; i < lines.length;) {
    if (keep[i]) { rendered.push(partial.get(i) ?? lines[i]!); i++; continue; }
    let j = i;
    while (j < lines.length && !keep[j]) j++;
    rendered.push(omitted(j - i)); changed = true;
    i = j;
  }
  return changed ? rendered.join("\n") : undefined;
}

const READ = /^<path>[^\n]*<\/path>\n<type>file<\/type>\n<content>\n/;
// Host footers across OpenCode versions; older hosts put one blank line before the footer.
const READ_FOOTER = /^\((?:(?:PARTIAL view\. |Output capped at \d+ KB\. )?Showing lines \d+-\d+(?: of \d+)?\. Use offset=\d+ to continue\.|End of file(?: - total \d+ lines)?)\)$/;

function summarizeRead(text: string, o: Required<SummarizeOptions>): { text: string; lossy: boolean } | { reason: string } | undefined {
  const prefix = READ.exec(text)?.[0];
  const close = text.lastIndexOf("\n</content>"), footerStart = text.lastIndexOf("\n", close - 1);
  if (!prefix || footerStart < prefix.length || !READ_FOOTER.test(text.slice(footerStart + 1, close))) return;
  const footer = text.slice(footerStart + 1, close);
  const body = text.slice(prefix.length, footerStart), rest = text.slice(close);
  const rows = body.split("\n"), gap = rows.length > 1 && rows[rows.length - 1] === "" ? "\n" : "";
  if (gap) rows.pop();
  const start = Number(/^(\d+): /.exec(rows[0]!)?.[1]);
  if (!body.length || !Number.isSafeInteger(start) || start < 1 || !Number.isSafeInteger(start + rows.length - 1)) return;
  const content: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const label = `${start + i}: `;
    if (!rows[i]!.startsWith(label)) return;
    content.push(o.readLineNumbers ? rows[i]! : rows[i]!.slice(label.length));
  }
  const render = (count: number, note: string) => {
    const last = start + count - 1;
    const header = o.readLineNumbers ? "" : `(lines ${start}-${last}; "N: " line-number prefixes omitted)\n`;
    return `${prefix}${header}${content.slice(0, count).join("\n")}\n${gap}${note}${rest}`;
  };
  const full = render(content.length, footer);
  if (bytes(full) <= o.readCapBytes) return { text: full, lossy: false };
  const partial = (count: number) => {
    const last = start + count - 1;
    return render(count, `(PARTIAL view. Showing lines ${start}-${last}. Use offset=${last + 1} to continue.)`);
  };
  // The cap excludes the recovery line, but includes the full wrapper and mandatory suffix.
  // If not even one intact source row fits, leave the original rather than inventing a partial row.
  if (content.length < 2 || bytes(partial(1)) > o.readCapBytes) return { reason: "read_cap_unsatisfiable" };
  let low = 1, high = content.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (bytes(partial(middle)) <= o.readCapBytes) low = middle; else high = middle - 1;
  }
  return { text: partial(low), lossy: true };
}

function summarizeCapped(text: string, cap: number, label: string): string {
  const total = bytes(text), lines = text.split("\n"), kept: string[] = [];
  let used = 0;
  for (const line of lines) { if (used + bytes(line) + 1 > cap) break; kept.push(line); used += bytes(line) + 1; }
  if (!kept.length) kept.push(cut(lines[0]!, cap));
  return `${kept.join("\n")}\n… [lean: ${label} capped, showing ${bytes(kept.join("\n"))} of ${total} bytes]`;
}

/** Pure: no I/O. Head/tail shortening honors its threshold; every accepted result is smaller. */
export function summarize(observation: SummarizeObservation, value?: SummarizeOptions): SummarizeResult {
  let inputBytes = 0;
  const unchanged = (reason: string): SummarizeResult => ({ status: "unchanged", reason, inputBytes, outputBytes: inputBytes });
  try {
    if (!record(observation) || typeof observation.output !== "string" || typeof observation.tool !== "string") return unchanged("invalid_observation");
    const o = options(value), { tool, output } = observation;
    const args = record(observation.args) ? observation.args : {}, metadata = record(observation.metadata) ? observation.metadata : {};
    inputBytes = bytes(output);
    const done = (status: "rewritten" | "summarized", replacement: string, reason: string): SummarizeResult => {
      const outputBytes = bytes(replacement) + (status === "summarized" ? RECOVERY_BYTES : 0);
      return outputBytes < inputBytes && replacement.length ? { status, replacement, reason, inputBytes, outputBytes } : unchanged("not_smaller");
    };
    if (tool === "bash") {
      const exit = metadata.exit;
      const failed = !(typeof exit === "number" && exit === 0);
      const cleanup = shellCleanup(output, failed), clean = cleanup.text;
      const summary = bytes(clean) > o.shellThresholdBytes ? summarizeShell(clean, o, failed) : undefined;
      if (summary !== undefined) {
        const result = done("summarized", summary, failed ? "shell_summary_failed_command" : "shell_summary");
        if (result.status !== "unchanged") return result;
      }
      return clean === output ? unchanged("below_threshold") : done(cleanup.lossy ? "summarized" : "rewritten", clean, cleanup.lossy ? "shell_overwrite" : "shell_cleanup");
    }
    if (tool === "read") {
      const read = summarizeRead(output, o);
      if (read && "reason" in read) return unchanged(read.reason);
      if (read) return done(read.lossy ? "summarized" : "rewritten", read.text, read.lossy ? "read_cap" : "read_line_numbers");
    }
    if (tool === "webfetch") {
      return inputBytes > o.webfetchCapBytes ? done("summarized", summarizeCapped(output, o.webfetchCapBytes, "webfetch"), "webfetch_cap") : unchanged("below_threshold");
    }
    if (observation.automatic !== false && ["grep", "glob", "read"].includes(tool) && metadata.truncated === false) {
      const view = filterAutomatic({ source: "native", tool, output, args, metadata, status: "success", completeness: "complete" });
      if (view.status === "reduced" || view.status === "normalized") return done("rewritten", view.replacement, `automatic:${view.profile ?? view.status}`);
    }
    return unchanged("unsupported_tool_or_format");
  } catch { return unchanged("failed_open"); }
}
