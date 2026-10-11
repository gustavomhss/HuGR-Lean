import type { AutomaticReducer } from "../core/automatic-types.js";
import type { Piece, Reduction, Span } from "../core/types.js";

// Single-pass, allocation-light grammar checks over the source itself: rows, payloads and
// attributes are index ranges, never slices. Grammar and refusals are unchanged.
const SPACE_OR_COLON = /[\s:]/y, NON_SPACE = /\S/y;
const matchesAt = (pattern: RegExp, source: string, index: number) => { pattern.lastIndex = index; return pattern.test(source); };
const isLine = (source: string, start: number, end: number, text: string) => end - start === text.length && source.startsWith(text, start);
const isDigit = (code: number) => code >= 48 && code <= 57;
const isName = (code: number) => (code >= 97 && code <= 122) || isDigit(code) || code === 45;
/** Index after a non-empty ASCII digit run starting at `index`, or -1. */
function digits(source: string, index: number, end: number): number {
  const start = index;
  while (index < end && isDigit(source.charCodeAt(index))) index++;
  return index > start ? index : -1;
}

/** Facts of the last successful scan: first unquoted colon and `ref`-named attributes. */
const facts = { colon: 0, refs: 0, refStart: 0, refEnd: 0 };

/** Quotes own their brackets/colons; unquoted brackets must balance independently. */
function scan(source: string, start: number, end: number, singleLine: boolean): boolean {
  let quoted = false, escaped = false, bracket = -1;
  facts.colon = end; facts.refs = 0;
  for (let i = start; i < end; i++) {
    const code = source.charCodeAt(i);
    if (code < 32 || (singleLine && (code === 0x2028 || code === 0x2029))) return false;
    if (quoted) {
      if (escaped) { escaped = false; continue; }
      if (code === 92) escaped = true;
      else if (code === 34) quoted = false;
      continue;
    }
    if (code === 34) { quoted = true; continue; }
    if (code === 91) {
      if (bracket >= 0) return false;
      bracket = i;
    } else if (code === 93) {
      if (bracket < 0) return false;
      // Attribute name `ref` followed by a non-name character or the closing bracket.
      if (i - bracket > 3 && source.startsWith("ref", bracket + 1) && (i - bracket === 4 || !isName(source.charCodeAt(bracket + 4)))) {
        if (facts.refs++ === 0) { facts.refStart = bracket; facts.refEnd = i + 1; }
      }
      bracket = -1;
    } else if (bracket < 0) {
      if (code === 58) { if (facts.colon === end) facts.colon = i; }
      else if (code === 0x2026 || (code === 46 && i + 3 <= end && source.charCodeAt(i + 1) === 46 && source.charCodeAt(i + 2) === 46)) return false;
      else if ((code === 124 || code === 62) && (i === start || matchesAt(SPACE_OR_COLON, source, i - 1))) return false;
    }
  }
  return !quoted && bracket < 0;
}

/** Attribute body `ref=e<digits>` or `ref=f<digits>e<digits>`, exactly [start, end). */
function validRef(source: string, start: number, end: number): boolean {
  if (end - start < 6 || !source.startsWith("ref=", start)) return false;
  let index = start + 4;
  if (source.charCodeAt(index) === 102) {
    index = digits(source, index + 1, end);
    if (index < 0 || index >= end || source.charCodeAt(index) !== 101) return false;
  } else if (source.charCodeAt(index) !== 101) return false;
  return digits(source, index + 1, end) === end;
}

function utf8(source: string, start: number, end: number): number {
  let bytes = 0;
  for (let i = start; i < end; i++) {
    const code = source.charCodeAt(i);
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code >= 0xd800 && code <= 0xdbff && i + 1 < end && (source.charCodeAt(i + 1) & 0xfc00) === 0xdc00 ? (i++, 4) : 3;
  }
  return bytes;
}

/** Kept spans plus dropped ranges partition the source, so output bytes = source − dropped + fixed. */
function builder(source: string) {
  const pieces: Piece[] = [], required: Span[] = [];
  let last: [number, number] | undefined, dropped = 0, added = 0;
  const keep = (start: number, end: number) => {
    if (start >= end) return;
    // Contiguous kept spans are one piece; the renderer would coalesce them identically.
    if (last && last[1] === start) { last[1] = end; return; }
    last = [start, end]; pieces.push(last); required.push(last);
  };
  const drop = (start: number, end: number) => { dropped += utf8(source, start, end); };
  const fixed = (text: "text" | " ") => { pieces.push({ text }); added += text.length; last = undefined; };
  // Strictly smaller output only.
  const finish = (): Reduction | undefined => dropped > added ? { pieces, required } : undefined;
  return { keep, drop, fixed, finish };
}

function playwright(source: string): Reduction | undefined {
  const length = source.length;
  // One pass: the unique `### Snapshot` heading, its `yaml` fence, the first closing fence
  // after it, and fence-aware `### Error` markers (protocol markers only outside fences).
  let line = 0, heading = -1, openStart = -1, openEnd = -1, openStop = -1, closeStart = -1, fenced = false;
  for (let start = 0; start < length; line++) {
    const newline = source.indexOf("\n", start), end = newline < 0 ? length : newline, stop = newline < 0 ? length : newline + 1;
    if (heading >= 0 && line === heading + 1) { openStart = start; openEnd = end; openStop = stop; }
    else if (heading >= 0 && line > heading + 1 && closeStart < 0 && isLine(source, start, end, "```")) closeStart = start;
    if (source.startsWith("```", start)) fenced = !fenced;
    else if (isLine(source, start, end, "### Snapshot")) { if (heading >= 0) return undefined; heading = line; }
    else if (!fenced && isLine(source, start, end, "### Error")) return undefined;
    start = stop;
  }
  if (heading < 0 || openStart < 0 || !isLine(source, openStart, openEnd, "```yaml") || openStop === length) return undefined;
  if (closeStart < 0 || fenced) return undefined;
  const out = builder(source), refs = new Set<string>();
  out.keep(0, openStart + 3); out.fixed("text"); out.drop(openStart + 3, openStart + 7); out.keep(openStart + 7, openStop);
  // Native hierarchy: root rows at depth 0, one 2-space level per step. Exactly the element
  // rows ending in an empty-valued unquoted colon (`- generic [ref=e1]:`) own children, and
  // each owns at least one; `text`/property rows are leaf-only. No space precedes the colon.
  let previousDepth = -1, previousContainer = false;
  for (let start = openStop; start < closeStart;) {
    const newline = source.indexOf("\n", start), end = newline < 0 || newline >= closeStart ? closeStart : newline;
    const stop = newline < 0 || newline >= closeStart ? closeStart : newline + 1;
    let dash = start;
    while (dash < end && source.charCodeAt(dash) === 32) dash++;
    const indent = dash - start, base = dash + 2;
    if (indent % 2 || source.charCodeAt(dash) !== 45 || source.charCodeAt(dash + 1) !== 32 || base > end) return undefined;
    // Role `[a-z][a-z0-9-]*` before a space, colon or row end; or a native property key.
    let text = false, property = false;
    const first = source.charCodeAt(base);
    if (base < end && first >= 97 && first <= 122) {
      let role = base + 1;
      while (role < end && isName(source.charCodeAt(role))) role++;
      if (role < end && source.charCodeAt(role) !== 32 && source.charCodeAt(role) !== 58) return undefined;
      text = role - base === 4 && source.startsWith("text", base);
    } else if (source.startsWith("/url:", base) || source.startsWith("/placeholder:", base) || source.startsWith("/description:", base)) property = true;
    else return undefined;
    if (!scan(source, base, end, false)) return undefined;
    const { colon } = facts;
    if (colon < end && source.charCodeAt(colon - 1) === 32) return undefined;
    // Native text pseudo-rows always carry inline value text: `- text: Name`.
    if (text && !(source.startsWith("text: ", base) && base + 6 < end && matchesAt(NON_SPACE, source, base + 6))) return undefined;
    const depth = indent / 2;
    if (previousDepth < 0 ? depth !== 0 : previousContainer ? depth !== previousDepth + 1 : depth > previousDepth) return undefined;
    previousDepth = depth;
    previousContainer = !text && !property && colon === end - 1;
    if (!facts.refs) { out.keep(start, stop); start = stop; continue; }
    if (facts.refs !== 1 || property) return undefined;
    const { refStart, refEnd } = facts;
    if (refStart >= colon || !validRef(source, refStart + 1, refEnd - 1)) return undefined;
    const value = source.slice(refStart + 5, refEnd - 1);
    if (refs.has(value)) return undefined;
    refs.add(value);
    out.keep(start, dash); out.drop(dash, base);
    out.keep(refStart + 5, refEnd - 1); out.fixed(" ");
    out.keep(base, refStart); out.drop(refStart, refStart + 5); out.drop(refEnd - 1, refEnd); out.keep(refEnd, stop);
    start = stop;
  }
  if (previousContainer || refs.size < 2) return undefined;
  out.keep(closeStart, length);
  return out.finish();
}

function devtools(source: string): Reduction | undefined {
  const header = "## Latest page snapshot\n", length = source.length;
  if (!source.startsWith(header)) return undefined;
  const out = builder(source), refs = new Set<string>();
  out.keep(0, header.length);
  // Native hierarchy: exactly one depth-0 RootWebArea first, then one 2-space level per step.
  // Row grammar `( *)uid=(\d+_\d+) (.+)$`: `.` admits no line terminator.
  let previousDepth = -1;
  for (let start = header.length; start < length;) {
    const newline = source.indexOf("\n", start), end = newline < 0 ? length : newline, stop = newline < 0 ? length : newline + 1;
    let uid = start;
    while (uid < end && source.charCodeAt(uid) === 32) uid++;
    const indent = uid - start;
    if (indent % 2 || !source.startsWith("uid=", uid)) return undefined;
    const underscore = digits(source, uid + 4, end);
    if (underscore < 0 || source.charCodeAt(underscore) !== 95) return undefined;
    const space = digits(source, underscore + 1, end);
    if (space < 0 || source.charCodeAt(space) !== 32 || space + 1 >= end || !scan(source, space + 1, end, true)) return undefined;
    const depth = indent / 2;
    const root = source.startsWith("RootWebArea", space + 1) && (space + 12 === end || source.charCodeAt(space + 12) === 32);
    if (previousDepth < 0 ? depth !== 0 || !root : depth < 1 || depth > previousDepth + 1) return undefined;
    previousDepth = depth;
    const ref = source.slice(uid + 4, space);
    if (refs.has(ref)) return undefined;
    refs.add(ref);
    out.keep(start, uid); out.drop(uid, uid + 4); out.keep(uid + 4, stop);
    start = stop;
  }
  return refs.size ? out.finish() : undefined;
}

/** Finite native text grammars only; producer conformance is a separate capture obligation. */
export const reduceAutomaticSnapshot: AutomaticReducer = observation => {
  const { source, tool, args, metadata, status, completeness, output } = observation;
  if (source !== "mcp" || status !== "success" || completeness !== "complete") return undefined;
  if (("truncated" in metadata && metadata.truncated !== false) ||
      ("exit" in metadata && (!Number.isSafeInteger(metadata.exit) || metadata.exit !== 0))) return undefined;
  const isPlaywright = tool === "browser_snapshot" || tool.endsWith("_browser_snapshot");
  const isDevtools = tool === "take_snapshot" || tool.endsWith("_take_snapshot");
  if (!isPlaywright && !isDevtools) return undefined;
  // pageId selects a whole page in the native default API, never an AX subtree.
  if (Object.keys(args).some(key => {
    if (isPlaywright) return key !== "boxes" || typeof args[key] !== "boolean";
    if (key === "pageId") return typeof args[key] !== "number" || !Number.isSafeInteger(args[key]) || args[key] <= 0;
    return key !== "verbose" || typeof args[key] !== "boolean";
  })) return undefined;
  if (/^\.\.\.(?:output truncated|\d+ (?:lines|bytes) truncated)\.\.\./.test(output)) return undefined;
  return isPlaywright ? playwright(output) : devtools(output);
};
