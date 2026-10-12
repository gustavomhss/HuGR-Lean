import { scanJson, scanned } from "./structured-json.js";
import { snapshotAutomaticMetadata } from "./automatic-facts.js";

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
// A protocol error envelope is a top-level JSON object with an "error" member. Without the literal key
// spelling or a \u escape (the only JSON escape that can spell letters), no parse can find one.
function mayBeEnvelope(text: string): boolean {
  let index = 0;
  for (let code = text.charCodeAt(0); code === 32 || code === 9 || code === 10 || code === 13; code = text.charCodeAt(++index));
  return text.charCodeAt(index) === 123 && (text.includes('"error"') || text.includes("\\u"));
}
/** Host clipping notice, JSON-RPC error envelope or a Playwright `### Error` line outside fences. */
export function errorText(text: string): boolean {
  if (/^\.\.\.(?:output truncated|\d+ (?:lines|bytes) truncated)\.\.\./.test(text)) return true;
  // The non-allocating scan decides exactly what parseJson + protocolError decide, without building a tree.
  if (mayBeEnvelope(text) && scanJson(text, 0, 25000) >= 0 && scanned.envelope) return true;
  // Line scan without splitting: a fence line is ``` followed by no further backtick on that line.
  let fenced = false;
  for (let start = 0; start <= text.length;) {
    let end = text.indexOf("\n", start);
    if (end < 0) end = text.length;
    if (text.startsWith("```", start)) {
      const tick = text.indexOf("`", start + 3);
      if (tick < 0 || tick >= end) fenced = !fenced;
    } else if (!fenced && end - start === 9 && text.startsWith("### Error", start)) return true;
    start = end + 1;
  }
  return false;
}
const flagsValid = (metadata: unknown): boolean => metadata === undefined || (record(metadata) &&
  (metadata.truncated === undefined || metadata.truncated === false) &&
  (metadata.exit === undefined || metadata.exit === 0));

export type Packet = { tool: string; args: Readonly<Record<string, unknown>>; metadata: unknown; content: unknown[]; items: unknown[];
  copies: Readonly<Record<string, unknown>>[]; segments: { index: number; text: string }[]; texts: Map<number, string> };

/** Reads every caller-owned field once into plain frozen copies and validates the whole packet. */
export function readPacket(input: Record<string, unknown>, output: Record<string, unknown>, limit: number): Packet | undefined {
  const { tool, args: actualArgs } = input, { isError, content, metadata: actualMetadata, _meta: actualMeta } = output;
  const metadata = record(actualMetadata) ? snapshotAutomaticMetadata(actualMetadata) : actualMetadata;
  const meta = record(actualMeta) ? snapshotAutomaticMetadata(actualMeta) : actualMeta;
  if (typeof tool !== "string" || !tool.length || !record(actualArgs) ||
      (isError !== undefined && isError !== false) || !flagsValid(metadata) || !flagsValid(meta)) return;
  const args = Object.freeze({ ...actualArgs });
  if (!Array.isArray(content)) return;
  const length = content.length;
  if (!Number.isSafeInteger(length) || length < 1 || length > 64) return;
  const items: unknown[] = [], copies: Readonly<Record<string, unknown>>[] = [];
  const segments: { index: number; text: string }[] = [], texts = new Map<number, string>();
  let bytes = 0;
  const append = (index: number, text: string) => {
    bytes += Buffer.byteLength(text, "utf8") + (segments.length ? 2 : 0);
    if (bytes > limit) return false;
    segments.push({ index, text }); return true;
  };
  for (let index = 0; index < length; index++) {
    const block = content[index];
    if (!record(block)) return;
    const copy = Object.freeze({ ...block }), type = copy.type;
    items.push(block); copies.push(copy);
    if (typeof type !== "string") return;
    if (type === "text") {
      const text = copy.text;
      if (typeof text !== "string" || !append(index, text)) return;
      texts.set(index, text);
    } else if (type === "resource") {
      if (!record(copy.resource)) return;
      const { uri, blob, text } = copy.resource;
      if (typeof uri !== "string" || blob !== undefined || (text !== undefined && typeof text !== "string")) return;
      if (text && !append(-1, text)) return;
    } else if (type === "image" || type === "audio") {
      if (typeof copy.data !== "string" || typeof copy.mimeType !== "string") return;
    } else if (type !== "resource_link" || typeof copy.uri !== "string" || typeof copy.name !== "string") return;
  }
  return { tool, args, metadata, content, items, copies, segments, texts };
}
