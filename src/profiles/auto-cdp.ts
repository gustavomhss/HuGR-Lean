import { parseJson, scalar, type JsonNode } from "../core/structured-json.js";
import type { AutomaticReducer } from "../core/automatic-types.js";
import type { Piece, Span } from "../core/types.js";
import { jsonCarrier, jsonField, lexicalJson, protocolError } from "./auto-json.js";

/** Native AX nodes only; sparse cells preserve absence separately from null/empty values. */
export const reduceAutomaticCdp: AutomaticReducer = observation => {
  if (!jsonCarrier(observation) || Buffer.byteLength(observation.output, "utf8") > 16 * 1024 * 1024) return;
  const root = parseJson(observation.output);
  if (!root || protocolError(root)) return;
  const result = jsonField(root, "result");
  const nodes = jsonField(root, "nodes") ?? (jsonField(root, "id") ? result && jsonField(result, "nodes") : undefined);
  if (nodes?.kind !== "array" || nodes.items.length === 0 || !nodes.items.every(node => node.kind === "object"
    && typeof scalar(jsonField(node, "nodeId")) === "string")) return;
  const keys = new Map<string, JsonNode>(), edges = new Map<string, Set<string>>(), incoming = new Map<string, number>();
  for (const node of nodes.items) {
    if (node.kind !== "object") return;
    let previous: string | undefined;
    for (const entry of node.entries) {
      // Sparse rows must reconstruct each node's original field order and key lexemes.
      const key = keys.get(entry.name);
      if (key && observation.output.slice(...key.span) !== observation.output.slice(...entry.key.span)) return;
      if (!key) { keys.set(entry.name, entry.key); edges.set(entry.name, new Set()); incoming.set(entry.name, 0); }
      if (previous !== undefined && !edges.get(previous)!.has(entry.name)) {
        edges.get(previous)!.add(entry.name); incoming.set(entry.name, incoming.get(entry.name)! + 1);
      }
      previous = entry.name;
    }
  }
  const ready = [...keys.keys()].filter(name => incoming.get(name) === 0), columns: { name: string; key: JsonNode }[] = [];
  for (let i = 0; i < ready.length; i++) {
    const name = ready[i]!; columns.push({ name, key: keys.get(name)! });
    for (const next of edges.get(name)!) {
      incoming.set(next, incoming.get(next)! - 1);
      if (incoming.get(next) === 0) ready.push(next);
    }
  }
  if (columns.length !== keys.size) return;
  // Bound sparse expansion as well as parser work.
  if (columns.length * nodes.items.length > 25000) return;
  const rows = nodes.items;
  const pieces: Piece[] = [], required: Span[] = [];
  function emit(node: JsonNode): void {
    if (node === nodes) {
      pieces.push({ text: "{" }, { text: '"columns":' }, { text: "[" });
      columns.forEach((column, i) => { if (i) pieces.push({ text: "," }); lexicalJson(column.key, pieces, required); });
      pieces.push({ text: "]" }, { text: "," }, { text: '"rows":' }, { text: "[" });
      rows.forEach((row, i) => {
        const values = new Map(row.kind === "object" ? row.entries.map(entry => [entry.name, entry.value]) : []);
        if (i) pieces.push({ text: "," }); pieces.push({ text: "[" });
        columns.forEach((column, j) => {
          if (j) pieces.push({ text: "," }); pieces.push({ text: "[" });
          const value = values.get(column.name);
          if (value) lexicalJson(value, pieces, required);
          pieces.push({ text: "]" });
        });
        pieces.push({ text: "]" });
      });
      pieces.push({ text: "]" }, { text: "," }, { text: '"cellEncoding":"optional"' }, { text: "}" });
    } else if (node.kind === "object") {
      if (!node.entries.length) { lexicalJson(node, pieces, required); return; }
      pieces.push({ text: "{" });
      node.entries.forEach((entry, i) => {
        if (i) pieces.push({ text: "," }); lexicalJson(entry.key, pieces, required); pieces.push({ text: ":" }); emit(entry.value);
      });
      pieces.push({ text: "}" });
    } else lexicalJson(node, pieces, required);
  }
  emit(root);
  return { pieces, required };
};
