import { lines } from "../core/lines.js";
import type { Profile, Reduction } from "../core/types.js";
import { goMode } from "./go-mode.js";

type Event = {
  Action: string; Time?: string; Package?: string; Test?: string; Elapsed?: number;
  Output?: string; OutputType?: string; ImportPath?: string; FailedBuild?: string;
};

/** Scan a flat object before JSON.parse can erase duplicate keys. Escaped keys are unsupported.
 * Strings (including Output containing JSON) are lexed as strings, never searched for key text.
 * Native Go 1.27.1 events contain only string/number values; nested values are unsupported. */
function flatObject(text: string): Record<string, unknown> | undefined {
  let i = 0;
  const whitespace = (): void => { while (/[ \t\r\n]/.test(text[i] ?? "x")) i++; };
  const stringEnd = (): number | undefined => {
    if (text[i++] !== '"') return undefined;
    while (i < text.length) {
      const c = text[i++]!;
      if (c === '"') return i;
      if (c === "\\") i++; // JSON.parse validates escapes and control characters below.
    }
    return undefined;
  };
  whitespace();
  if (text[i++] !== "{") return undefined;
  const keys = new Set<string>();
  for (;;) {
    whitespace();
    const start = i, end = stringEnd();
    if (end === undefined) return undefined;
    const key = text.slice(start + 1, end - 1);
    if (key.includes("\\") || keys.has(key)) return undefined;
    keys.add(key);
    whitespace();
    if (text[i++] !== ":") return undefined;
    whitespace();
    if (text[i] === '"') {
      if (stringEnd() === undefined) return undefined;
    } else {
      const valueStart = i;
      while (i < text.length && !/[ \t\r\n,}]/.test(text[i]!)) i++;
      if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(text.slice(valueStart, i))) return undefined;
    }
    whitespace();
    const next = text[i++];
    if (next === ",") continue;
    if (next !== "}") return undefined;
    whitespace();
    if (i !== text.length) return undefined;
    try { return JSON.parse(text) as Record<string, unknown>; } catch { return undefined; }
  }
}

const identity = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && !/[\u0000-\u0020\u007f]/.test(value);
const elapsed = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && !Object.is(value, -0);
function time(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match) return false;
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number) as [number, number, number, number, number, number];
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]! &&
    hour <= 23 && minute <= 59 && second <= 59 && Number(match[7] ?? 0) <= 23 && Number(match[8] ?? 0) <= 59;
}

/** Closed observed key variants; no runtime TypeScript dependency or JSON reserialization. */
function event(text: string): Event | undefined {
  const value = flatObject(text);
  if (!value || typeof value.Action !== "string") return undefined;
  let required: string[], optional: string[] = [];
  switch (value.Action) {
    case "build-output": required = ["ImportPath", "Action", "Output"]; break;
    case "build-fail": required = ["ImportPath", "Action"]; break;
    case "start": required = ["Time", "Action", "Package"]; break;
    case "run": case "pause": case "cont": required = ["Time", "Action", "Package", "Test"]; break;
    case "output": required = ["Time", "Action", "Package", "Output"]; optional = ["Test", "OutputType"]; break;
    case "pass": case "skip": required = ["Time", "Action", "Package", "Elapsed"]; optional = ["Test"]; break;
    case "fail": required = ["Time", "Action", "Package", "Elapsed"]; optional = ["Test", "FailedBuild"]; break;
    default: return undefined;
  }
  if (required.some(key => !Object.hasOwn(value, key)) ||
      Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) return undefined;
  for (const [key, item] of Object.entries(value)) {
    if (key === "Elapsed") { if (!elapsed(item)) return undefined; }
    else if (key === "Time") { if (!time(item)) return undefined; }
    else if (key === "Output") { if (typeof item !== "string") return undefined; }
    else if (key === "OutputType") { if (item !== "frame" && item !== "error") return undefined; }
    else if (!identity(item)) return undefined;
  }
  if (Object.hasOwn(value, "Test") && Object.hasOwn(value, "FailedBuild")) return undefined;
  return value as Event;
}

type Phase = "runFrame" | "running" | "pauseFrame" | "paused" | "contFrame" | "passFrame" | "skipFrame" | "pass" | "skip";
interface TestState {
  phase: Phase; duration?: number; parent: string | undefined;
  parallel: boolean; childrenReleased: boolean; children: Set<string>;
}
interface PackageState {
  phase: "active" | "summary" | "terminal" | "closed";
  rootsReleased: boolean; tests: Map<string, TestState>; outputs: Event[];
}
const closed = (t: TestState): boolean => t.phase === "pass" || t.phase === "skip";

function summary(e: Event | undefined, packageName: string): boolean {
  const prefix = `ok  \t${packageName}\t`;
  return e?.OutputType === undefined && e?.Output?.startsWith(prefix) === true &&
    /^(?:\d+\.\d{3}s|\(cached\))\n$/.test(e.Output.slice(prefix.length));
}

function frame(e: Event, t: TestState): boolean {
  const name = e.Test!, output = e.Output!;
  if (output === `=== RUN   ${name}\n` && t.phase === "runFrame") { t.phase = "running"; return true; }
  if (output === `=== PAUSE ${name}\n` && t.phase === "running" && !t.parallel) { t.phase = "pauseFrame"; return true; }
  if (output === `=== CONT  ${name}\n` && t.phase === "contFrame") { t.phase = "running"; return true; }
  for (const action of ["PASS", "SKIP"] as const) {
    const prefix = `--- ${action}: ${name} (`;
    if (t.phase !== "running" || !output.startsWith(prefix) || !output.endsWith("s)\n")) continue;
    const duration = output.slice(prefix.length, -3);
    if (!/^\d+\.\d{2}$/.test(duration) || !Number.isFinite(Number(duration))) return false;
    t.duration = Number(duration);
    t.phase = action === "PASS" ? "passFrame" : "skipFrame";
    return true;
  }
  return false;
}

function reduce(output: string): Reduction | undefined {
  if (!output.endsWith("\n")) return undefined;
  const rows = lines(output), packages = new Map<string, PackageState>();
  const removed = new Set<number>();
  for (let i = 0; i < rows.length; i++) {
    const e = event(rows[i]!.text);
    // Build/test failures remain exact even if their host metadata incorrectly says success.
    if (!e || e.Action.startsWith("build-") || e.Action === "fail" || e.OutputType === "error") return undefined;
    const packageName = e.Package!;
    if (e.Action === "start") {
      if (packages.has(packageName)) return undefined;
      packages.set(packageName, { phase: "active", rootsReleased: false, tests: new Map(), outputs: [] });
      continue;
    }
    const p = packages.get(packageName);
    if (!p || p.phase === "closed" || (e.Test !== undefined && p.phase !== "active")) return undefined;
    if (e.Test === undefined) {
      if (e.Action === "output") {
        if (p.phase === "terminal") return undefined;
        if (p.phase === "summary") {
          if (!summary(e, packageName)) return undefined;
          p.phase = "terminal";
        } else if (e.OutputType === "frame") {
          if (e.Output !== "PASS\n" || !p.tests.size || [...p.tests.values()].some(t => !closed(t))) return undefined;
          p.phase = "summary";
        } else if (e.Output === `?   \t${packageName}\t[no test files]\n`) {
          if (p.tests.size || p.outputs.length) return undefined;
          p.phase = "terminal";
        }
        p.outputs.push(e);
        continue;
      }
      if (p.phase !== "terminal" || (e.Action !== "pass" && e.Action !== "skip")) return undefined;
      if ([...p.tests.values()].some(t => !closed(t))) return undefined;
      const last = p.outputs.at(-1), before = p.outputs.at(-2);
      if (e.Action === "skip") {
        if (p.tests.size || p.outputs.length !== 1 || last?.OutputType !== undefined ||
            last?.Output !== `?   \t${packageName}\t[no test files]\n`) return undefined;
      } else {
        if (!p.tests.size || !summary(last, packageName) ||
            before?.OutputType !== "frame" || before.Output !== "PASS\n" ||
            p.outputs.filter(x => x.OutputType === "frame").length !== 1) return undefined;
      }
      p.phase = "closed";
      continue;
    }
    // Only captured Test lifecycles are admitted. Benchmark run has no test terminal event.
    if (!/^Test[\p{L}\p{N}_]+(?:\/[^\u0000-\u0020\u007f]+)*$/u.test(e.Test)) return undefined;
    const name = e.Test;
    if (e.Action === "run") {
      if (p.tests.has(name)) return undefined;
      const slash = name.lastIndexOf("/"), parent = slash < 0 ? undefined : name.slice(0, slash);
      if (parent === undefined && p.rootsReleased) return undefined;
      const siblings = [...p.tests.values()].filter(t => t.parent === parent);
      if (siblings.some(t => !closed(t) && t.phase !== "paused")) return undefined;
      if (parent !== undefined) {
        const enclosing = p.tests.get(parent);
        if (!enclosing || enclosing.phase !== "running" || enclosing.childrenReleased) return undefined;
        enclosing.children.add(name);
      }
      p.tests.set(name, { phase: "runFrame", parent, parallel: false, childrenReleased: false, children: new Set() });
      removed.add(i);
      continue;
    }
    const t = p.tests.get(name);
    if (!t || closed(t)) return undefined;
    if (e.Action === "output") {
      if (e.OutputType === "frame") {
        if (e.Output!.startsWith("--- ") && [...t.children].some(child => !closed(p.tests.get(child)!))) return undefined;
        if (!frame(e, t)) return undefined;
      } else if (t.phase !== "running") return undefined;
    } else if (e.Action === "pause") {
      if (t.phase !== "pauseFrame" || t.parallel) return undefined;
      if ([...t.children].some(child => !closed(p.tests.get(child)!) && p.tests.get(child)!.phase !== "paused")) return undefined;
      t.phase = "paused";
      t.parallel = true;
      removed.add(i);
    } else if (e.Action === "cont") {
      if (t.phase !== "paused" || !t.parallel) return undefined;
      if ([...p.tests.values()].some(s => s.parent === t.parent && !closed(s) && s.phase !== "paused" && !s.parallel)) return undefined;
      if (t.parent === undefined) p.rootsReleased = true;
      else {
        const enclosing = p.tests.get(t.parent)!;
        if (enclosing.phase !== "running") return undefined;
        enclosing.childrenReleased = true;
      }
      t.phase = "contFrame";
      removed.add(i);
    } else if (e.Action === "pass" || e.Action === "skip") {
      if (t.phase !== `${e.Action}Frame` || t.duration !== Number(e.Elapsed!.toFixed(2)) ||
          [...t.children].some(child => !closed(p.tests.get(child)!))) return undefined;
      t.phase = e.Action;
      if (e.Action === "pass" && e.Elapsed === 0) removed.add(i);
    } else return undefined;
  }
  if (!packages.size || [...packages.values()].some(p => p.phase !== "closed") || !removed.size) return undefined;
  const kept = rows.filter((_, i) => !removed.has(i)).map(row => row.span);
  return { pieces: kept, required: kept };
}

export const familyProfiles: readonly Profile[] = [{
  id: "go-test-json",
  match: argv => goMode(argv) === "json",
  reduce: (output, observation) => {
    if (observation.source !== "shell" || observation.completeness !== "complete" ||
        observation.presentation !== "unknown" || observation.termination.kind !== "exited" ||
        observation.termination.code !== 0) return undefined;
    return reduce(output);
  },
}];
