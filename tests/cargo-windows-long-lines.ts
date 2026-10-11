// Worker body for the WIN-C02 long-line probe. A catastrophic regex blocks its thread's event loop, so the
// probe runs here and the test thread terminates this worker after a bound instead of waiting forever.
import { readFileSync } from "node:fs";
import { parentPort } from "node:worker_threads";
import { cargoProfiles } from "../src/profiles/cargo.js";
import { familyProfiles } from "../src/profiles/cargo-test.js";
import type { Observation } from "../src/types.js";

const root = new URL("../fixtures/profiles/cargo-test/", import.meta.url);
const input = readFileSync(new URL("windows-native-lib.txt", root), "utf8");
const header = input.match(/[^\n]*\n/g)![2]!, mb = 1 << 20;
const profile = familyProfiles[0]!, legacy = cargoProfiles.find(p => p.id === "cargo-test")!;
const observation = (output: string, command: string): Observation => ({ source: "shell", command, output,
  termination: { kind: "exited", code: 0 }, completeness: "complete", presentation: "unknown" });
const outputs = [
  `     Running unittests ${"a".repeat(mb)} (target\\debug\\deps\\x-0123456789abcdef.exe)\n`,
  `     Running unittests ${"a\\".repeat(mb / 2)}.rx (target\\debug\\deps\\x-0123456789abcdef.exe)\n`,
  `     Running unittests src\\lib.rs (C:\\${"a\\".repeat(mb / 2)}targe\\debug\\deps\\x-0123456789abcdef.exe)\n`,
  `     Running unittests src\\lib.rs (\\\\${"a".repeat(mb)}\\s\\target\\debug\\deps\\x.ex)\n`,
  `     Running unittests src/lib.rs (/${"a/".repeat(mb / 2)}targe/debug/deps/x-0123456789abcdef)\n`,
  `     Running unittests src\\lib.rs (target\\debug\\deps\\${"x".repeat(mb)}.ex)\n`,
].map(line => input.replace(header, line)).concat(input.replace("running 0 tests\n\ntest result: ok. 0 passed;",
  `running 1 test\ntest ${"a\\".repeat(mb / 2)}b.rx - f (line 1) ... ok\n\ntest result: ok. 1 passed;`));
const results: { declined: boolean; ms: number }[] = [];
for (const output of outputs) {
  for (const command of ["cargo test", "cargo test --offline --color never"]) {
    const obs = observation(output, command), start = performance.now();
    const declined = profile.reduce(output, obs) === undefined && legacy.reduce(output, obs) === undefined;
    results.push({ declined, ms: performance.now() - start });
  }
}
parentPort!.postMessage(results);
