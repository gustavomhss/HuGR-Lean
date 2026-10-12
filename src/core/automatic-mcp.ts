import { filterAutomatic } from "./automatic.js";
import { classifyAutomaticSnapshot } from "./automatic-classify.js";
import { errorText, readPacket, type Packet } from "./automatic-mcp-packet.js";
import type { AutomaticFamilyId, AutomaticObservation, AutomaticOptions } from "./automatic-types.js";
import type { FilterResult } from "./types.js";

export interface AutomaticMcpBlock {
  readonly index: number;
  readonly family?: AutomaticFamilyId;
  readonly inputBytes: number;
  readonly outputBytes: number;
}
export interface AutomaticMcpResult {
  /** Aggregate UTF-8 metrics include resource text and the host's two-LF separators. */
  readonly result: FilterResult;
  readonly blocks: readonly AutomaticMcpBlock[];
  /** Validated aggregate text, for optional host persistence. */
  readonly originalText?: string;
  /** Present only after every text block succeeds; assign atomically in the host. */
  readonly content?: readonly unknown[];
}
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

/** Internal shared transform; the adapter retains the packet snapshot for its live commit check. */
export function transformAutomaticMcpPacket(packet: Packet, options: AutomaticOptions,
  process: typeof filterAutomatic = filterAutomatic): AutomaticMcpResult {
  const { tool, args, metadata, segments, texts } = packet;
  const originalText = segments.map(segment => segment.text).join("\n\n"), inputBytes = Buffer.byteLength(originalText, "utf8");
  let blocks: AutomaticMcpBlock[] = [];
  const unchanged = (status: "passthrough" | "failed_open", reason: string): AutomaticMcpResult => ({
    result: { status, reason, inputBytes, outputBytes: inputBytes }, originalText,
    blocks: blocks.map(block => ({ ...block, outputBytes: block.inputBytes })),
  });
  try {
    const observations = [...texts].map(([index, output]) => ({ index, observation: Object.freeze({ source: "mcp", tool, args, output,
      metadata: record(metadata) ? metadata : {}, status: "success", completeness: "complete" }) as AutomaticObservation }));
    // Complete packet validation and failure checks precede classification or any reducer call.
    blocks = observations.map(({ index, observation }) => ({ index,
      inputBytes: Buffer.byteLength(observation.output, "utf8"), outputBytes: Buffer.byteLength(observation.output, "utf8") }));
    if (!texts.size) return unchanged("passthrough", "no_text_blocks");
    if ([...texts.values()].some(errorText)) return unchanged("passthrough", "mcp_error_text");
    blocks = observations.map(({ index, observation }) => {
      const family = classifyAutomaticSnapshot(observation), bytes = Buffer.byteLength(observation.output, "utf8");
      return { index, ...(family === undefined ? {} : { family }), inputBytes: bytes, outputBytes: bytes };
    });
    const family = blocks[0]!.family;
    if (!family || blocks.some(block => block.family !== family)) return unchanged("passthrough", "heterogeneous_or_unknown_mcp_family");
    const candidates = new Map<number, string>();
    for (let slot = 0; slot < observations.length; slot++) {
      const { index, observation } = observations[slot]!, result = process(observation, options);
      if (result.status === "failed_open") return unchanged("failed_open", "mcp_block_failed_open");
      if (result.status === "passthrough") continue;
      if (result.status !== "reduced" && result.status !== "normalized") return unchanged("failed_open", "invalid_mcp_block_result");
      const outputBytes = typeof result.replacement === "string" ? Buffer.byteLength(result.replacement, "utf8") : -1;
      if (result.inputBytes !== blocks[slot]!.inputBytes || result.outputBytes !== outputBytes || !result.replacement.length ||
          outputBytes < 0 || outputBytes >= result.inputBytes || (result.status === "reduced" && (typeof result.profile !== "string" || !result.profile)))
        return unchanged("failed_open", "invalid_mcp_block_result");
      candidates.set(index, result.replacement);
      blocks[slot] = { ...blocks[slot]!, outputBytes };
    }
    if (!candidates.size) return unchanged("passthrough", "unsupported_or_not_smaller");
    const replacement = segments.map(({ index, text }) => candidates.get(index) ?? text).join("\n\n");
    const outputBytes = Buffer.byteLength(replacement, "utf8");
    if (outputBytes >= inputBytes) return unchanged("passthrough", "unsupported_or_not_smaller");
    return { result: { status: "reduced", reason: "automatic_mcp_view", profile: family, replacement, inputBytes, outputBytes }, blocks, originalText,
      content: packet.items.map((item, index) => candidates.has(index) ? { ...packet.copies[index]!, text: candidates.get(index)! } : item) };
  } catch { return unchanged("failed_open", "invalid_mcp_input_or_reduction"); }
}

/** Pure synchronous decoded-MCP helper. No persistence, host assignment, or I/O. */
export function filterAutomaticMcp(input: unknown, output: unknown, options: AutomaticOptions = {}): AutomaticMcpResult {
  const unchanged = (status: "passthrough" | "failed_open", reason: string): AutomaticMcpResult => ({
    result: { status, reason, inputBytes: 0, outputBytes: 0 }, blocks: [],
  });
  try {
    if (!record(options)) return unchanged("failed_open", "invalid_mcp_options");
    const { maxInputBytes: limit = 4 * 1024 * 1024 } = options;
    if (typeof limit !== "number" || !Number.isSafeInteger(limit) || limit < 1024 * 1024 || limit > 16 * 1024 * 1024) return unchanged("failed_open", "invalid_mcp_options");
    if (!record(input) || !record(output)) return unchanged("passthrough", "invalid_mcp_packet");
    const packet = readPacket(input, output, limit);
    return packet ? transformAutomaticMcpPacket(packet, options) : unchanged("passthrough", "invalid_mcp_packet");
  } catch { return unchanged("failed_open", "invalid_mcp_input_or_reduction"); }
}
