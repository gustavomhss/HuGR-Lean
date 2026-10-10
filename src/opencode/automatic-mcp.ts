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

/** OpenCode 1.18.17 passes native decoded MCP content BEFORE host text joining/truncation. */
export async function filterMcpResult(input: Record<string, unknown>, output: Record<string, unknown>,
  process: typeof filterAutomatic, maxInputBytes: number | undefined, save?: (text: string) => Promise<unknown>): Promise<void> {
  const { tool, args } = input, { isError, content, metadata: actualMetadata, _meta: actualMeta } = output;
  const metadata = record(actualMetadata) ? Object.freeze({ ...actualMetadata }) : actualMetadata;
  const meta = record(actualMeta) ? Object.freeze({ ...actualMeta }) : actualMeta;
  if (typeof tool !== "string" || !tool.length || !record(args) ||
      (isError !== undefined && isError !== false) || !flagsValid(metadata) || !flagsValid(meta)) return;
  if (!Array.isArray(content) || !content.length || content.length > 64) return;
  const limit = maxInputBytes ?? 4 * 1024 * 1024;
  if (!Number.isSafeInteger(limit) || limit < 1024 * 1024 || limit > 16 * 1024 * 1024) return;
  const parts: string[] = [], texts = new Map<number, string>();
  let bytes = 0;
  const append = (text: string) => { bytes += Buffer.byteLength(text, "utf8") + (parts.length ? 2 : 0); if (bytes > limit) return false; parts.push(text); return true; };
  for (const [index, block] of content.entries()) {
    if (!record(block) || typeof block.type !== "string") return;
    if (block.type === "text") {
      const text = block.text;
      if (typeof text !== "string" || !append(text)) return;
      texts.set(index, text);
    } else if (block.type === "resource") {
      if (!record(block.resource) || typeof block.resource.uri !== "string" || block.resource.blob !== undefined ||
          (block.resource.text !== undefined && typeof block.resource.text !== "string")) return;
      if (block.resource.text && !append(block.resource.text as string)) return;
    } else if (block.type === "image" || block.type === "audio") {
      if (typeof block.data !== "string" || typeof block.mimeType !== "string") return;
    } else if (block.type !== "resource_link" || typeof block.uri !== "string" || typeof block.name !== "string") return;
  }
  const original = parts.join("\n\n"), beforeBytes = Buffer.byteLength(original, "utf8");
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
  const changed = content.map((block, index) => candidates.has(index) ? { ...block, text: candidates.get(index)! } : block);
  const after = changed.flatMap(block => block.type === "text" ? [block.text as string] :
    block.type === "resource" && block.resource.text ? [block.resource.text as string] : []).join("\n\n");
  const afterBytes = Buffer.byteLength(after, "utf8");
  if (afterBytes >= beforeBytes) return;
  if (save && beforeBytes - afterBytes >= 1024 && (beforeBytes - afterBytes) / beforeBytes >= 0.1) await save(original);
  if (output.content !== content || [...texts].some(([index, text]) => content[index].text !== text)) return;
  // One assignment, after all validation and persistence; no partial block mutation.
  output.content = changed;
}
