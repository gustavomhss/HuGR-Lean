import { tokenizeCommand } from "../core/command.js";
import { parseJson, scalar, type JsonNode } from "../core/structured-json.js";
import type { AutomaticObservation, AutomaticReducer } from "../core/automatic-types.js";
import type { Piece, Reduction, Span } from "../core/types.js";

/** Full lexical evidence, including keys and meaningful empty-container delimiters. */
export function lexicalJson(node: JsonNode, pieces: Piece[], required: Span[]): void {
  if (node.kind === "scalar") { pieces.push(node.span); required.push(node.span); return; }
  if ((node.kind === "array" ? node.items : node.entries).length === 0) {
    const [start, end] = node.span;
    const delimiters: Span[] = [[start, start + 1], [end - 1, end]];
    pieces.push(...delimiters); required.push(...delimiters); return;
  }
  pieces.push({ text: node.kind === "array" ? "[" : "{" });
  if (node.kind === "array") node.items.forEach((item, i) => {
    if (i) pieces.push({ text: "," }); lexicalJson(item, pieces, required);
  });
  else node.entries.forEach((entry, i) => {
    if (i) pieces.push({ text: "," });
    lexicalJson(entry.key, pieces, required); pieces.push({ text: ":" }); lexicalJson(entry.value, pieces, required);
  });
  pieces.push({ text: node.kind === "array" ? "]" : "}" });
}

export function jsonField(node: JsonNode, name: string): JsonNode | undefined {
  return node.kind === "object" ? node.entries.find(entry => entry.name === name)?.value : undefined;
}
export function protocolError(node: JsonNode): boolean {
  const error = jsonField(node, "error");
  return error?.kind === "object" && typeof scalar(jsonField(error, "code")) === "number"
    && typeof scalar(jsonField(error, "message")) === "string"
    && (scalar(jsonField(node, "jsonrpc")) === "2.0"
      || (typeof scalar(jsonField(node, "id")) === "number" && !jsonField(node, "result")));
}
export function jsonCarrier(observation: AutomaticObservation): boolean {
  if (observation.status !== "success" || observation.completeness !== "complete") return false;
  if (observation.source === "mcp") return true;
  if (observation.tool !== "bash" || observation.metadata.exit !== 0 || observation.metadata.truncated !== false
    || typeof observation.args.command !== "string") return false;
  const argv = tokenizeCommand(observation.args.command);
  if (!argv) return false;
  const [executable, ...args] = argv, name = executable!.split("/").at(-1);
  const pair = (flags: string[], value: string) => args.some((arg, i) => flags.includes(arg) && args[i + 1] === value);
  switch (name) {
    case "node": return args.length > 0 && !args.some(arg => arg === "--test" || arg.startsWith("--test="));
    case "python": case "python3": return args.length > 0 && !pair(["-m"], "pytest");
    case "jq": case "curl": return true;
    case "system_profiler": return args.includes("-json");
    case "npm": return ["ls", "list"].includes(args[0] ?? "") && args.includes("--json");
    case "docker": return pair(["--format"], "json") || pair(["--format"], "{{json .}}");
    case "kubectl": return pair(["-o", "--output"], "json");
    case "gh": return args[0] === "api";
    case "powershell": case "pwsh": return args.some(arg => /(?:^|\s)ConvertTo-Json(?:\s|$)/i.test(arg));
    default: return false;
  }
}

/** JSON and NDJSON share one global syntax-node budget, never one budget per record. */
export const reduceAutomaticJson: AutomaticReducer = observation => {
  if (!jsonCarrier(observation) || Buffer.byteLength(observation.output, "utf8") > 16 * 1024 * 1024) return;
  const { output } = observation, pieces: Piece[] = [], required: Span[] = [];
  let budget = 25000;
  const spend = (node: JsonNode): boolean => {
    if (--budget < 0) return false;
    return node.kind === "scalar" || (node.kind === "array" ? node.items.every(spend)
      : node.entries.every(entry => spend(entry.key) && spend(entry.value)));
  };
  const whole = parseJson(output);
  if (whole) {
    if (protocolError(whole) || !spend(whole)) return;
    lexicalJson(whole, pieces, required);
  } else {
    let offset = 0, records = 0;
    for (const line of output.split("\n")) {
      if (offset === output.length && line === "") break;
      if (++records > 25000) return;
      const node = parseJson(line);
      if (!node || protocolError(node) || !spend(node)) return;
      const localPieces: Piece[] = [], localRequired: Span[] = [];
      lexicalJson(node, localPieces, localRequired);
      if (pieces.length) pieces.push({ text: "\n" });
      pieces.push(...localPieces.map(piece => Array.isArray(piece) ? [piece[0] + offset, piece[1] + offset] as Span : piece));
      required.push(...localRequired.map(([start, end]) => [start + offset, end + offset] as Span));
      offset += line.length + 1;
    }
    if (output.endsWith("\n")) pieces.push({ text: "\n" });
  }
  return required.length ? { pieces, required } satisfies Reduction : undefined;
};
