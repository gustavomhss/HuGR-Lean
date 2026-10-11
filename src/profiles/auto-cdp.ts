import { KEY_ESCAPED, VALUE_COMPACT, decodeString, releaseScanCache, scanJsonValue, stringIs, type JsonRecords } from "../core/structured-json.js";
import type { AutomaticReducer } from "../core/automatic-types.js";
import type { Piece, Span } from "../core/types.js";
import { JSON_TEXT, jsonCarrier, jsonSectionScan, nativeJsonSection, overByteLimit, wrapperPrefix, wrapperSuffix, type JsonSection } from "./auto-json.js";

const { openArray, closeArray, openObject, closeObject, comma, colon } = JSON_TEXT;
const columnsLabel: Piece = Object.freeze({ text: '"columns":' }), rowsLabel: Piece = Object.freeze({ text: '"rows":' });
const cellEncoding: Piece = Object.freeze({ text: '"cellEncoding":"optional"' });

interface Column { readonly slot: number; readonly lexeme: string; readonly plain: boolean; readonly next: Set<string>; incoming: number; last: string | undefined }

/**
 * Native AX nodes only; sparse cells preserve absence separately from null/empty values. The section was
 * accepted by the streaming scanner (parseJson acceptance, unique keys, limits), whose records give every
 * value down to the node fields: depth, enclosing container, key span, value span and whether the value is
 * compact (its lexical emission is its one source span). No tree is built.
 */
export const reduceAutomaticCdp: AutomaticReducer = observation => {
  if (!jsonCarrier(observation) || overByteLimit(observation.output)) return;
  const payload = nativeJsonSection(observation);
  // A "nodes" member is spelled literally or through a \u escape (the only JSON escape that can spell letters).
  if (!payload || (!payload.output.includes('"nodes"') && !payload.output.includes("\\u"))) return;
  const scan = jsonSectionScan(observation)!;
  if (!scan.valid || scan.envelope) return;
  try { return reduceRecords(observation.output.length, scan.section, scan.section.output, scan.records!); } finally { releaseScanCache(); }
};

function reduceRecords(length: number, section: JsonSection, source: string, records: JsonRecords): ReturnType<AutomaticReducer> {
  const { count, depth, parent, keyStart, keyEnd, valueStart, valueEnd, flags } = records;
  const named = (slot: number, name: string) => stringIs(source, keyStart[slot]!, keyEnd[slot]!, (flags[slot]! & KEY_ESCAPED) !== 0, name);
  const object = (slot: number) => source.charCodeAt(valueStart[slot]!) === 123;
  /** Slot of member `name` of the object recorded at `owner` (keys are unique), or -1. */
  const member = (owner: number, name: string): number => {
    const level = depth[owner]! + 1, at = valueStart[owner]!;
    for (let slot = owner + 1; slot < count && depth[slot]! >= level; slot++) if (depth[slot] === level && parent[slot] === at && named(slot, name)) return slot;
    return -1;
  };
  if (count === 0 || !object(0)) return;
  // nodes ?? (id present ? result.nodes : absent) ?? accessibility.nodes, each lookup only inside an object.
  let nodes = member(0, "nodes");
  if (nodes < 0 && member(0, "id") >= 0) {
    const result = member(0, "result");
    if (result >= 0 && object(result)) nodes = member(result, "nodes");
  }
  if (nodes < 0) {
    const accessibility = member(0, "accessibility");
    if (accessibility >= 0 && object(accessibility)) nodes = member(accessibility, "nodes");
  }
  if (nodes < 0 || source.charCodeAt(valueStart[nodes]!) !== 91 || valueEnd[nodes]! - valueStart[nodes]! === 2) return;
  const nodesStart = valueStart[nodes]!, nodesEnd = valueEnd[nodes]!, itemLevel = depth[nodes]! + 1;
  if (source.charCodeAt(space(source, nodesStart + 1)) === 93) return;
  // One pass per node: unique nonempty string nodeId, boolean ignored, consistent key lexemes and field order.
  // Per key name: its first key slot and lexeme, successor names (field-order edges) and in-degree. Each row's
  // entries are recorded as (column, value slot) for the table, in source order.
  const ids = new Set<string>(), keys = new Map<string, Column>(), entryColumns: Column[] = [], entrySlots: number[] = [], rowEnds: number[] = [];
  let slot = nodes + 1;
  while (slot < count && depth[slot]! >= itemLevel) {
    const item = slot++;
    if (depth[item] !== itemLevel || parent[item] !== nodesStart || !object(item)) return;
    const at = valueStart[item]!;
    let previous: Column | undefined, nodeId = -1, ignored = -1;
    for (; slot < count && depth[slot]! > itemLevel; slot++) {
      if (depth[slot] !== itemLevel + 1 || parent[slot] !== at) continue;
      const start = keyStart[slot]!, end = keyEnd[slot]!, plain = (flags[slot]! & KEY_ESCAPED) === 0;
      const name = plain ? source.slice(start + 1, end - 1) : decodeString(source, start, end);
      if (name === "nodeId") nodeId = slot; else if (name === "ignored") ignored = slot;
      // Sparse rows must reconstruct each node's original field order and key lexemes. A key lexeme exactly
      // two units longer than its decoded name has no escape, so it is `"name"`; equal-length ones are equal.
      let known = keys.get(name);
      if (known) {
        if (end - start !== known.lexeme.length || (!known.plain && !source.startsWith(known.lexeme, start))) return;
      } else {
        const lexeme = source.slice(start, end);
        known = { slot, lexeme, plain: lexeme.length === name.length + 2, next: new Set(), incoming: 0, last: undefined };
        keys.set(name, known);
      }
      // `last` is the latest successor already recorded, so repeated field sequences skip the set lookup.
      if (previous !== undefined && previous.last !== name) {
        if (!previous.next.has(name)) { previous.next.add(name); known.incoming++; }
        previous.last = name;
      }
      previous = known;
      entryColumns.push(known); entrySlots.push(slot);
    }
    if (nodeId < 0 || source.charCodeAt(valueStart[nodeId]!) !== 34 || valueEnd[nodeId]! - valueStart[nodeId]! === 2) return;
    const id = decodeString(source, valueStart[nodeId]!, valueEnd[nodeId]!), flag = ignored < 0 ? 0 : source.charCodeAt(valueStart[ignored]!);
    if (ids.has(id) || (flag !== 116 && flag !== 102)) return;
    ids.add(id); rowEnds.push(entrySlots.length);
  }
  const ready = [...keys.keys()].filter(name => keys.get(name)!.incoming === 0), columns: Column[] = [];
  for (let i = 0; i < ready.length; i++) {
    const column = keys.get(ready[i]!)!; columns.push(column);
    for (const next of column.next) {
      const successor = keys.get(next)!;
      if (--successor.incoming === 0) ready.push(next);
    }
  }
  if (columns.length !== keys.size) return;
  // Bound sparse expansion as well as parser work.
  if (columns.length * rowEnds.length > 25000) return;
  const offset = section.start, pieces: Piece[] = [], required: Span[] = [];
  wrapperPrefix(section, pieces, required);
  const evidence = (start: number, end: number): void => { const span: Span = [start + offset, end + offset]; pieces.push(span); required.push(span); };
  // A compact recorded value is its own single span; any other is scanned for its lexical emission.
  const lexical = (slot: number): void => {
    if (flags[slot]! & VALUE_COMPACT) evidence(valueStart[slot]!, valueEnd[slot]!);
    else scanJsonValue(source, valueStart[slot]!, offset, Infinity, pieces, required);
  };
  function table(): boolean {
    pieces.push(openObject, columnsLabel, openArray);
    for (let i = 0; i < columns.length; i++) { if (i) pieces.push(comma); const key = columns[i]!.slot; evidence(keyStart[key]!, keyEnd[key]!); }
    pieces.push(closeArray, comma, rowsLabel, openArray);
    for (let i = 0, entry = 0; i < rowEnds.length; i++) {
      // Topological columns respect every row's field order, so each row's entries appear in column order.
      const last = rowEnds[i]!;
      if (i) pieces.push(comma);
      pieces.push(openArray);
      for (let j = 0; j < columns.length; j++) {
        if (j) pieces.push(comma);
        pieces.push(openArray);
        if (entry < last && entryColumns[entry] === columns[j]) lexical(entrySlots[entry++]!);
        pieces.push(closeArray);
      }
      if (entry !== last) return false;
      pieces.push(closeArray);
    }
    pieces.push(closeArray, comma, cellEncoding, closeObject);
    return true;
  }
  // Only objects enclosing the nodes array are walked; every other value is plain lexical evidence.
  function emit(owner: number): boolean {
    pieces.push(openObject);
    const level = depth[owner]! + 1, at = valueStart[owner]!;
    let first = true;
    for (let slot = owner + 1; slot < count && depth[slot]! >= level; slot++) {
      if (depth[slot] !== level || parent[slot] !== at) continue;
      if (!first) pieces.push(comma);
      first = false;
      evidence(keyStart[slot]!, keyEnd[slot]!); pieces.push(colon);
      const start = valueStart[slot]!, end = valueEnd[slot]!;
      if (slot === nodes) { if (!table()) return false; }
      else if (object(slot) && start <= nodesStart && end >= nodesEnd) { if (!emit(slot)) return false; }
      else lexical(slot);
    }
    pieces.push(closeObject);
    return true;
  }
  if (!emit(0)) return;
  wrapperSuffix(section, length, pieces, required);
  return { pieces, required };
}
const space = (text: string, at: number): number => {
  let code = text.charCodeAt(at);
  while (code === 32 || code === 10 || code === 13 || code === 9) code = text.charCodeAt(++at);
  return at;
};
