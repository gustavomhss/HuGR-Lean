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

/**
 * Duplicate-ref registry. Canonical `e<digits>` refs (no leading zero, at most 15 digits) map one-to-one onto
 * integers and are kept as numbers, which avoids slicing and hashing a string per row; every other ref text
 * (leading zeros, `f…e…` frame refs, longer runs) is kept verbatim in a separate string set.
 */
function refRegistry(source: string) {
  // Small integers live in a lazily grown bit set; larger ones in a number set.
  const numbers = new Set<number>(), texts = new Set<string>(), SMALL = 1 << 20;
  let bits = new Uint32Array(0), small = 0;
  /** Registers the ref text [start, end); false when it was already registered. */
  const add = (start: number, end: number): boolean => {
    if (source.charCodeAt(start) === 101 && end - start <= 16 && (end - start === 2 || source.charCodeAt(start + 1) !== 48)) {
      let value = 0;
      for (let i = start + 1; i < end; i++) value = value * 10 + source.charCodeAt(i) - 48;
      if (value < SMALL) {
        const word = value >>> 5, bit = 1 << (value & 31);
        if (word >= bits.length) { const next = new Uint32Array(Math.max(word + 1, bits.length * 2, 256)); next.set(bits); bits = next; }
        if (bits[word]! & bit) return false;
        bits[word] = bits[word]! | bit; small++; return true;
      }
      if (numbers.has(value)) return false;
      numbers.add(value); return true;
    }
    const text = source.slice(start, end);
    if (texts.has(text)) return false;
    texts.add(text); return true;
  };
  return { add, size: () => small + numbers.size + texts.size };
}

/** ASCII units that no scan rule inspects: everything except controls, `"` `.` `:` `>` `[` `\\` `]` `|`. */
const ORDINARY = new Uint8Array(128);
for (let code = 32; code < 128; code++) ORDINARY[code] = '".:>[\\]|'.includes(String.fromCharCode(code)) ? 0 : 1;

/** Facts of the last successful scan: first unquoted colon and `ref`-named attributes. */
const facts = { colon: 0, refs: 0, refStart: 0, refEnd: 0 };

/**
 * Quotes own their brackets/colons; unquoted brackets must balance independently. Scans one row from `start`
 * up to its line feed (or `limit`) and returns the row end, or -1. Every other control character refuses.
 */
function scan(source: string, start: number, limit: number, singleLine: boolean): number {
  let quoted = false, escaped = false, bracket = -1, end = limit;
  facts.colon = -1; facts.refs = 0;
  for (let i = start; i < limit; i++) {
    const code = source.charCodeAt(i);
    // Ordinary characters only end an escape; inside or outside quotes they change no other state.
    if (code < 128 ? ORDINARY[code] === 1 : code !== 0x2026 && code !== 0x2028 && code !== 0x2029) { escaped = false; continue; }
    if (code < 32) { if (code === 10) { end = i; break; } return -1; }
    if (singleLine && (code === 0x2028 || code === 0x2029)) return -1;
    if (quoted) {
      if (escaped) { escaped = false; continue; }
      if (code === 92) escaped = true;
      else if (code === 34) quoted = false;
      continue;
    }
    if (code === 34) { quoted = true; continue; }
    if (code === 91) {
      if (bracket >= 0) return -1;
      bracket = i;
    } else if (code === 93) {
      if (bracket < 0) return -1;
      // Attribute name `ref` followed by a non-name character or the closing bracket.
      if (i - bracket > 3 && source.startsWith("ref", bracket + 1) && (i - bracket === 4 || !isName(source.charCodeAt(bracket + 4)))) {
        if (facts.refs++ === 0) { facts.refStart = bracket; facts.refEnd = i + 1; }
      }
      bracket = -1;
    } else if (bracket < 0) {
      if (code === 58) { if (facts.colon < 0) facts.colon = i; }
      // Two following dots are never a line feed, so `limit` bounds this exactly like the row end.
      else if (code === 0x2026 || (code === 46 && i + 3 <= limit && source.charCodeAt(i + 1) === 46 && source.charCodeAt(i + 2) === 46)) return -1;
      else if ((code === 124 || code === 62) && (i === start || matchesAt(SPACE_OR_COLON, source, i - 1))) return -1;
    }
  }
  if (facts.colon < 0) facts.colon = end;
  return quoted || bracket >= 0 ? -1 : end;
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
  // Every dropped range is grammar-validated ASCII (`yaml`, `- `, `[ref=`, `]`, `uid=`): one UTF-8 byte per unit.
  const drop = (start: number, end: number) => { dropped += end - start; };
  const fixed = (text: "text" | " ") => { pieces.push({ text }); added += text.length; last = undefined; };
  // Strictly smaller output only.
  const finish = (): Reduction | undefined => dropped > added ? { pieces, required } : undefined;
  return { keep, drop, fixed, finish };
}

function playwright(source: string): Reduction | undefined {
  const length = source.length;
  // One pass over the only lines that matter: the unique `### Snapshot` heading, the line after it (its
  // `yaml` fence), the first closing fence after that, and fence-aware `### Error` markers (protocol markers
  // only outside fences). Only lines starting with a backtick fence or `### ` can be any of these, so they
  // are found by substring search instead of visiting every line.
  let heading = -1, openStart = -1, openEnd = -1, openStop = -1, closeStart = -1, fenced = false;
  const lineAt = (newline: number) => newline < 0 ? -1 : newline + 1;
  let fence = source.startsWith("```") ? 0 : lineAt(source.indexOf("\n```"));
  let hash = source.startsWith("### ") ? 0 : lineAt(source.indexOf("\n### "));
  while (fence >= 0 || hash >= 0) {
    const start = hash < 0 || (fence >= 0 && fence < hash) ? fence : hash;
    if (start === fence) fence = lineAt(source.indexOf("\n```", start));
    else hash = lineAt(source.indexOf("\n### ", start));
    const newline = source.indexOf("\n", start), end = newline < 0 ? length : newline, stop = newline < 0 ? length : newline + 1;
    // Lines after the heading start at or after its line end; the next line itself is the opening fence.
    if (heading >= 0 && start > openStart && closeStart < 0 && isLine(source, start, end, "```")) closeStart = start;
    if (source.startsWith("```", start)) fenced = !fenced;
    else if (isLine(source, start, end, "### Snapshot")) {
      if (heading >= 0) return undefined;
      heading = start;
      if (stop < length) {
        const next = source.indexOf("\n", stop);
        openStart = stop; openEnd = next < 0 ? length : next; openStop = next < 0 ? length : next + 1;
      }
    }
    else if (!fenced && isLine(source, start, end, "### Error")) return undefined;
  }
  if (heading < 0 || openStart < 0 || !isLine(source, openStart, openEnd, "```yaml") || openStop === length) return undefined;
  if (closeStart < 0 || fenced) return undefined;
  const out = builder(source), refs = refRegistry(source);
  out.keep(0, openStart + 3); out.fixed("text"); out.drop(openStart + 3, openStart + 7); out.keep(openStart + 7, openStop);
  // Native hierarchy: root rows at depth 0, one 2-space level per step. Exactly the element
  // rows ending in an empty-valued unquoted colon (`- generic [ref=e1]:`) own children, and
  // each owns at least one; `text`/property rows are leaf-only. No space precedes the colon.
  let previousDepth = -1, previousContainer = false;
  // The closing fence line follows a line feed, so every body row ends at a line feed before closeStart:
  // the row scan finds it, and rows fail only by returning undefined, so check order is free.
  for (let start = openStop; start < closeStart;) {
    let dash = start;
    while (source.charCodeAt(dash) === 32) dash++;
    const indent = dash - start, base = dash + 2;
    // A line feed at dash or dash + 1 (base > end) fails these character checks.
    if (indent % 2 || source.charCodeAt(dash) !== 45 || source.charCodeAt(dash + 1) !== 32) return undefined;
    const end = scan(source, base, closeStart, false), stop = end + 1;
    if (end < 0) return undefined;
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
    if (!refs.add(refStart + 5, refEnd - 1)) return undefined;
    out.keep(start, dash); out.drop(dash, base);
    out.keep(refStart + 5, refEnd - 1); out.fixed(" ");
    out.keep(base, refStart); out.drop(refStart, refStart + 5); out.drop(refEnd - 1, refEnd); out.keep(refEnd, stop);
    start = stop;
  }
  if (previousContainer || refs.size() < 2) return undefined;
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
    if (space < 0 || source.charCodeAt(space) !== 32 || space + 1 >= end || scan(source, space + 1, end, true) < 0) return undefined;
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
