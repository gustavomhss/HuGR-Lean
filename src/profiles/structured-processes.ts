import { fields, nonnegativeInteger, parseJson, scalar, valueSpans } from "../core/structured-json.js";
import type { StructuredReducer } from "../core/structured-types.js";
import type { Piece, Reduction, Span } from "../core/types.js";

const KEYS = ["pid", "ppid", "state", "command"] as const;
const nonempty = (value: unknown) => typeof value === "string" && value.length > 0;

function jsonProcesses(output: string): Reduction | undefined {
  const root = parseJson(output);
  if (root?.kind !== "array" || root.items.length === 0) return undefined;
  const pieces: Piece[] = [], required: Span[] = [];
  for (const [index, row] of root.items.entries()) {
    const values = fields(row, KEYS, KEYS);
    if (!values || row.kind !== "object" || row.entries.some((entry, i) => entry.name !== KEYS[i])) return undefined;
    if (nonnegativeInteger(values.get("pid"), output) === undefined || nonnegativeInteger(values.get("ppid"), output) === undefined ||
        !nonempty(scalar(values.get("state"))) || !nonempty(scalar(values.get("command")))) return undefined;
    if (index === 0) {
      row.entries.forEach((entry, i) => {
        if (i) pieces.push({ text: "\t" });
        pieces.push(entry.key.span);
        required.push(entry.key.span);
      });
    }
    pieces.push({ text: "\n" });
    row.entries.forEach((entry, i) => {
      if (i) pieces.push({ text: "\t" });
      pieces.push(entry.value.span);
    });
    required.push(...valueSpans(row));
  }
  return { pieces, required };
}

/** Darwin /bin/ps -axo pid,ppid,stat,comm: five-column IDs, four-column state.
 * COMM header and layout verified by the opt-in native test's exact stdout receipt.
 * No inferred flags, COMMAND variant, token splitting of command, or host I/O.
 */
function nativeProcesses(output: string): Reduction | undefined {
  if (output.length > 4 * 1024 * 1024 || !output.endsWith("\n") || /[\r\t\x00-\x08\x0b-\x1f\x7f]/.test(output)) return undefined;
  const lines = output.slice(0, -1).split("\n");
  if (lines[0] !== "  PID  PPID STAT COMM" || lines.length < 2 || lines.length > 4097) return undefined;
  const header: Span[] = [[2, 5], [7, 11], [12, 16], [17, 21]];
  const pieces: Piece[] = [], required: Span[] = [...header];
  header.forEach((span, i) => { if (i) pieces.push({ text: "\t" }); pieces.push(span); });
  let offset = lines[0].length + 1;
  for (const line of lines.slice(1)) {
    // Fixed boundaries retain even leading/trailing spaces in COMM. Long state
    // tokens overflow the native column and are deliberately unsupported.
    if (line.length < 18 || line[5] !== " " || line[11] !== " " || line[16] !== " ") return undefined;
    const pid = line.slice(0, 5), ppid = line.slice(6, 11), state = line.slice(12, 16);
    if (!/^ *(?:0|[1-9]\d*)$/.test(pid) || !/^ *(?:0|[1-9]\d*)$/.test(ppid) ||
        !/^[IRSTUVWZ][<N+LsEXW-]* *$/.test(state) || !line.slice(17).trim()) return undefined;
    const spans: Span[] = [
      [offset + pid.search(/\d/), offset + 5],
      [offset + 6 + ppid.search(/\d/), offset + 11],
      [offset + 12, offset + 12 + state.trimEnd().length],
      [offset + 17, offset + line.length],
    ];
    pieces.push({ text: "\n" });
    spans.forEach((span, i) => { if (i) pieces.push({ text: "\t" }); pieces.push(span); });
    required.push(...spans);
    offset += line.length + 1;
  }
  return { pieces, required };
}

export const reduceProcesses: StructuredReducer = output => jsonProcesses(output) ?? nativeProcesses(output);
