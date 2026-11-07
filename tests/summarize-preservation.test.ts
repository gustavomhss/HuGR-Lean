import assert from "node:assert/strict";
import { test } from "node:test";
import { recoveryLine, summarize } from "../src/core/summarize.js";
import { createAfterHook, createRecallTool } from "../src/opencode/index.js";

const bytes = (text: string) => Buffer.byteLength(text, "utf8");
const filler = (count: number) => Array.from({ length: count }, (_, i) => `step ${i}: ${"work ".repeat(15)}`).join("\n");
const id = "a".repeat(32);
const frames = `${"progress 10% ".repeat(30)}\r${"progress 50% ".repeat(30)}\rcomplete`;
const directory = (entries: string[]) => `<path>/repo</path>\n<type>directory</type>\n<entries>\n${entries.join("\n")}\n\n(${entries.length} entries)\n</entries>`;
const read = (rows: string[], start = 1, suffix = "") => `<path>/repo/雪.ts</path>\n<type>file</type>\n<content>\n${rows.map((row, i) => `${start + i}: ${row}`).join("\n")}\n(End of file - total ${start + rows.length - 1} lines)\n</content>${suffix}`;

test("CR overwrite cleanup is lossy even below the shell threshold and counts actual recall bytes", () => {
  const result = summarize({ tool: "bash", output: frames, metadata: { exit: 0 } });
  assert.equal(result.status, "summarized");
  if (result.status !== "summarized") return;
  assert.equal(result.reason, "shell_overwrite");
  assert.equal(result.replacement, "complete");
  assert.equal(result.outputBytes, bytes("complete" + recoveryLine(id)));
  assert.equal(summarize({ tool: "bash", output: "old\rnew", metadata: { exit: 0 } }).status, "unchanged", "recall overhead must not enlarge the result");
  const crlf = summarize({ tool: "bash", output: "one\r\ntwo\r\n", metadata: { exit: 0 } });
  assert.ok(crlf.status === "rewritten" && crlf.replacement === "one\ntwo\n");
});

test("CR collapse never reaches the adapter without durable exact recall", async () => {
  const input = { tool: "bash", args: { command: "custom-command" } };
  for (const options of [{ raw: false as const }, { mode: "lossless" as const }, {}]) {
    const output = { output: frames, metadata: { exit: 0, truncated: false } };
    await createAfterHook(options, { raw: { put: async () => { throw new Error("store unavailable"); } } })(input, output);
    assert.equal(output.output, frames);
  }
  const originals: string[] = [];
  const output = { output: frames, metadata: { exit: 0, truncated: false } };
  await createAfterHook({}, { raw: { put: async text => { originals.push(text); return id; } } })(input, output);
  assert.equal(output.output, "complete" + recoveryLine(id));
  assert.deepEqual(originals, [frames]);
  assert.equal(await createRecallTool({ get: async () => originals[0] }).execute({ id }), frames);
});

test("CR frames containing failures and their continuations remain visible for every exit state", () => {
  const diagnostic = "error: original diagnostic", context = "    original context 🧭";
  const output = `${filler(120)}\n${diagnostic}\rstatus refreshed\n${context}\r    newer context\n${filler(120)}`;
  for (const metadata of [{}, { exit: 1 }, { exit: 0 }]) {
    const result = summarize({ tool: "bash", output, metadata });
    const shown = result.status === "unchanged" ? output : result.replacement;
    assert.ok(shown.includes(diagnostic), JSON.stringify(metadata));
    // Failed commands may not lose overwritten context even if it follows a redraw.
    if (metadata.exit !== 0) assert.ok(shown.includes(context), JSON.stringify(metadata));
  }
});

test("ANSI sequences cannot hide a failure token from CR frame preservation", () => {
  const output = `${"err\x1b[31mor: original diagnostic ".repeat(30)}\x1b[0m\rcomplete`;
  const result = summarize({ tool: "bash", output, metadata: { exit: 0 } });
  assert.ok(result.status === "rewritten" && result.replacement.includes("error: original diagnostic"));
  assert.ok(result.replacement.endsWith("\rcomplete"));
});

test("failed and unknown commands preserve every CR frame when cleanup cannot shrink", () => {
  for (const metadata of [{}, { exit: 1 }]) {
    const output = "progress one\rprogress two";
    assert.equal(summarize({ tool: "bash", output, metadata }).status, "unchanged");
  }
});

for (const position of ["head", "middle", "tail"] as const) {
  test(`failure continuations are whole beyond 40 lines at the ${position}`, () => {
    const block = ["Error: operation failed", ...Array.from({ length: 85 }, (_, i) => `    at frame_${i} (雪.ts:${i + 1}:2)`), `    final evidence ${"x".repeat(3000)}`].join("\n");
    const output = position === "head" ? `${block}\n${filler(160)}` : position === "tail" ? `${filler(160)}\n${block}` : `${filler(160)}\n${block}\n${filler(160)}`;
    for (const metadata of [{}, { exit: 7 }]) {
      const result = summarize({ tool: "bash", output, metadata }, { headBytes: 100, tailBytes: 100, errorBytes: 0 });
      assert.equal(result.status, "summarized");
      if (result.status === "summarized") assert.ok(result.replacement.includes(block), `${position}: complete block must be contiguous`);
    }
  });
}

test("continuations resembling successful tests are not mistaken for diagnostic boundaries", () => {
  const block = "Error: mismatch\n    ✓ expected shape (1ms)\n    context after the checkmark";
  const output = `${filler(120)}\n${block}\n${filler(120)}`;
  const result = summarize({ tool: "bash", output, metadata: { exit: 1 } });
  assert.ok(result.status === "summarized" && result.replacement.includes(block));
});

test("a wholly diagnostic output stays unchanged even if continuations look like success rows", () => {
  const output = `Error: failed\n${Array.from({ length: 200 }, (_, i) => `    ✓ assertion payload ${i}: ${"x".repeat(60)}`).join("\n")}`;
  assert.equal(summarize({ tool: "bash", output, metadata: { exit: 1 } }).status, "unchanged");
});

test("run-length markers inside diagnostic continuations do not terminate the block", () => {
  const repeated = "    at identical_frame (example.ts:1:1)", last = "    final continuation survives";
  const output = `${filler(120)}\nError: crash\n${Array(80).fill(repeated).join("\n")}\n${last}\n${filler(120)}`;
  const result = summarize({ tool: "bash", output, metadata: { exit: 1 } });
  assert.ok(result.status === "summarized" && result.replacement.includes(`Error: crash\n${repeated}\n[previous line repeated 79 more times]\n${last}`));
});

test("zero head and tail budgets still preserve all failed diagnostic blocks", () => {
  const block = "Error: failed\n    at source.ts:1:2\n    exact detail";
  const output = `${filler(100)}\n${block}\n${filler(100)}`;
  const result = summarize({ tool: "bash", output, metadata: { exit: 1 } }, { headBytes: 0, tailBytes: 0, errorBytes: 0 });
  assert.ok(result.status === "summarized" && result.replacement.includes(block) && !result.replacement.includes("line cut"));
});

test("success diagnostics are admitted as whole blocks within their budget", () => {
  const block = ["Error: recovered", ...Array.from({ length: 70 }, (_, i) => `    at recovered_${i}`)].join("\n");
  const output = `${filler(100)}\n${block}\n${filler(100)}`;
  const kept = summarize({ tool: "bash", output, metadata: { exit: 0 } }, { errorBytes: 5000 });
  assert.ok(kept.status === "summarized" && kept.replacement.includes(block));
  const omitted = summarize({ tool: "bash", output, metadata: { exit: 0 } }, { errorBytes: 0 });
  assert.ok(omitted.status === "summarized" && !omitted.replacement.includes("Error: recovered"));
});

test("read cap exactly budgets Unicode rows, large line numbers, wrapper and mandatory suffix", () => {
  const rows = Array.from({ length: 100 }, (_, i) => `const item_${i} = "${"🧭é".repeat(8)}";`);
  const suffix = "\n<system-reminder>\nRetain these instructions.\n</system-reminder>";
  for (const start of [1, 9_999_998, Number.MAX_SAFE_INTEGER - 100]) for (const readLineNumbers of [false, true]) {
    const output = read(rows, start, suffix), cap = 900;
    const result = summarize({ tool: "read", output }, { readCapBytes: cap, readLineNumbers });
    assert.equal(result.status, "summarized");
    if (result.status !== "summarized") continue;
    assert.ok(bytes(result.replacement) <= cap);
    assert.equal(result.outputBytes, bytes(result.replacement + recoveryLine(id)));
    assert.ok(result.replacement.endsWith(suffix));
    const footer = /Showing lines (\d+)-(\d+)\. Use offset=(\d+) to continue/.exec(result.replacement)!;
    assert.equal(Number(footer[1]), start);
    assert.equal(Number(footer[3]), Number(footer[2]) + 1);
    const count = Number(footer[2]) - start + 1;
    assert.ok(count > 0 && count < rows.length);
    for (const row of rows.slice(0, count)) assert.ok(result.replacement.includes(row));
    assert.ok(!result.replacement.includes(rows[count]!));
    assert.ok(!result.replacement.includes("\ufffd"));
  }
});

test("unsatisfiable read caps preserve the exact original with an explicit reason", () => {
  for (const [rows, suffix, cap] of [
    [["🧭".repeat(1000)], "", 100],
    [["x".repeat(5000), "short"], "", 400],
    [["one", "two", "three"], `<system-reminder>${"mandatory ".repeat(1000)}</system-reminder>`, 400],
    [["one", "two"], "", 0],
  ] as const) {
    const output = read([...rows], 1, suffix);
    const result = summarize({ tool: "read", output }, { readCapBytes: cap });
    assert.equal(result.status, "unchanged");
    assert.equal(result.reason, "read_cap_unsatisfiable");
    assert.equal(result.outputBytes, bytes(output));
  }
});

test("read line numbers must be positive and safely representable", () => {
  for (const start of [0, Number.MAX_SAFE_INTEGER]) {
    const output = read(["first", "second", "third"], start);
    assert.equal(summarize({ tool: "read", output }, { readCapBytes: 100 }).status, "unchanged");
  }
});

test("automatic directory views are opt-in per observation and never bypass adapter opt-out", async () => {
  const original = directory(["alpha", "beta", "gamma"]), args = { filePath: "/repo" }, metadata = { truncated: false };
  assert.equal(summarize({ tool: "read", output: original, args, metadata }).status, "rewritten");
  assert.equal(summarize({ tool: "read", output: original, args, metadata, automatic: false }).status, "unchanged");
  for (const mode of ["summarize", "lossless"] as const) {
    const output = { output: original, metadata };
    await createAfterHook({ automatic: false, mode })({ tool: "read", args }, output);
    assert.equal(output.output, original);
  }
  const enabled = { output: original, metadata };
  await createAfterHook()({ tool: "read", args }, enabled);
  assert.notEqual(enabled.output, original);
  let calls = 0;
  const refused = { output: original, metadata };
  await createAfterHook({}, { automaticFilter: () => { calls++; return { status: "passthrough", reason: "declined", inputBytes: bytes(original), outputBytes: bytes(original) }; } })({ tool: "read", args }, refused);
  assert.equal(calls, 1);
  assert.equal(refused.output, original, "summarizer must not rerun a declined automatic view");
});

test("read automatic fallback cannot bypass the adapter maxInputBytes limit", async () => {
  const original = directory(Array.from({ length: 5000 }, (_, i) => `${i}_${"x".repeat(220)}`));
  assert.ok(bytes(original) > 1024 * 1024 && bytes(original) < 4 * 1024 * 1024);
  const output = { output: original, metadata: { truncated: false } };
  await createAfterHook({ maxInputBytes: 1024 * 1024, raw: false })({ tool: "read", args: { filePath: "/repo" } }, output);
  assert.equal(output.output, original);
});

test("recovery instructions identify both the actual installed CLI and registered host tool", () => {
  assert.equal(recoveryLine(id), `\n[full output: hugr-lean recall ${id}]`);
  const { description } = createRecallTool({ get: async () => undefined });
  assert.ok(description.includes("lean_recall"));
  assert.ok(description.includes("hugr-lean recall <id>"));
});


test("maxInputBytes bounds every native summarize path before parsing or storage", async () => {
  const limit = 1024 * 1024;
  const long = filler(15000);
  const cases = [
    { tool: "bash", args: { command: "unknown-tool" }, original: long },
    { tool: "read", args: { filePath: "/repo/雪.ts" }, original: read(Array.from({ length: 15000 }, (_, i) => `source ${i}: ${"é".repeat(50)}`)) },
    { tool: "webfetch", args: { url: "https://example.com" }, original: long },
  ];
  for (const { tool, args, original } of cases) {
    assert.ok(bytes(original) > limit && bytes(original) < 4 * limit);
    let parsed = 0, stored = 0;
    const dependencies = {
      filter: () => { parsed++; throw new Error("must not parse oversized input"); },
      automaticFilter: () => { parsed++; throw new Error("must not parse oversized input"); },
      raw: { put: async () => { stored++; return id; } },
    };
    const metadata = { exit: 0, truncated: false }, output = { output: original, metadata, title: "native" };
    await createAfterHook({ maxInputBytes: limit }, dependencies)({ tool, args }, output);
    assert.equal(output.output, original, tool);
    assert.equal(output.metadata, metadata);
    assert.equal(output.title, "native");
    assert.equal(parsed, 0, tool);
    assert.equal(stored, 0, tool);
    const admitted = { output: original, metadata };
    await createAfterHook({ maxInputBytes: 4 * limit }, { raw: dependencies.raw })({ tool, args }, admitted);
    assert.notEqual(admitted.output, original, `${tool}: raising the limit must admit a real summary`);
    assert.equal(stored, 1, tool);
  }
});

test("native input limits count UTF-8 bytes, include the default ceiling and admit the exact boundary", async () => {
  const limit = 1024 * 1024;
  let stored = 0;
  const raw = { put: async () => { stored++; return id; } };
  for (const [options, text] of [
    [{ maxInputBytes: limit }, "é".repeat(limit / 2 + 1)],
    [{}, "x".repeat(4 * limit + 1)],
  ] as const) {
    const output = { output: text, metadata: { exit: 0, truncated: false } };
    await createAfterHook(options, { raw })({ tool: "webfetch", args: {} }, output);
    assert.equal(output.output, text);
    assert.equal(stored, 0);
  }
  const at = { output: "é".repeat(limit / 2), metadata: { exit: 0, truncated: false } };
  await createAfterHook({ maxInputBytes: limit }, { raw })({ tool: "webfetch", args: {} }, at);
  assert.ok(bytes(at.output) < limit);
  assert.equal(stored, 1);
});

test("oversized structured native output and invalid internal limits cannot reach parsers", async () => {
  let calls = 0;
  const dependencies = { structuredFilter: () => { calls++; throw new Error("must not parse"); }, raw: { put: async () => { calls++; return id; } } };
  const original = " ".repeat(1024 * 1024) + '{"ok":true}';
  const output = { output: original, metadata: { exit: 0, truncated: false } };
  await createAfterHook({ maxInputBytes: 1024 * 1024, structuredTools: [{ tool: "native_json", format: "json" }] }, dependencies)({ tool: "native_json", args: {} }, output);
  assert.equal(output.output, original);
  assert.equal(calls, 0);
  for (const maxInputBytes of [NaN, 1, 17 * 1024 * 1024]) {
    const item = { output: filler(200), metadata: { exit: 0, truncated: false } };
    const before = item.output;
    await createAfterHook({ maxInputBytes }, dependencies)({ tool: "webfetch", args: {} }, item);
    assert.equal(item.output, before);
    assert.equal(calls, 0);
  }
});
