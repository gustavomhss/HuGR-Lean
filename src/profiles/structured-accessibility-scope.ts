import { fields, parseJson, scalar, type JsonNode } from "../core/structured-json.js";
import type { StructuredReducer } from "../core/structured-types.js";
import type { Piece, Span } from "../core/types.js";

const nodeFields = ["ref", "parent", "role", "name", "states", "actions", "value", "bounds", "description"];
const strings = (node: JsonNode) => node.kind === "array" && node.items.every(item => typeof scalar(item) === "string");

/** Validate the complete flat tree before projecting a reference-closed scoped JSON view. */
export const reduceAccessibilityScope: StructuredReducer = (output, observation) => {
  if (typeof observation.scopeRef !== "string" || !observation.scopeRef.length) return undefined;
  const parsed = parseJson(output);
  if (!parsed) return undefined;
  const envelope = fields(parsed, ["schema", "root", "nodes"], ["schema", "root", "nodes"]);
  if (!envelope || scalar(envelope.get("schema")) !== "hugr-lean/a11y-v1") return undefined;
  const root = scalar(envelope.get("root")), array = envelope.get("nodes");
  if (typeof root !== "string" || array?.kind !== "array" || !array.items.length) return undefined;
  const nodes = new Map<string, { raw: JsonNode; ref: JsonNode; parent: string | null; protected: boolean }>();
  const children = new Map<string, string[]>();
  for (const raw of array.items) {
    const props = fields(raw, nodeFields, ["ref", "parent", "role", "name"]);
    if (!props) return undefined;
    const ref = scalar(props.get("ref")), parent = scalar(props.get("parent"));
    if (typeof ref !== "string" || nodes.has(ref) || (parent !== null && typeof parent !== "string") ||
        typeof scalar(props.get("role")) !== "string" || typeof scalar(props.get("name")) !== "string") return undefined;
    for (const key of ["states", "actions"]) {
      const value = props.get(key);
      if (value && !strings(value)) return undefined;
    }
    const description = props.get("description"), value = props.get("value"), bounds = props.get("bounds");
    if (description && typeof scalar(description) !== "string") return undefined;
    if (value && (value.kind !== "scalar" || (typeof value.value === "number" && !Number.isFinite(value.value)))) return undefined;
    if (bounds && (bounds.kind !== "array" || bounds.items.length !== 4 ||
        !bounds.items.every(item => typeof scalar(item) === "number" && Number.isFinite(scalar(item))))) return undefined;
    const states = props.get("states");
    const protectedNode = states?.kind === "array" && states.items.some(item => ["focused", "modal"].includes(String(scalar(item))));
    nodes.set(ref, { raw, ref: props.get("ref")!, parent, protected: protectedNode });
    if (parent !== null) {
      const list = children.get(parent) ?? [];
      list.push(ref); children.set(parent, list);
    }
  }
  if (nodes.get(root)?.parent !== null || !nodes.has(observation.scopeRef)) return undefined;
  for (const [ref, node] of nodes) {
    if (ref !== root && (node.parent === null || !nodes.has(node.parent))) return undefined;
  }
  // Parser bounds node count; each traversal visits each admitted node at most once.
  const connected = new Set<string>(), pending = [root];
  while (pending.length) {
    const ref = pending.pop()!;
    if (connected.has(ref)) return undefined;
    connected.add(ref); pending.push(...(children.get(ref) ?? []));
  }
  if (connected.size !== nodes.size) return undefined;
  const keep = new Set<string>(), subtree = [observation.scopeRef];
  while (subtree.length) {
    const ref = subtree.pop()!;
    keep.add(ref); subtree.push(...(children.get(ref) ?? []));
  }
  const ancestry = new Set<string>();
  const retainAncestors = (start: string) => {
    let ref: string | null = start;
    while (ref !== null && !ancestry.has(ref)) {
      ancestry.add(ref); keep.add(ref); ref = nodes.get(ref)!.parent;
    }
  };
  retainAncestors(observation.scopeRef);
  for (const [ref, node] of nodes) if (node.protected) retainAncestors(ref);
  const pieces: Piece[] = [{ text: "{" }], required: Span[] = [];
  if (parsed.kind !== "object") return undefined;
  for (const [index, entry] of parsed.entries.entries()) {
    if (index) pieces.push({ text: "," });
    pieces.push(entry.key.span, { text: ":" }); required.push(entry.key.span);
    if (entry.name !== "nodes") {
      pieces.push(entry.value.span); required.push(entry.value.span);
    } else {
      pieces.push({ text: "[" });
      let emitted = false;
      for (const [ref, node] of nodes) if (keep.has(ref)) {
        if (emitted) pieces.push({ text: "," });
        pieces.push(node.raw.span); required.push(node.raw.span); emitted = true;
      }
      pieces.push({ text: "]" });
    }
  }
  const scope = nodes.get(observation.scopeRef)!.ref.span;
  pieces.push({ text: "," }, { text: '"scope":' }, scope, { text: "}" }); required.push(scope);
  return { pieces, required };
};
