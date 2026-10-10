import { compactPieces, fields, parseJson, scalar, valueSpans, type JsonNode } from "../core/structured-json.js";
import type { StructuredReducer } from "../core/structured-types.js";
import type { Span } from "../core/types.js";

const required = ["ref", "parent", "role", "name"];
const allowed = [...required, "states", "actions", "value", "bounds", "description"];
const isString = (node: JsonNode | undefined) => typeof scalar(node) === "string";

/** The properties view alone declares empty actions/states/description equivalent to omission. */
export const reduceAccessibilityProperties: StructuredReducer = output => {
  const document = parseJson(output);
  if (!document) return undefined;
  const envelope = fields(document, ["schema", "root", "nodes"], ["schema", "root", "nodes"]);
  if (!envelope || scalar(envelope.get("schema")) !== "hugr-lean/a11y-v1" || !isString(envelope.get("root"))) return undefined;
  const nodes = envelope.get("nodes");
  if (nodes?.kind !== "array" || nodes.items.length === 0) return undefined;
  const root = scalar(envelope.get("root")) as string;
  const parents = new Map<string, string | null>();
  const children = new Map<string, string[]>();
  for (const node of nodes.items) {
    const properties = fields(node, allowed, required);
    if (!properties || !["ref", "role", "name"].every(key => isString(properties.get(key)))) return undefined;
    const ref = scalar(properties.get("ref")) as string;
    const parent = scalar(properties.get("parent"));
    if ((parent !== null && typeof parent !== "string") || parents.has(ref)) return undefined;
    parents.set(ref, parent);
    if (parent !== null) {
      const siblings = children.get(parent) ?? [];
      siblings.push(ref);
      children.set(parent, siblings);
    }
    for (const key of ["states", "actions"]) {
      const property = properties.get(key);
      if (property && (property.kind !== "array" || !property.items.every(isString))) return undefined;
    }
    const description = properties.get("description");
    if (description && !isString(description)) return undefined;
    const value = properties.get("value");
    if (value && (value.kind !== "scalar" || (typeof value.value === "number" && !Number.isFinite(value.value)))) return undefined;
    const bounds = properties.get("bounds");
    if (bounds && (bounds.kind !== "array" || bounds.items.length !== 4 || !bounds.items.every(item =>
      typeof scalar(item) === "number" && Number.isFinite(scalar(item))))) return undefined;
  }
  if (!parents.has(root) || parents.get(root) !== null) return undefined;
  for (const [ref, parent] of parents) {
    if (parent === null ? ref !== root : !parents.has(parent)) return undefined;
  }
  // Linear, bounded traversal: disconnected cycles cannot reach the declared root.
  const queue = [root], visited = new Set<string>();
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const ref = queue[cursor]!;
    if (visited.has(ref)) return undefined;
    visited.add(ref);
    queue.push(...(children.get(ref) ?? []));
  }
  if (visited.size !== parents.size) return undefined;

  const projected: JsonNode = {
    ...nodes,
    items: nodes.items.map(node => {
      if (node.kind !== "object") throw new Error("Validated accessibility node must be an object");
      return { ...node, entries: node.entries.filter(entry => !(
        ((entry.name === "actions" || entry.name === "states") && entry.value.kind === "array" && entry.value.items.length === 0)
        || (entry.name === "description" && scalar(entry.value) === "")
      )) };
    }),
  };
  if (document.kind !== "object") return undefined;
  const view: JsonNode = { ...document, entries: document.entries.map(entry => entry.name === "nodes" ? { ...entry, value: projected } : entry) };
  const keys: Span[] = document.entries.map(entry => entry.key.span);
  for (const node of projected.items) {
    if (node.kind === "object") keys.push(...node.entries.map(entry => entry.key.span));
  }
  return { pieces: compactPieces(view), required: [...keys, ...valueSpans(view)] };
};
