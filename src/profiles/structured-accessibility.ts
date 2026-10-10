import { compactPieces, fields, parseJson, scalar, valueSpans, type JsonNode } from "../core/structured-json.js";
import type { StructuredReducer } from "../core/structured-types.js";
import type { Piece, Span } from "../core/types.js";

const columns = ["ref", "parent", "role", "name", "states", "actions", "value", "bounds", "description"] as const;
const requiredFields = columns.slice(0, 4);
const stringArray = (node: JsonNode): boolean => node.kind === "array" && node.items.every(item => typeof scalar(item) === "string");

/** HuGR-Lean flat accessibility interchange view; no native GUI compatibility implied. */
export const reduceAccessibility: StructuredReducer = output => {
  const document = parseJson(output);
  if (!document) return undefined;
  const envelope = fields(document, ["schema", "root", "nodes"], ["schema", "root", "nodes"]);
  if (!envelope || scalar(envelope.get("schema")) !== "hugr-lean/a11y-v1") return undefined;
  const root = scalar(envelope.get("root")), nodes = envelope.get("nodes");
  if (typeof root !== "string" || nodes?.kind !== "array" || !nodes.items.length) return undefined;

  const rows: ReadonlyMap<string, JsonNode>[] = [];
  const refs = new Map<string, string | null>();
  const headers = new Map<string, JsonNode>();
  for (const node of nodes.items) {
    const row = fields(node, columns, requiredFields);
    if (!row || node.kind !== "object") return undefined;
    const ref = scalar(row.get("ref")), parent = scalar(row.get("parent"));
    if (typeof ref !== "string" || refs.has(ref) || (parent !== null && typeof parent !== "string")) return undefined;
    if (typeof scalar(row.get("role")) !== "string" || typeof scalar(row.get("name")) !== "string") return undefined;
    for (const key of ["states", "actions"]) {
      const cell = row.get(key);
      if (cell && !stringArray(cell)) return undefined;
    }
    const value = row.get("value"), bounds = row.get("bounds"), description = row.get("description");
    if (value && (value.kind !== "scalar" || (typeof value.value === "number" && !Number.isFinite(value.value)))) return undefined;
    if (bounds && (bounds.kind !== "array" || bounds.items.length !== 4 || !bounds.items.every(item => typeof scalar(item) === "number" && Number.isFinite(scalar(item))))) return undefined;
    if (description && typeof scalar(description) !== "string") return undefined;
    refs.set(ref, parent);
    rows.push(row);
    for (const entry of node.entries) if (!headers.has(entry.name)) headers.set(entry.name, entry.key);
  }
  if (!refs.has(root) || refs.get(root) !== null) return undefined;
  const children = new Map<string, string[]>();
  for (const [ref, parent] of refs) {
    if (ref === root) continue;
    if (parent === null || !refs.has(parent)) return undefined;
    const siblings = children.get(parent) ?? [];
    siblings.push(ref);
    children.set(parent, siblings);
  }
  // Every node has exactly one parent. Root reachability therefore also rules out cycles.
  const queue = [root];
  for (let index = 0; index < queue.length; index++) {
    for (const child of children.get(queue[index]!) ?? []) queue.push(child);
  }
  if (queue.length !== refs.size) return undefined;

  const pieces: Piece[] = [], required: Span[] = [];
  const emit = (node: JsonNode) => {
    const spans = valueSpans(node);
    if (spans.length) {
      pieces.push(...compactPieces(node));
      required.push(...spans);
    } else {
      pieces.push(node.span);
      required.push(node.span);
    }
  };
  if (document.kind !== "object") return undefined;
  for (const key of ["schema", "root"]) {
    const entry = document.entries.find(item => item.name === key)!;
    emit(entry.key);
    pieces.push({ text: "\t" });
    emit(entry.value);
    pieces.push({ text: "\n" });
  }
  emit(document.entries.find(entry => entry.name === "nodes")!.key);
  pieces.push({ text: "\n" });
  const present = columns.filter(key => headers.has(key));
  present.forEach((key, index) => {
    if (index) pieces.push({ text: "\t" });
    emit(headers.get(key)!);
  });
  for (const row of rows) {
    pieces.push({ text: "\n" });
    present.forEach((key, index) => {
      if (index) pieces.push({ text: "\t" });
      const cell = row.get(key);
      if (cell) emit(cell);
      else pieces.push({ text: "-" });
    });
  }
  return { pieces, required };
};
