import type { AutomaticReducer } from "../core/automatic-types.js";
import type { Piece, Reduction, Span } from "../core/types.js";
import { renderReduction } from "../core/structured-render.js";

interface Row { text: string; start: number; end: number }
interface Attribute { start: number; end: number; text: string }

function rows(source: string, start = 0, end = source.length): Row[] {
  const result: Row[] = [];
  while (start < end) {
    const newline = source.indexOf("\n", start);
    const stop = newline < 0 || newline >= end ? end : newline + 1;
    result.push({ text: source.slice(start, stop).replace(/\n$/, ""), start, end: stop });
    start = stop;
  }
  return result;
}

/** Quotes own their brackets/colons; unquoted brackets must balance independently. */
function scan(text: string): { attributes: Attribute[]; colon: number } | undefined {
  const attributes: Attribute[] = [];
  let quoted = false, escaped = false, bracket = -1, colon = text.length;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (char.charCodeAt(0) < 32) return undefined;
    if (quoted) {
      if (escaped) { escaped = false; continue; }
      if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') { quoted = true; continue; }
    if (char === "[") {
      if (bracket >= 0) return undefined;
      bracket = i;
    } else if (char === "]") {
      if (bracket < 0) return undefined;
      attributes.push({ start: bracket, end: i + 1, text: text.slice(bracket + 1, i) });
      bracket = -1;
    } else if (bracket < 0) {
      if (char === ":") colon = Math.min(colon, i);
      if (char === "…" || text.slice(i, i + 3) === "...") return undefined;
      if ((char === "|" || char === ">") && (i === 0 || /[\s:]/.test(text[i - 1]!))) return undefined;
    }
  }
  return quoted || bracket >= 0 ? undefined : { attributes, colon };
}

function builder(source: string) {
  const pieces: Piece[] = [], required: Span[] = [];
  const keep = (start: number, end: number) => {
    if (start < end) { const span: Span = [start, end]; pieces.push(span); required.push(span); }
  };
  const fixed = (text: string) => pieces.push({ text });
  const finish = (): Reduction | undefined => {
    const reduction = { pieces, required };
    return Buffer.byteLength(renderReduction(source, reduction)) < Buffer.byteLength(source) ? reduction : undefined;
  };
  return { keep, fixed, finish };
}

function playwright(source: string): Reduction | undefined {
  const lines = rows(source);
  const headings = lines.filter(row => row.text === "### Snapshot");
  if (headings.length !== 1) return undefined;
  const heading = headings[0]!, index = lines.indexOf(heading);
  const open = lines[index + 1];
  if (!open || open.text !== "```yaml" || open.end === source.length) return undefined;
  const closeIndex = lines.findIndex((row, i) => i > index + 1 && row.text === "```");
  if (closeIndex < 0) return undefined;
  // Error sections are protocol markers only outside fenced content.
  let fenced = false;
  for (const row of lines) {
    if (row.text.startsWith("```")) fenced = !fenced;
    else if (!fenced && row.text === "### Error") return undefined;
  }
  if (fenced) return undefined;
  const out = builder(source), refs = new Set<string>();
  out.keep(0, open.start + 3); out.fixed("text"); out.keep(open.start + 7, open.end);
  // Native hierarchy: root rows at depth 0, one 2-space level per step. Exactly the element
  // rows ending in an empty-valued unquoted colon (`- generic [ref=e1]:`) own children, and
  // each owns at least one; `text`/property rows are leaf-only. No space precedes the colon.
  let previousDepth = -1, previousContainer = false;
  for (const row of lines.slice(index + 2, closeIndex)) {
    const match = /^( *)(- )([a-z][a-z0-9-]*(?=[ :]|$)|\/(?:url|placeholder|description):)/.exec(row.text);
    if (!match || match[1]!.length % 2) return undefined;
    const indent = match[1]!.length, payloadStart = indent + 2;
    const payload = row.text.slice(payloadStart), parsed = scan(payload);
    if (!parsed) return undefined;
    if (parsed.colon < payload.length && payload[parsed.colon - 1] === " ") return undefined;
    const depth = indent / 2;
    if (previousDepth < 0 ? depth !== 0 : previousContainer ? depth !== previousDepth + 1 : depth > previousDepth) return undefined;
    previousDepth = depth;
    previousContainer = match[3] !== "text" && !match[3]!.startsWith("/") && parsed.colon === payload.length - 1;
    const candidates = parsed.attributes.filter(attr => /^ref(?:[^a-z0-9-]|$)/.test(attr.text));
    if (!candidates.length) { out.keep(row.start, row.end); continue; }
    if (candidates.length !== 1 || match[3]!.startsWith("/")) return undefined;
    const ref = candidates[0]!;
    if (ref.start >= parsed.colon || !/^ref=(?:e\d+|f\d+e\d+)$/.test(ref.text)) return undefined;
    const value = ref.text.slice(4);
    if (refs.has(value)) return undefined;
    refs.add(value);
    const base = row.start + payloadStart;
    out.keep(row.start, row.start + indent);
    out.keep(base + ref.start + 5, base + ref.end - 1); out.fixed(" ");
    out.keep(base, base + ref.start); out.keep(base + ref.end, row.end);
  }
  if (previousContainer || refs.size < 2) return undefined;
  out.keep(lines[closeIndex]!.start, source.length);
  return out.finish();
}

function devtools(source: string): Reduction | undefined {
  const header = "## Latest page snapshot\n";
  if (!source.startsWith(header)) return undefined;
  const out = builder(source), refs = new Set<string>();
  out.keep(0, header.length);
  // Native hierarchy: exactly one depth-0 RootWebArea first, then one 2-space level per step.
  let previousDepth = -1;
  for (const row of rows(source, header.length)) {
    const match = /^( *)uid=(\d+_\d+) (.+)$/.exec(row.text);
    if (!match || match[1]!.length % 2 || !scan(match[3]!)) return undefined;
    const depth = match[1]!.length / 2;
    if (previousDepth < 0 ? depth !== 0 || !/^RootWebArea(?: |$)/.test(match[3]!) : depth < 1 || depth > previousDepth + 1) return undefined;
    previousDepth = depth;
    const ref = match[2]!;
    if (refs.has(ref)) return undefined;
    refs.add(ref);
    const indent = match[1]!.length;
    out.keep(row.start, row.start + indent);
    out.keep(row.start + indent + 4, row.end);
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
