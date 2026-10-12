import type { filterAutomatic } from "../core/automatic.js";
import { readPacket } from "../core/automatic-mcp-packet.js";
import { transformAutomaticMcpPacket } from "../core/automatic-mcp.js";
export { errorText } from "../core/automatic-mcp-packet.js";

/** OpenCode 1.18.17 passes native decoded MCP content BEFORE host text joining/truncation. */
export async function filterMcpResult(input: Record<string, unknown>, output: Record<string, unknown>,
  process: typeof filterAutomatic, maxInputBytes: number | undefined, save?: (text: string) => Promise<unknown>): Promise<void> {
  const limit = maxInputBytes ?? 4 * 1024 * 1024;
  if (!Number.isSafeInteger(limit) || limit < 1024 * 1024 || limit > 16 * 1024 * 1024) return;
  const packet = readPacket(input, output, limit);
  if (!packet) return;
  const transformed = transformAutomaticMcpPacket(packet, maxInputBytes === undefined ? {} : { maxInputBytes }, process);
  if (transformed.result.status !== "reduced" || !transformed.content || transformed.originalText === undefined) return;
  const { tool, args, segments } = packet;
  const { inputBytes: beforeBytes, outputBytes: afterBytes } = transformed.result;
  const candidates = new Map<number, string>();
  for (const block of transformed.blocks) {
    if (block.outputBytes < block.inputBytes) candidates.set(block.index, (transformed.content[block.index] as { text: string }).text);
  }
  if (save && beforeBytes - afterBytes >= 1024 && (beforeBytes - afterBytes) / beforeBytes >= 0.1) await save(transformed.originalText);
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
