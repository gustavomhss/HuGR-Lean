#!/usr/bin/env node
// Original MIT test producer. Standard newline-delimited MCP JSON-RPC; no SDK dependency.
import { createInterface } from "node:readline";
import { appendFile, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

function image() {
  const chunk = (name, data) => {
    const body = Buffer.concat([Buffer.from(name), data]); let crc = 0xffffffff;
    for (const byte of body) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
    const size = Buffer.alloc(4), checksum = Buffer.alloc(4); size.writeUInt32BE(data.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([size, body, checksum]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.from([0,42,43,44]))), chunk("IEND", Buffer.alloc(0))]).toString("base64");
}

export async function inventory(root, prefix = "") {
  const rows = [];
  for (const entry of (await readdir(path.join(root, prefix), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) rows.push(...await inventory(root, relative));
    else if (entry.isFile()) rows.push({ path: path.join(root, relative), text: await readFile(path.join(root, relative), "utf8") });
    else throw new Error(`Nonregular inventory entry: ${relative}`);
  }
  return rows;
}

export async function packet(root, mode) {
  const rows = await inventory(root);
  const json = { files: rows, scope: root, hasMore: false, opaque: { error: "application data", ref: "e42" } };
  const content = [{ type: "text", text: JSON.stringify(json, null, 2), annotations: { audience: ["assistant"] } }];
  if (mode === "unknown") content[0].text = "unknown producer\r\nopaque e42 café 🔥\n";
  if (mode === "truncated") content[0].text = "...output truncated...\n" + content[0].text;
  if (mode === "attachments") content.push(
    { type: "resource", resource: { uri: "file:///owned/e42.txt", mimeType: "text/plain", text: "attachment source e42\r\n" } },
    { type: "image", mimeType: "image/png", data: image() },
    { type: "audio", mimeType: "audio/wav", data: "UklGRg==" });
  if (mode === "blob") content.push({ type: "resource", resource: { uri: "file:///owned/e42.bin", blob: "AAEC", mimeType: "application/octet-stream" } });
  return { content, structuredContent: json, ...(mode === "error" ? { isError: true } : {}), _meta: { source: "original-mit-local-producer", ref: "e42" } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [root, log] = process.argv.slice(2);
  for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
    let request;
    try {
      request = JSON.parse(line);
      await appendFile(log, JSON.stringify({ request }) + "\n");
      if (request.id === undefined) continue;
      let result;
      if (request.method === "initialize") result = { protocolVersion: request.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "automatic-proof", version: "1.0.0" } };
      else if (request.method === "ping") result = {};
      else if (request.method === "tools/list") result = { tools: [{ name: "inventory", description: "Read the local fixture inventory", inputSchema: { type: "object", properties: { mode: { type: "string" } }, required: ["mode"], additionalProperties: false } }] };
      else if (request.method === "tools/call" && request.params.name === "inventory") result = await packet(root, request.params.arguments.mode);
      else throw new Error(`Unsupported MCP method: ${request.method}`);
      const response = { jsonrpc: "2.0", id: request.id, result };
      await appendFile(log, JSON.stringify({ response }) + "\n");
      process.stdout.write(JSON.stringify(response) + "\n");
    } catch (error) {
      const response = { jsonrpc: "2.0", id: request?.id ?? null, error: { code: -32603, message: error.message } };
      await appendFile(log, JSON.stringify({ response }) + "\n");
      process.stdout.write(JSON.stringify(response) + "\n");
    }
  }
}
