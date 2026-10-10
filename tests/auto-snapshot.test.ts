import assert from "node:assert/strict";
import test from "node:test";
import type { AutomaticObservation } from "../src/core/automatic-types.js";
import { renderReduction } from "../src/core/structured-render.js";
import { reduceAutomaticSnapshot } from "../src/profiles/auto-snapshot.js";

// Authored contract cases, NOT captures or evidence of native producer conformance.
const preamble = '### Page state\n- Page URL: https://example.test/😀\n- Page Title: Form\n### Events\n- dialog opened\n### Snapshot\n```';
const suffix = '```\n### Modal state\n- dialog: "Keep me"\n### Events\n- console: ready\n';
const nodes = [
  { indent: "", ref: "e1", before: 'document "Form 😀" ', after: '' },
  { indent: "  ", ref: "f2e3", before: 'button "Pay [ref=e99]: \\"now\\"" [disabled] ', after: ' [pressed=false]' },
  { indent: "    ", ref: "e4", before: 'textbox "Account" [required] ', after: ' [focused]: "abc: [ref=e99] opaque"' },
  { indent: "  ", ref: "e5", before: 'mystery-role "Extension" [level=3] [box=1,2,3,4] [description="literal [ref=e99]"] ', after: ': false' },
];
const plain = '    - /url: https://example.test/path\n    - /placeholder: "Name"\n    - /description: "### Error [ref=e99]"\n    - text: "No ref, keep dash"\n';
const body = nodes.map(n => `${n.indent}- ${n.before}[ref=${n.ref}]${n.after}\n`).join("") + plain;
const playwright = `${preamble}yaml\n${body}${suffix}`;
const expected = `${preamble}text\n${nodes.map(n => `${n.indent}${n.ref} ${n.before}${n.after}\n`).join("")}${plain}${suffix}`;
const chrome = '## Latest page snapshot\nuid=1_0 RootWebArea "Form 😀" url="https://example.test"\n  uid=1_1 button "Pay [ref=e99]" disabled focused\n    uid=1_2 textbox "Account" value="a:b" required\n  uid=1_3 tab "Panel" selected\n';

function observation(output = playwright, tool = "browser_snapshot", patch: Partial<AutomaticObservation> = {}): AutomaticObservation {
  return { source: "mcp", tool, output, args: {}, metadata: {}, status: "success", completeness: "complete", ...patch };
}
function rendered(input: AutomaticObservation): string | undefined {
  const reduction = reduceAutomaticSnapshot(input);
  return reduction && renderReduction(input.output, reduction);
}

// Independent oracle: expected records come from authored semantic data, not reducer spans.
function playwrightOracle(output: string): void {
  assert.ok(output.startsWith(`${preamble}text\n`), "every preamble field survives");
  assert.ok(output.endsWith(`${plain}${suffix}`), "non-ref rows, modal and event fields survive");
  const tree = output.slice(`${preamble}text\n`.length, -`${plain}${suffix}`.length).split("\n").filter(Boolean);
  const records = tree.map(line => {
    const parsed = /^( *)(e\d+|f\d+e\d+) (.*)$/.exec(line);
    assert.ok(parsed, "every node retains control reference");
    return { indent: parsed[1], ref: parsed[2], payload: parsed[3] };
  });
  assert.deepEqual(records, nodes.map(n => ({ indent: n.indent, ref: n.ref, payload: n.before + n.after })), "all refs, hierarchy and opaque payload survive");
}
function chromeOracle(output: string): void {
  const decode = (text: string, original: boolean) => text.split("\n").slice(1).filter(Boolean).map(line => {
    const parsed = (original ? /^( *)uid=(\d+_\d+) (.*)$/ : /^( *)(\d+_\d+) (.*)$/).exec(line);
    assert.ok(parsed, "every uid and semantic row remains");
    return { indent: parsed[1], ref: parsed[2], payload: parsed[3] };
  });
  assert.equal(output.split("\n")[0], "## Latest page snapshot");
  assert.deepEqual(decode(output, false), decode(chrome, true));
}

test("Playwright preserves every semantic record and surrounding section", () => {
  for (const tool of ["browser_snapshot", "mcp_playwright_browser_snapshot"]) {
    for (const args of [{}, { boxes: true }, { boxes: false }]) {
      const output = rendered(observation(playwright, tool, { args }));
      playwrightOracle(output!);
      assert.equal(output, expected);
      assert.ok(Buffer.byteLength(output!) < Buffer.byteLength(playwright));
    }
  }
});

test("Chrome preserves every uid, payload, hierarchy and selected suffix", () => {
  for (const tool of ["take_snapshot", "mcp_chrome_take_snapshot"]) {
    for (const args of [{}, { verbose: true }, { verbose: false }]) {
      const output = rendered(observation(chrome, tool, { args }));
      chromeOracle(output!);
      assert.equal(output, chrome.replace(/^( *)uid=/gm, "$1"));
    }
  }
  assert.equal(rendered(observation(chrome.trimEnd(), "take_snapshot")), chrome.trimEnd().replace(/^( *)uid=/gm, "$1"));
});

test("required evidence covers every emitted source byte", () => {
  for (const input of [observation(), observation(chrome, "take_snapshot")]) {
    const reduction = reduceAutomaticSnapshot(input)!;
    assert.ok(reduction);
    for (const span of reduction.required) {
      const changed = { ...reduction, pieces: reduction.pieces.filter(piece => !Array.isArray(piece) || piece[0] !== span[0] || piece[1] !== span[1]) };
      assert.throws(() => renderReduction(input.output, changed), /Invalid source-backed reduction/);
    }
  }
});

const refusedPlaywright = [
  playwright.replace('[ref=e5]', '[ref=e4]'),
  playwright.replace('[ref=e5]', '[ref=unknown]'),
  playwright.replace('[ref=e5]', '[ref=f2]'),
  playwright.replace('[ref=e5]', '[ref=e5] [ref=e6]'),
  playwright.replace('[ref=e5]', '[ref=e5'),
  playwright.replace('[ref=e5]', ']: [ref=e5]'),
  playwright.replace('[ref=e5]', ': value [ref=e5]'),
  playwright.replace('[ref=e5]', '[ref =e5]'),
  playwright.replace('[ref=e5]', '[ref:e5]'),
  playwright.replace('"Extension"', '"Extension'),
  playwright.replace('"Extension"', '"Extension\ncontinued"'),
  playwright.replace('  - mystery-role', '   - mystery-role'),
  playwright.replace('  - mystery-role', '  mystery-role'),
  playwright.replace('  - mystery-role', '  - UnknownRole'),
  playwright.replace('  - mystery-role', '  - /unsupported:'),
  playwright.replace(': false', ': |'),
  playwright.replace(': false', ': >'),
  playwright.replace(': false', ': ...'),
  playwright.replace(': false', ': …'),
  playwright.replace('[level=3]', '[level=[3]]'),
  playwright.replace('```yaml', '```yml'),
  playwright.replace('```yaml\n', '```yaml\n```yaml\n'),
  playwright.replace(suffix, ''),
  playwright + '### Snapshot\n```yaml\n- button [ref=e8]\n```\n',
  playwright + '### Error\nFailure\n',
  `${preamble}yaml\n- document [ref=e1]\n${suffix}`,
  `${preamble}yaml\n${suffix}`,
  playwright.replace('    - text:', '    continuation:'),
  playwright.replace('\n  -', '\r\n  -'),
];
for (const [i, output] of refusedPlaywright.entries()) {
  test(`Playwright refuses whole unsupported snapshot ${i}`, () => assert.equal(reduceAutomaticSnapshot(observation(output)), undefined));
}

const refusedChrome = [
  chrome.replace('uid=1_3', 'uid=1_2'), chrome.replace('uid=1_3', 'uid=unknown'),
  chrome.replace('  uid=1_3', '   uid=1_3'), chrome.replace('"Panel"', '"Panel'),
  chrome.replace('"Panel"', '"Panel\ncontinued"'), chrome + 'note: clipped\n',
  chrome + '\n', chrome.replace('## Latest page snapshot', '### Latest page snapshot'),
  chrome.replace('RootWebArea', '...'), chrome.replace('tab "Panel" selected', ''),
];
for (const [i, output] of refusedChrome.entries()) {
  test(`Chrome refuses whole unsupported snapshot ${i}`, () => assert.equal(reduceAutomaticSnapshot(observation(output, "take_snapshot")), undefined));
}

test("tool identity, actual status, completeness and partial args refuse", () => {
  for (const tool of ["snapshot", "browser_snapshot_extra", "prefixbrowser_snapshot", "take_snapshot_extra"]) {
    assert.equal(reduceAutomaticSnapshot(observation(playwright, tool)), undefined);
  }
  for (const patch of [
    { source: "native" }, { status: "failure" }, { status: "unknown" },
    { completeness: "truncated" }, { completeness: "unknown" },
    { metadata: { truncated: true } }, { metadata: { truncated: "false" } },
    { metadata: { exit: 1 } }, { metadata: { exit: "0" } },
  ] as Partial<AutomaticObservation>[]) assert.equal(reduceAutomaticSnapshot(observation(playwright, "browser_snapshot", patch)), undefined);
  for (const args of [{ target: "e1" }, { depth: 1 }, { filename: "x" }, { boxes: 1 }, { verbose: true }, { boxes: false, other: false }]) {
    assert.equal(reduceAutomaticSnapshot(observation(playwright, "browser_snapshot", { args })), undefined);
  }
  for (const args of [{ filePath: "x" }, { verbose: 1 }, { boxes: false }, { depth: 1 }]) {
    assert.equal(reduceAutomaticSnapshot(observation(chrome, "take_snapshot", { args })), undefined);
  }
  for (const marker of ['...output truncated...', '...12 lines truncated...', '...3 bytes truncated...']) {
    assert.equal(reduceAutomaticSnapshot(observation(marker + playwright)), undefined);
  }
});

test("quoted brackets, escaped quotes and colons never become references", () => {
  assert.equal(rendered(observation()), expected);
  assert.equal(rendered(observation(playwright.replace('[ref=e5]', '[ref=e99]'))), expected.replace('  e5 ', '  e99 '));
  const noRefs = `${preamble}yaml\n- button "[ref=e1]"\n- button "[ref=e2]"\n${suffix}`;
  assert.equal(reduceAutomaticSnapshot(observation(noRefs)), undefined);
});
