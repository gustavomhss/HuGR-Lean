import { tokenizeAutomaticCommand } from "./automatic-command.js";
import { profiles } from "../profiles/index.js";
import { snapshotAutomaticMetadata } from "./automatic-facts.js";
import { isAutomaticJsonProducer, jsonSectionScan } from "../profiles/auto-json.js";
import { KEY_ESCAPED, scanJson, scanned, stringIs, type JsonRecords } from "./structured-json.js";
import type { AutomaticFamilyId, AutomaticObservation } from "./automatic-types.js";

/** Recognize the CDP carrier, even when its nodes would fail the reduction grammar. */
function cdpShape(text: string, records: JsonRecords): boolean {
  const { count, depth, parent, keyStart, keyEnd, valueStart, flags } = records;
  if (!count || text[valueStart[0]!] !== "{") return false;
  const member = (owner: number, name: string): number => {
    for (let slot = owner + 1; slot < count && depth[slot]! > depth[owner]!; slot++) {
      if (depth[slot] === depth[owner]! + 1 && parent[slot] === valueStart[owner] &&
          stringIs(text, keyStart[slot]!, keyEnd[slot]!, (flags[slot]! & KEY_ESCAPED) !== 0, name)) return slot;
    }
    return -1;
  };
  let nodes = member(0, "nodes");
  if (nodes < 0 && member(0, "id") >= 0) {
    const result = member(0, "result");
    if (result >= 0 && text[valueStart[result]!] === "{") nodes = member(result, "nodes");
  }
  if (nodes < 0) {
    const accessibility = member(0, "accessibility");
    if (accessibility >= 0 && text[valueStart[accessibility]!] === "{") nodes = member(accessibility, "nodes");
  }
  return nodes >= 0 && text[valueStart[nodes]!] === "[";
}

/** Internal snapshot classifier. Identity is independent of settings and reduction success. */
export function classifyAutomaticSnapshot(observation: AutomaticObservation): AutomaticFamilyId | undefined {
  const { source, tool, args, output } = observation;
  if (source === "native") {
    if (tool === "glob") return "native-glob";
    if (tool === "grep") return "native-grep";
    if (tool === "read") return output.includes("<type>directory</type>") ? "native-read-directory" : undefined;
    if (tool !== "bash" || typeof args.command !== "string") return;
    const argv = tokenizeAutomaticCommand(args.command);
    if (!argv) return;
    const legacy = profiles.filter(profile => profile.match(argv));
    if (legacy.length) return legacy.length === 1 ? `legacy:${legacy[0]!.id}` : undefined;
    const name = argv[0]!.split("/").at(-1);
    if (name === "ps") return "cli-ps";
    if (name === "ls") return "cli-ls";
    if (name === "ffmpeg") return "cli-ffmpeg";
    if (isAutomaticJsonProducer(argv)) return "cli-json-producers";
    return;
  }
  if (source !== "mcp") return;
  if (tool === "browser_snapshot" || tool.endsWith("_browser_snapshot")) return "mcp-browser-snapshot";
  if (tool === "take_snapshot" || tool.endsWith("_take_snapshot")) return "mcp-devtools-snapshot";
  const scan = jsonSectionScan(observation);
  if (scan?.valid) return cdpShape(scan.section.output, scan.records!) ? "mcp-cdp-accessibility" : "mcp-json";
  // NDJSON is a separate whole grammar; never infer a family from a partially parsed record.
  if (!scan || scan.section.start || scan.section.end !== output.length || !output.includes("\n")) return;
  let records = 0, left = 25000;
  const lines = output.split("\n");
  if (lines.at(-1) === "") lines.pop();
  for (const line of lines) {
    if (++records > 25000 || scanJson(line, 0, left) < 0) return;
    left -= scanned.nodes;
  }
  if (records) return "mcp-json";
  return;
}

/** Deterministic, setting-independent recognition. Unknown or malformed observations have no family. */
export function classifyAutomatic(observation: AutomaticObservation): AutomaticFamilyId | undefined {
  try {
    const { source, tool, output, args, metadata, status, completeness } = observation;
    if (!["native", "mcp"].includes(source) || typeof tool !== "string" || !tool || typeof output !== "string" ||
        !args || typeof args !== "object" || Array.isArray(args) || !metadata || typeof metadata !== "object" || Array.isArray(metadata) ||
        !["success", "failure", "unknown"].includes(status) || !["complete", "truncated", "unknown"].includes(completeness)) return;
    return classifyAutomaticSnapshot(Object.freeze({ source, tool, output, status, completeness,
      args: Object.freeze({ ...args }), metadata: snapshotAutomaticMetadata(metadata) }));
  } catch { return; }
}
