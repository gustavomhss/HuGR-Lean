#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { filter } from "../core/index.js";
import { filterStructured } from "../core/structured.js";
import { filterAutomatic } from "../core/automatic.js";
import { structuredFormats, type StructuredFormat } from "../core/structured-types.js";
import { profiles } from "../profiles/index.js";
import { RawStore, defaultRawDirectory } from "../raw/index.js";

// Match the core's default admission limit; larger streams retain every byte.
const INPUT_LIMIT = 4 * 1024 * 1024;
type FilterArguments = { command: string; format?: StructuredFormat; scopeRef?: string; exitCode: number | undefined; complete: boolean; terminal: boolean };

function flags(args: string[], values: readonly string[], switches: readonly string[] = []): Map<string, string | true> {
  const result = new Map<string, string | true>();
  for (let i = 0; i < args.length; i++) {
    const name = args[i]!;
    if (result.has(name)) throw new Error(`Duplicate option: ${name}`);
    if (switches.includes(name)) result.set(name, true);
    else if (values.includes(name)) {
      const value = args[++i];
      if (value === undefined || value === "" || value.startsWith("--")) throw new Error(`Missing value for ${name}`);
      result.set(name, value);
    } else throw new Error(`Unknown option: ${name}`);
  }
  return result;
}

function filterArguments(args: string[]): FilterArguments {
  const options = flags(args, ["--command", "--exit-code", "--format", "--scope-ref"], ["--complete", "--terminal-rendered"]);
  const command = options.get("--command"), exit = options.get("--exit-code");
  const format = options.get("--format"), scopeRef = options.get("--scope-ref");
  if (format !== undefined) {
    if (typeof format !== "string" || !structuredFormats.includes(format as StructuredFormat)) throw new Error("--format must be a supported structured format");
    if (command !== undefined || options.has("--terminal-rendered")) throw new Error("--format cannot be combined with --command or --terminal-rendered");
    if (format === "accessibility-scope" ? typeof scopeRef !== "string" : scopeRef !== undefined) throw new Error("--scope-ref is required exclusively for accessibility-scope");
  } else {
    if (typeof command !== "string") throw new Error("filter requires --command <literal command>");
    if (scopeRef !== undefined) throw new Error("--scope-ref is required exclusively for accessibility-scope");
  }
  if (exit !== undefined && (typeof exit !== "string" || !/^\d+$/.test(exit) || !Number.isSafeInteger(Number(exit)))) {
    throw new Error("--exit-code must be a nonnegative safe integer");
  }
  return { command: typeof command === "string" ? command : "",
    ...(typeof format === "string" ? { format: format as StructuredFormat } : {}),
    ...(typeof scopeRef === "string" ? { scopeRef } : {}), exitCode: exit === undefined ? undefined : Number(exit),
    complete: options.has("--complete"), terminal: options.has("--terminal-rendered") };
}

function write(data: string | Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    process.stdout.write(data, (error) => error ? reject(error) : resolve());
  });
}

async function filterStdin(options: FilterArguments): Promise<void> {
  const chunks: Buffer[] = [];
  let size = 0;
  let streaming = !options.complete || options.exitCode !== 0;
  const flush = async () => {
    for (const chunk of chunks.splice(0)) await write(chunk);
  };
  try {
    for await (const value of process.stdin) {
      const chunk = value as Buffer;
      if (!streaming && chunk.length > INPUT_LIMIT - size) {
        streaming = true;
        await flush();
      }
      if (streaming) await write(chunk);
      else { chunks.push(chunk); size += chunk.length; }
    }
  } catch (error) {
    if (!streaming) await flush();
    throw error;
  }
  if (streaming) return;
  const original = Buffer.concat(chunks, size);
  let output: string | Buffer = original;
  try {
    // Fatal decoding prevents malformed UTF-8 from being silently replaced. Keep BOMs.
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(original);
    const termination = options.exitCode === undefined ? { kind: "unknown" as const } : { kind: "exited" as const, code: options.exitCode };
    const completeness = options.complete ? "complete" : "unknown";
    const result = options.format ? filterStructured({ format: options.format, output: text, termination, completeness,
      ...(options.scopeRef === undefined ? {} : { scopeRef: options.scopeRef }) }) : options.terminal ? filter({ source: "shell", command: options.command, output: text,
      termination, completeness, presentation: "terminal-rendered" }) : filterAutomatic({ source: "native", tool: "bash", args: { command: options.command },
      output: text, metadata: { exit: options.exitCode, truncated: !options.complete }, status: options.exitCode === 0 ? "success" : "unknown", completeness });
    if (result.status === "reduced" || result.status === "normalized") output = result.replacement;
  } catch {
    // Decoding or filtering failures retain the original bytes.
  }
  await write(output);
}

async function version(): Promise<string> {
  const manifest: unknown = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
  if (typeof manifest !== "object" || manifest === null || !("version" in manifest) || typeof manifest.version !== "string") {
    throw new Error("Package version unavailable");
  }
  return manifest.version;
}

async function raw(args: string[]): Promise<void> {
  const [action, ...rest] = args;
  if (action !== "list" && action !== "get" && action !== "purge") throw new Error("Usage: hugr-lean raw list|get ID|purge [--directory path]");
  const id = action === "get" ? rest.shift() : undefined;
  if (action === "get" && (id === undefined || id.startsWith("--"))) throw new Error("raw get requires an identifier");
  const directory = flags(rest, ["--directory"]).get("--directory");
  const store = new RawStore(typeof directory === "string" ? { directory } : {});
  if (action === "list") await write(`${JSON.stringify(await store.list())}\n`);
  else if (action === "purge") await store.purge();
  else {
    const text = await store.get(id!);
    if (text === undefined) { process.exitCode = 2; process.stderr.write("unavailable\n"); }
    else await write(text);
  }
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command === "--version" || command === "version" || command === "doctor") {
    if (args.length) throw new Error(`Unexpected arguments for ${command}`);
    const current = await version();
    if (command === "doctor") await write(`${JSON.stringify({ version: current, node: process.version,
      profiles: profiles.map((profile) => profile.id), defaultRawDirectory: defaultRawDirectory(), pluginURL: new URL("../index.js", import.meta.url).href })}\n`);
    else await write(`${current}\n`);
  } else if (command === "filter") await filterStdin(filterArguments(args));
  else if (command === "raw") await raw(args);
  else throw new Error("Usage: hugr-lean --version|version|doctor|filter --command <literal command> [--exit-code <integer>] [--complete] [--terminal-rendered]|raw list|get ID|purge [--directory path]");
}

// write callbacks report broken pipes; the listener prevents an unhandled stream error.
process.stdout.on("error", () => { process.exitCode = 1; });
main().catch((error: unknown) => {
  process.exitCode = 1;
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
});
