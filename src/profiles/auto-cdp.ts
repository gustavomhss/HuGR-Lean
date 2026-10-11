import { scalar, type JsonNode } from "../core/structured-json.js";
import type { AutomaticReducer } from "../core/automatic-types.js";
import type { Piece, Span } from "../core/types.js";
import { JSON_TEXT, emitLexical, jsonCarrier, jsonField, jsonSectionRoot, overByteLimit, protocolError, wrapperPrefix, wrapperSuffix } from "./auto-json.js";

const { openArray, closeArray, openObject, closeObject, comma, colon } = JSON_TEXT;
const columnsLabel: Piece = Object.freeze({ text: '"columns":' }), rowsLabel: Piece = Object.freeze({ text: '"rows":' });
const cellEncoding: Piece = Object.freeze({ text: '"cellEncoding":"optional"' });

/** Native AX nodes only; sparse cells preserve absence separately from null/empty values. */
export const reduceAutomaticCdp: AutomaticReducer = observation => {
  if (!jsonCarrier(observation) || overByteLimit(observation.output)) return;
  const parsed = jsonSectionRoot(observation);
  if (!parsed) return;
  const { section, root } = parsed, source = section.output;
  if (!root || protocolError(root)) return;
  const result = jsonField(root, "result");
  const accessibility = jsonField(root, "accessibility");
  const nodes = jsonField(root, "nodes") ?? (jsonField(root, "id") ? result && jsonField(result, "nodes") : undefined)
    ?? (accessibility && jsonField(accessibility, "nodes"));
  if (nodes?.kind !== "array" || nodes.items.length === 0) return;
  // One pass per node: unique nonempty string nodeId, boolean ignored, consistent key lexemes and field order.
  const ids = new Set<string>(), keys = new Map<string, { key: JsonNode; lexeme: string }>();
  const edges = new Map<string, Set<string>>(), incoming = new Map<string, number>();
  for (const node of nodes.items) {
    if (node.kind !== "object") return;
    let previous: string | undefined, nodeId: JsonNode | undefined, ignored: JsonNode | undefined;
    for (const entry of node.entries) {
      if (entry.name === "nodeId") nodeId = entry.value;
      else if (entry.name === "ignored") ignored = entry.value;
      // Sparse rows must reconstruct each node's original field order and key lexemes.
      const known = keys.get(entry.name), [start, end] = entry.key.span;
      if (known) {
        if (end - start !== known.lexeme.length || !source.startsWith(known.lexeme, start)) return;
      } else {
        keys.set(entry.name, { key: entry.key, lexeme: source.slice(start, end) });
        edges.set(entry.name, new Set()); incoming.set(entry.name, 0);
      }
      if (previous !== undefined && !edges.get(previous)!.has(entry.name)) {
        edges.get(previous)!.add(entry.name); incoming.set(entry.name, incoming.get(entry.name)! + 1);
      }
      previous = entry.name;
    }
    const id = scalar(nodeId);
    if (typeof id !== "string" || !id.length || ids.has(id) || typeof scalar(ignored) !== "boolean") return;
    ids.add(id);
  }
  const ready = [...keys.keys()].filter(name => incoming.get(name) === 0), columns: { name: string; key: JsonNode }[] = [];
  for (let i = 0; i < ready.length; i++) {
    const name = ready[i]!; columns.push({ name, key: keys.get(name)!.key });
    for (const next of edges.get(name)!) {
      incoming.set(next, incoming.get(next)! - 1);
      if (incoming.get(next) === 0) ready.push(next);
    }
  }
  if (columns.length !== keys.size) return;
  // Bound sparse expansion as well as parser work.
  if (columns.length * nodes.items.length > 25000) return;
  const rows = nodes.items, offset = section.start, pieces: Piece[] = [], required: Span[] = [];
  const [nodesStart, nodesEnd] = nodes.span;
  wrapperPrefix(section, pieces, required);
  const lexical = (node: JsonNode) => { emitLexical(node, pieces, required, offset); };
  function table(): boolean {
    pieces.push(openObject, columnsLabel, openArray);
    for (let i = 0; i < columns.length; i++) { if (i) pieces.push(comma); lexical(columns[i]!.key); }
    pieces.push(closeArray, comma, rowsLabel, openArray);
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      if (row.kind !== "object") return false;
      // Topological columns respect every row's field order, so each row's entries appear in column order.
      const entries = row.entries;
      let next = 0;
      if (i) pieces.push(comma);
      pieces.push(openArray);
      for (let j = 0; j < columns.length; j++) {
        if (j) pieces.push(comma);
        pieces.push(openArray);
        const entry = entries[next];
        if (entry !== undefined && entry.name === columns[j]!.name) { lexical(entry.value); next++; }
        pieces.push(closeArray);
      }
      if (next !== entries.length) return false;
      pieces.push(closeArray);
    }
    pieces.push(closeArray, comma, cellEncoding, closeObject);
    return true;
  }
  // Only objects enclosing the nodes array are walked; every other value is plain lexical evidence.
  function emit(node: JsonNode): boolean {
    if (node === nodes) return table();
    if (node.kind !== "object" || !node.entries.length || node.span[0] > nodesStart || node.span[1] < nodesEnd) { lexical(node); return true; }
    pieces.push(openObject);
    for (let i = 0; i < node.entries.length; i++) {
      const entry = node.entries[i]!;
      if (i) pieces.push(comma);
      lexical(entry.key); pieces.push(colon);
      if (!emit(entry.value)) return false;
    }
    pieces.push(closeObject);
    return true;
  }
  if (!emit(root)) return;
  wrapperSuffix(section, observation.output.length, pieces, required);
  return { pieces, required };
};
