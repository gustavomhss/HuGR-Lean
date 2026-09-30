import assert from "node:assert/strict";
import { test } from "node:test";
import { filter } from "../src/core/index.js";
import type { FilterOptions, Observation, Profile, Reduction, Span } from "../src/core/index.js";

const output = "noise noise noise\nCRITICAL: 🔥 café\nsummary\n";
const critical = [output.indexOf("CRITICAL"), output.indexOf("summary")] as const;
const summary = [critical[1], output.length] as const;
const observation = (patch: Partial<Observation> = {}): Observation => ({
  source: "shell", command: "tool test", output, termination: { kind: "exited", code: 0 },
  completeness: "complete", presentation: "unknown", ...patch,
});
const profile = (reduce: Profile["reduce"], patch: Partial<Profile> = {}): Profile => ({
  id: "fixture", match: (argv) => argv[0] === "tool", reduce, ...patch,
});
const good: Reduction = { pieces: [critical, summary], required: [critical, summary] };
const options: FilterOptions = { profiles: [profile(() => good)] };
function exact(result: ReturnType<typeof filter>, status: "passthrough" | "failed_open", input: string = output): void {
  assert.equal(result.status, status);
  assert.equal("replacement" in result, false);
  assert.equal(result.inputBytes, Buffer.byteLength(input));
  assert.equal(result.outputBytes, Buffer.byteLength(input));
}

test("source slices preserve critical Unicode evidence with UTF-16 spans and UTF-8 metrics", () => {
  const result = filter(observation(), options);
  assert.equal(result.status, "reduced");
  if (result.status !== "reduced") assert.fail("expected reduction");
  assert.equal(result.replacement, output.slice(...critical) + output.slice(...summary));
  assert.equal(result.profile, "fixture");
  assert.equal(result.inputBytes, Buffer.byteLength(output));
  assert.equal(result.outputBytes, Buffer.byteLength(result.replacement));
  assert.ok(result.outputBytes < result.inputBytes);
  assert.ok(result.outputBytes > result.replacement.length);
});

test("critical required span removed => failed_open with caller original intact", () => {
  const original = observation();
  const result = filter(original, { profiles: [profile(() => ({ pieces: [summary], required: [critical, summary] }))] });
  exact(result, "failed_open");
  assert.equal(result.reason, "invalid_reduction");
  assert.equal(original.output, output);
});

test("required evidence cannot be partially emitted, reordered, duplicated or broken by formatting", () => {
  const cases: Reduction[] = [
    { pieces: [[critical[0], critical[1] - 1], summary], required: [critical] },
    { pieces: [[critical[0], critical[0] + 2], { text: "\n" }, [critical[0] + 2, critical[1]]], required: [critical] },
    { pieces: [critical, summary], required: [summary, critical] },
    { pieces: [critical, summary], required: [critical, critical] },
    { pieces: [critical, summary], required: [critical, [critical[0] + 1, critical[1]]] },
    { pieces: [summary, critical], required: [critical, summary] },
    { pieces: [critical, critical], required: [critical] },
    { pieces: [critical, summary], required: [] },
  ];
  for (const reduction of cases) exact(filter(observation(), { profiles: [profile(() => reduction)] }), "failed_open");
});

test("adjacent slices cover evidence intact; fixed separators format outside required spans", () => {
  const split = critical[0] + 2;
  const result = filter(observation(), { profiles: [profile(() => ({
    pieces: [[critical[0], split], { text: "" }, [split, critical[1]], { text: ":\n" }, summary], required: [critical, summary],
  }))] });
  assert.equal(result.status, "reduced");
  if (result.status !== "reduced") assert.fail("expected reduction");
  assert.equal(result.replacement, output.slice(...critical) + ":\n" + output.slice(...summary));
});

test("required coverage scales over disjoint ranges, shared covering spans and a late missing range", () => {
  // Count built-in span-search comparisons, not wall time; refutes the previous every/some scan.
  const some = Array.prototype.some;
  let visits = 0;
  Array.prototype.some = function (predicate, thisArg) {
    return some.call(this, (value, index, array) => {
      if (Array.isArray(value) && value.length === 2 && typeof value[0] === "number") visits++;
      return predicate.call(thisArg, value, index, array);
    });
  };
  try {
    for (const count of [1024, 2048]) {
      const input = "xx__" + "ab__".repeat(count);
      const pieces: Span[] = [[0, 2]], required: Span[] = [];
      for (let i = 0; i < count; i++) {
        const start = 4 + i * 4;
        pieces.push([start, start + 2]);
        required.push([start, start + 1], [start + 1, start + 2]);
      }
      visits = 0;
      assert.equal(pieces.some(() => false), false);
      assert.equal(visits, pieces.length, "comparison counter positive control");
      visits = 0;
      const result = filter(observation({ output: input }), { profiles: [profile(() => ({ pieces, required }))] });
      const work = visits;
      assert.equal(result.status, "reduced");
      if (result.status === "reduced") assert.equal(result.replacement, "xx" + "ab".repeat(count));
      assert.ok(work <= 4 * (pieces.length + required.length), "span searches exceeded linear comparison budget");
      exact(filter(observation({ output: input }), { profiles: [profile(() => ({ pieces: pieces.slice(0, -1), required }))] }), "failed_open", input);
    }
  } finally {
    Array.prototype.some = some;
  }
});

test("fixed formatting admits only the six closed pieces, outside required evidence", () => {
  for (const text of ["", " ", "\n", ":\n", "- ", "+ "]) {
    const result = filter(observation(), { profiles: [profile(() => ({ pieces: [{ text }, critical, summary], required: [critical, summary] }))] });
    assert.equal(result.status, "reduced");
    if (result.status === "reduced") assert.equal(result.replacement, text + output.slice(critical[0]));
  }
  for (const text of ["+---", ":", "  ", "\n\n", "...", "...\n", "• ", "OK", "1", "\t", "\r"]) {
    exact(filter(observation(), { profiles: [profile(() => ({ pieces: [{ text }, critical], required: [critical] }))] }), "failed_open");
  }
});

test("invalid span bounds, shapes and surrogate boundaries fail open", () => {
  const emoji = output.indexOf("🔥");
  const invalid: unknown[] = [[0, 0], [-1, 2], [0, output.length + 1], [3, 2], [0.5, 2], [0, NaN], [0, Infinity],
    ["0", 2], [0], [0, 1, 2], { start: 0, end: 2 }, [emoji, emoji + 1], [emoji + 1, emoji + 2]];
  for (const value of invalid) {
    for (const reduction of [{ pieces: [value], required: [critical] }, { pieces: [critical], required: [value] }])
      exact(filter(observation(), { profiles: [profile(() => reduction as Reduction)] }), "failed_open");
  }
  const unicode = observation({ output: "noise\n🔥é\n" });
  const result = filter(unicode, { profiles: [profile(() => ({ pieces: [[6, 10]], required: [[6, 10]] }))] });
  assert.equal(result.status, "reduced");
  if (result.status === "reduced") assert.equal(result.replacement, "🔥é\n");
});

test("invalid reductions and fabricated text are rejected", () => {
  const invalid: unknown[] = [null, false, "text", {}, { pieces: [], required: [critical] },
    { pieces: [critical] }, { pieces: [critical], required: null },
    { pieces: [{ text: "OK" }, critical], required: [critical] },
    { pieces: [{ text: 1 }, critical], required: [critical] },
    { pieces: [{ text: "\u001b[2J" }, critical], required: [critical] },
    { pieces: [{ text: "\r" }, critical], required: [critical] }];
  for (const value of invalid) exact(filter(observation(), { profiles: [profile(() => value as Reduction)] }), "failed_open");
});

test("equal or larger UTF-8 output never replaces caller original", () => {
  for (const pieces of [[[0, output.length]], [{ text: " " }, [0, output.length]]] as const) {
    const result = filter(observation(), { profiles: [profile(() => ({ pieces, required: [critical] }))] });
    exact(result, "passthrough");
    assert.equal(result.reason, "not_smaller");
  }
  exact(filter(observation({ output: "" }), { profiles: [] }), "passthrough", "");
});

test("overlapping matches fail open before any reducer, even with safe normalization available", () => {
  let calls = 0;
  const reduce = (): Reduction => { calls++; return good; };
  const input = "\u001b[31m" + output + "\u001b[0m";
  const result = filter(observation({ output: input, presentation: "terminal-rendered" }), {
    profiles: [profile(reduce), profile(reduce, { id: "second" })],
  });
  exact(result, "failed_open", input);
  assert.equal(result.reason, "overlapping_profiles");
  assert.equal(calls, 0);
});

test("thrown match, parser and reduction getters fail open, without normalized replacement", () => {
  const crash = (): never => { throw new Error("parser crashed"); };
  for (const entry of [profile(() => good, { match: crash }), profile(crash),
    profile(() => ({ get pieces(): never { return crash(); }, required: [critical] }))]) {
    exact(filter(observation(), { profiles: [entry] }), "failed_open");
  }
  exact(filter(observation(), { profiles: [profile(() => good, { match: (() => "true") as unknown as Profile["match"] })] }), "failed_open");
  const colored = "\u001b[31m" + output + "\u001b[0m";
  exact(filter(observation({ output: colored, presentation: "terminal-rendered" }), { profiles: [profile(crash)] }), "failed_open", colored);
});

test("failure, missing execution metadata and incomplete observations never infer success", () => {
  let called = false;
  const entry = profile(() => { called = true; return good; }, { match: () => { called = true; return true; } });
  const input = "\u001b[31mFAIL\u001b[0m\n";
  const patches: Partial<Observation>[] = [
    { termination: { kind: "exited", code: 1 } }, { termination: { kind: "exited", code: 137 } },
    { termination: { kind: "unknown" } }, { termination: { kind: "timed_out" } },
    { completeness: "unknown" }, { completeness: "truncated" }, { source: "other" },
  ];
  for (const patch of patches)
    exact(filter(observation({ output: input, presentation: "terminal-rendered", ...patch }), { profiles: [entry] }), "passthrough", input);
  assert.equal(called, false);
});

test("unknown commands and rejected shell syntax are not recognized from output", () => {
  let calls = 0;
  const entry = profile(() => { calls++; return good; });
  for (const command of ["unknown", "tool test | tee file", "FOO=bar tool test", "tool test\n", "tool =sh"])
    exact(filter(observation({ command }), { profiles: [entry] }), "passthrough");
  assert.equal(calls, 0);
  exact(filter(observation(), { profiles: [profile(() => undefined)] }), "passthrough");
  exact(filter(observation()), "passthrough");
});

test("runtime malformed observations fail open without throwing or returning replacements", () => {
  const invalid: unknown[] = [null, undefined, [], "output", {}, { ...observation(), command: 1 },
    { ...observation(), source: "exec" }, { ...observation(), output: null }, { ...observation(), termination: null },
    { ...observation(), termination: { kind: "exited" } }, { ...observation(), termination: { kind: "exited", code: NaN } },
    { ...observation(), termination: { kind: "exited", code: -1 } }, { ...observation(), termination: { kind: "exited", code: 0.1 } },
    { ...observation(), termination: { kind: "bogus" } }, { ...observation(), completeness: "yes" },
    { ...observation(), presentation: "raw" }, { get output(): never { throw new Error("getter"); } }];
  for (const value of invalid) {
    const result = filter(value as Observation, options);
    assert.equal(result.status, "failed_open");
    assert.equal("replacement" in result, false);
  }
});

test("runtime malformed options and profiles fail open", () => {
  const invalid: unknown[] = [null, [], 1, { maxInputBytes: 0 }, { maxInputBytes: -1 }, { maxInputBytes: 0.5 },
    { maxInputBytes: NaN }, { maxInputBytes: Infinity }, { maxInputBytes: "100" }, { maxInputBytes: 16 * 1024 * 1024 + 1 },
    { profiles: null }, { profiles: {} }, { profiles: [null] }, { profiles: [{}] }, { profiles: [{ id: "", match: () => true, reduce: () => good }] },
    { profiles: [{ id: "fixture", match: true, reduce: () => good }] }, { profiles: [{ id: "fixture", match: () => true, reduce: false }] },
    { get profiles(): never { throw new Error("getter"); } }];
  for (const value of invalid) exact(filter(observation(), value as FilterOptions), "failed_open");
});

test("byte limits are inclusive, bounded and default to 4 MiB", () => {
  const entry = profile(() => ({ pieces: [[0, 1]], required: [[0, 1]] }));
  const mib = 1024 * 1024;
  for (const maxInputBytes of [1, 4, 16].map((size) => size * mib)) {
    const input = "é".repeat(maxInputBytes / 2);
    assert.equal(filter(observation({ output: input }), { profiles: [entry], maxInputBytes }).status, "reduced");
    exact(filter(observation({ output: input + "x" }), { profiles: [entry], maxInputBytes }), "passthrough", input + "x");
  }
  for (const maxInputBytes of [1, mib - 1, 16 * mib + 1]) {
    const result = filter(observation(), { profiles: [entry], maxInputBytes });
    exact(result, "failed_open");
    assert.equal(result.reason, "invalid_options");
  }
  const input = "x".repeat(4 * mib);
  assert.equal(filter(observation({ output: input }), { profiles: [entry] }).status, "reduced");
  exact(filter(observation({ output: input + "x" }), { profiles: [entry] }), "passthrough", input + "x");
});

test("snapshots isolate caller mutation; reducers see frozen argv, observation and termination", () => {
  const original = observation();
  let reads = 0;
  const input = { ...original, get output(): string { reads++; return output; } };
  const second = profile(() => { assert.fail("mutated reducer used"); });
  const first = profile((baseline, frozen) => {
    assert.equal(baseline, output);
    assert.equal(frozen.output, output);
    assert.equal(frozen.command, "tool test");
    assert.deepEqual(frozen.termination, { kind: "exited", code: 0 });
    assert.equal(Object.isFrozen(frozen), true);
    assert.equal(Object.isFrozen(frozen.termination), true);
    assert.throws(() => { (frozen as { output: string }).output = "changed"; }, TypeError);
    return good;
  }, { match: (argv) => {
    assert.deepEqual(argv, ["tool", "test"]);
    assert.equal(Object.isFrozen(argv), true);
    assert.throws(() => { (argv as string[]).push("changed"); }, TypeError);
    (input as { command: string }).command = "unknown";
    (input.termination as { code: number }).code = 1;
    (first as { reduce: Profile["reduce"] }).reduce = second.reduce;
    return true;
  } });
  assert.equal(filter(input, { profiles: [first] }).status, "reduced");
  assert.equal(reads, 1);
});

test("admitted grammar uses the normalized baseline, with explicit terminal-rendered presentation", () => {
  const colored = "\u001b[31m" + output + "\u001b[0m";
  const entry = profile((baseline, frozen) => {
    assert.equal(baseline, output);
    assert.equal(frozen.output, baseline);
    return good;
  });
  const result = filter(observation({ output: colored, presentation: "terminal-rendered" }), { profiles: [entry] });
  assert.equal(result.status, "reduced");
  if (result.status === "reduced") assert.equal(result.replacement, output.slice(critical[0]));
  exact(filter(observation({ output: colored, presentation: "terminal-rendered" }), { profiles: [] }), "passthrough", colored);
  exact(filter(observation({ output: colored }), { profiles: [] }), "passthrough", colored);
  const again = filter(observation({ output, presentation: "terminal-rendered" }), { profiles: [] });
  exact(again, "passthrough");
});

test("unknown commands and unsupported grammar remain exact despite terminal-rendered SGR", () => {
  const colored = "\u001b[31m" + output + "\u001b[0m";
  const input = observation({ output: colored, presentation: "terminal-rendered" });
  const noProfile = filter(input, { profiles: [] });
  exact(noProfile, "passthrough", colored);
  assert.equal(noProfile.reason, "no_profile");
  exact(filter({ ...input, command: "unknown" }, options), "passthrough", colored);
  let calls = 0;
  const unsupported = filter(input, { profiles: [profile((baseline) => {
    calls++;
    assert.equal(baseline, output);
    return undefined;
  })] });
  exact(unsupported, "passthrough", colored);
  assert.equal(unsupported.reason, "unsupported_output");
  assert.equal(calls, 1);
});

test("engine preserves every CR and mixed SGR after grammar admits a valid nonsmaller reduction", () => {
  for (const input of ["FAILx\rPASS!", "\u001b[31mFAILx\u001b[0m\rPASS!", "\u001b[31mred\u001b[0m\r\n"]) {
    const entry = profile((baseline) => {
      assert.equal(baseline, input);
      return { pieces: [[0, baseline.length]], required: [[0, baseline.length]] };
    });
    exact(filter(observation({ output: input, presentation: "terminal-rendered" }), { profiles: [entry] }), "passthrough", input);
  }
});

test("only valid admitted grammar with a nonsmaller candidate permits a strictly smaller SGR baseline", () => {
  const colored = "\u001b[31m" + output + "\u001b[0m";
  const input = observation({ output: colored, presentation: "terminal-rendered" });
  exact(filter(input, { profiles: [profile(() => ({ pieces: [summary], required: [critical] }))] }), "failed_open", colored);
  for (const text of ["", "+ "]) {
    const result = filter(input, { profiles: [profile(() => ({ pieces: [{ text }, [0, output.length]], required: [critical] }))] });
    assert.equal(result.status, "normalized");
    if (result.status === "normalized") {
      assert.equal(result.replacement, output);
      assert.equal(result.inputBytes, Buffer.byteLength(colored));
      assert.equal(result.outputBytes, Buffer.byteLength(output));
    }
    exact(filter(observation({ presentation: "terminal-rendered" }), {
      profiles: [profile(() => ({ pieces: [{ text }, [0, output.length]], required: [critical] }))],
    }), "passthrough");
  }
});
