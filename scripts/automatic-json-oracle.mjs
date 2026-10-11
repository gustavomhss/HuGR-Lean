/**
 * Independent lexeme-exact JSON equivalence oracle for automatic JSON views. Original MIT; deliberately shares no
 * code with src/: its own parser rejects duplicate keys and trailing data, keeps number lexemes and key order, and
 * decodes the one table shape the automatic path emits ({columns, rows, cellEncoding:"optional"}) strictly.
 * A native object that happens to have exactly that shape is decoded too, so the oracle fails closed on it.
 */
import assert from "node:assert/strict";

const ESCAPES = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;

/** Parses RFC 8259 JSON into {type, ...} nodes: strings decoded, numbers as exact lexemes, entries in order. */
export function parseJsonExact(text) {
  let at = 0;
  const fail = (message) => { throw new assert.AssertionError({ message: `Invalid JSON at ${at}: ${message}` }); };
  const space = () => { while (at < text.length && " \t\n\r".includes(text[at])) at++; };
  const string = () => {
    let value = ""; at++;
    for (;;) {
      if (at >= text.length) fail("unterminated string");
      const char = text[at++];
      if (char === '"') return value;
      if (char < " ") fail("raw control character in string");
      if (char !== "\\") { value += char; continue; }
      const escape = text[at++];
      if (escape === "u") {
        if (!/^[0-9a-fA-F]{4}$/.test(text.slice(at, at + 4))) fail("bad \\u escape");
        value += String.fromCharCode(parseInt(text.slice(at, at + 4), 16)); at += 4;
      } else if (escape in ESCAPES) value += ESCAPES[escape];
      else fail(`bad escape \\${escape}`);
    }
  };
  const value = () => {
    space();
    const char = text[at];
    if (char === "{") {
      const entries = [], keys = new Set(); at++; space();
      if (text[at] === "}") { at++; return { type: "object", entries }; }
      for (;;) {
        space(); if (text[at] !== '"') fail("expected object key");
        const key = string(); if (keys.has(key)) fail(`duplicate key ${JSON.stringify(key)}`); keys.add(key);
        space(); if (text[at++] !== ":") fail("expected ':'");
        entries.push([key, value()]); space();
        if (text[at] === ",") { at++; continue; }
        if (text[at++] === "}") return { type: "object", entries };
        fail("expected ',' or '}'");
      }
    }
    if (char === "[") {
      const items = []; at++; space();
      if (text[at] === "]") { at++; return { type: "array", items }; }
      for (;;) {
        items.push(value()); space();
        if (text[at] === ",") { at++; continue; }
        if (text[at++] === "]") return { type: "array", items };
        fail("expected ',' or ']'");
      }
    }
    if (char === '"') return { type: "string", value: string() };
    for (const literal of ["true", "false", "null"]) if (text.startsWith(literal, at)) { at += literal.length; return { type: "literal", value: literal }; }
    NUMBER.lastIndex = at; const match = NUMBER.exec(text);
    if (!match) fail("unexpected token");
    at += match[0].length; return { type: "number", value: match[0] };
  };
  const root = value(); space();
  if (at !== text.length) fail("trailing data after JSON value");
  return root;
}

/** Replaces each emitted table with its per-row objects (fields in column order, absent cells omitted). */
export function decodeTables(node) {
  if (node.type === "array") return { type: "array", items: node.items.map(decodeTables) };
  if (node.type !== "object") return node;
  if (node.entries.map(([key]) => key).join("\0") !== "columns\0rows\0cellEncoding")
    return { type: "object", entries: node.entries.map(([key, child]) => [key, decodeTables(child)]) };
  const [columns, rows, encoding] = node.entries.map(([, child]) => child);
  assert.ok(encoding.type === "string" && encoding.value === "optional", "Unknown table cell encoding");
  assert.ok(columns.type === "array" && columns.items.every((c) => c.type === "string"), "Table columns must be strings");
  const names = columns.items.map((c) => c.value);
  assert.equal(new Set(names).size, names.length, "Duplicate table column");
  assert.equal(rows.type, "array", "Table rows must be an array");
  return { type: "array", items: rows.items.map((row) => {
    assert.ok(row.type === "array" && row.items.length === names.length, "Table row length differs from columns");
    return { type: "object", entries: row.items.flatMap((cell, i) => {
      assert.ok(cell.type === "array" && cell.items.length <= 1, "Malformed optional table cell");
      return cell.items.length ? [[names[i], decodeTables(cell.items[0])]] : [];
    }) };
  }) };
}

/** Canonical token string: key order kept, strings re-encoded uniformly, numbers verbatim. */
export function canonical(node) {
  switch (node.type) {
    case "object": return `{${node.entries.map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
    case "array": return `[${node.items.map(canonical).join(",")}]`;
    case "string": return JSON.stringify(node.value);
    default: return node.value;
  }
}

/** Native Playwright `### Result` wrapper: [prefix, JSON payload, suffix]; bare JSON otherwise. */
export function jsonParts(text) {
  const head = "### Result\n", end = text.indexOf("\n### Ran Playwright code\n");
  return text.startsWith(head) && end > 0 ? [head, text.slice(head.length, end), text.slice(end)] : ["", text, ""];
}

/** The model-visible text must carry the native wrapper byte for byte and an exactly equivalent JSON payload. */
export function assertJsonEquivalent(original, replacement) {
  const [head, payload, tail] = jsonParts(original), [newHead, newPayload, newTail] = jsonParts(replacement);
  assert.equal(newHead, head, "JSON wrapper prefix changed"); assert.equal(newTail, tail, "JSON wrapper suffix changed");
  const source = canonical(parseJsonExact(payload)), view = canonical(decodeTables(parseJsonExact(newPayload)));
  assert.ok(view === source, "JSON lost full source values/refs");
}
