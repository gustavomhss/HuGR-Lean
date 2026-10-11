import type { filterAutomatic } from "../core/automatic.js";
import { parseJson } from "../core/structured-json.js";
import { protocolError } from "../profiles/auto-json.js";

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
function errorText(text: string): boolean {
  if (/^\.\.\.(?:output truncated|\d+ (?:lines|bytes) truncated)\.\.\./.test(text)) return true;
  const json = parseJson(text);
  if (json && protocolError(json)) return true;
  let fenced = false;
  for (const line of text.split("\n")) {
    if (/^```[^`]*$/.test(line)) fenced = !fenced;
    else if (!fenced && line === "### Error") return true;
  }
  return false;
}
const flagsValid = (metadata: unknown): boolean => metadata === undefined || (record(metadata) &&
  (metadata.truncated === undefined || metadata.truncated === false) &&
  (metadata.exit === undefined || metadata.exit === 0));

type Packet = { tool: string; args: Readonly<Record<string, unknown>>; metadata: unknown; content: unknown[]; items: unknown[];
  copies: Readonly<Record<string, unknown>>[]; segments: { index: number; text: string }[]; texts: Map<number, string> };

/** Reads every caller-owned field once into plain frozen copies and validates the whole packet. */
function readPacket(input: Record<string, unknown>, output: Record<string, unknown>, limit: number): Packet | undefined {
  const { tool, args: actualArgs } = input, { isError, content, metadata: actualMetadata, _meta: actualMeta } = output;
  const metadata = record(actualMetadata) ? Object.freeze({ ...actualMetadata }) : actualMetadata;
  const meta = record(actualMeta) ? Object.freeze({ ...actualMeta }) : actualMeta;
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

/** OpenCode 1.18.17 passes native decoded MCP content BEFORE host text joining/truncation. */
export async function filterMcpResult(input: Record<string, unknown>, output: Record<string, unknown>,
  process: typeof filterAutomatic, maxInputBytes: number | undefined, save?: (text: string) => Promise<unknown>): Promise<void> {
  const limit = maxInputBytes ?? 4 * 1024 * 1024;
  if (!Number.isSafeInteger(limit) || limit < 1024 * 1024 || limit > 16 * 1024 * 1024) return;
  const packet = readPacket(input, output, limit);
  if (!packet) return;
  const { tool, args, metadata, segments, texts } = packet;
  const original = segments.map(segment => segment.text).join("\n\n"), beforeBytes = Buffer.byteLength(original, "utf8");
  if (beforeBytes > limit || !texts.size) return;
  if ([...texts.values()].some(errorText)) return;
  const candidates = new Map<number, string>();
  for (const [index, text] of texts) {
    const result = process({ source: "mcp", tool, args, output: text,
      metadata: record(metadata) ? metadata : {}, status: "success", completeness: "complete" },
      maxInputBytes === undefined ? {} : { maxInputBytes });
    if (result.status !== "reduced" && result.status !== "normalized") continue;
    const inputBytes = Buffer.byteLength(text, "utf8"), outputBytes = Buffer.byteLength(result.replacement, "utf8");
    if (result.inputBytes !== inputBytes || result.outputBytes !== outputBytes || !result.replacement.length || outputBytes >= inputBytes ||
        (result.status === "reduced" && (!result.profile || typeof result.profile !== "string"))) return;
    candidates.set(index, result.replacement);
  }
  if (!candidates.size) return;
  const after = segments.map(({ index, text }) => candidates.get(index) ?? text).join("\n\n");
  const afterBytes = Buffer.byteLength(after, "utf8");
  if (afterBytes >= beforeBytes) return;
  if (save && beforeBytes - afterBytes >= 1024 && (beforeBytes - afterBytes) / beforeBytes >= 0.1) await save(original);
  // Revalidate the live packet in full: the host may have changed anything while persistence awaited.
  // Commit only when it is still the same array, every slot is the validated block and all text is unchanged.
  const live = readPacket(input, output, limit);
  const sameArgs = (left: Readonly<Record<string, unknown>>, right: Readonly<Record<string, unknown>>) => {
    const keys = Object.keys(left);
    return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && Object.is(left[key], right[key]));
  };
  if (!live || live.tool !== tool || !sameArgs(live.args, args) || live.content !== packet.content || live.items.length !== packet.items.length ||
      live.items.some((item, index) => item !== packet.items[index]) || live.segments.length !== segments.length ||
      live.segments.some((segment, index) => segment.index !== segments[index]!.index || segment.text !== segments[index]!.text)) return;
  // Candidate blocks are rebuilt from their live copies so in-place host additions such as annotations survive.
  const changed = live.items.map((item, index) => {
    const replacement = candidates.get(index);
    return replacement === undefined ? item : { ...live.copies[index]!, text: replacement };
  });
  // One assignment, after all validation and persistence; no partial block mutation.
  output.content = changed;
}
