import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reduceAutomaticCli } from "../src/profiles/auto-cli.js";
import { filterAutomatic } from "../src/core/automatic.js";
import { renderReduction } from "../src/core/structured-render.js";
import type { AutomaticObservation } from "../src/core/automatic-types.js";

const fixtures = new URL("../fixtures/automatic/cli/", import.meta.url);
const ff = "ffmpeg -hide_banner -loglevel error -nostats -progress pipe:1 -re -f lavfi -i color=size=16x16:rate=5 -t 1.2 -f null -";
const observe = (command: string, output: string): AutomaticObservation => ({ source: "native", tool: "bash", status: "success", completeness: "complete", args: { command }, metadata: { exit: 0, truncated: false }, output });
function view(command: string, output: string) {
  const reduction = reduceAutomaticCli(observe(command, output));
  assert.ok(reduction, command); return renderReduction(output, reduction);
}
function refusal(command: string, output: string) { assert.equal(reduceAutomaticCli(observe(command, output)), undefined, command); }
const ps = "  PID  PPID STAT COMM\n    1     0 Ss   /sbin/launchd\n  123     1 S+   /Applications/日本 😀 app/command suffix  \n";
const ls = "total 8\n-rw-r--r--  1 owner  staff  5 Oct 10 12:34 file 日本 😀 suffix  \nlrwxr-xr-x  1 owner  staff  6 Oct 10  2025 link name -> target 日本 suffix  \n";
const block = (frame: number, time: number, status: string) => `frame=${frame}\nfps=0.00\nstream_0_0_q=-0.0\nbitrate=N/A\ntotal_size=N/A\nout_time_us=${time * 1000000}\nout_time_ms=${time * 1000000}\nout_time=00:00:0${time}.000000\ndup_frames=0\ndrop_frames=0\nspeed= 312x\nprogress=${status}\n`;
const progress = block(1, 0, "continue") + block(5, 1, "end");

test("ps retains every cell and complete Unicode command tail, both literal argv forms", () => {
  for (const flag of ["-axo", "-eo"]) assert.equal(view(`ps ${flag} pid,ppid,stat,comm`, ps),
    "PID\tPPID\tSTAT\tCOMM\n1\t0\tSs\t/sbin/launchd\n123\t1\tS+\t/Applications/日本 😀 app/command suffix  \n");
  const linux = "    PID    PPID STAT COMMAND\n      1       0 Ss   systemd\n    123       1 Sl   command 日本 suffix  \n";
  assert.equal(view("/bin/ps -eo pid,ppid,stat,comm", linux), "PID\tPPID\tSTAT\tCOMMAND\n1\t0\tSs\tsystemd\n123\t1\tSl\tcommand 日本 suffix  \n");
  for (const output of [ps + "warning\n", ps.replace("Ss  ", "??? "), ps.replace("COMM", "ARGS"), ps.slice(0, -1), ps.replace("\n", "\r\n")]) refusal("ps -axo pid,ppid,stat,comm", output);
});
test("ls retains all metadata, entire filename and symlink tail", () => {
  const expected = "total 8\n-rw-r--r--\t1\towner\tstaff\t5\tOct\t10\t12:34\tfile 日本 😀 suffix  \nlrwxr-xr-x\t1\towner\tstaff\t6\tOct\t10\t2025\tlink name -> target 日本 suffix  \n";
  for (const flag of ["-l", "-la", "-al"]) for (const path of ["", " .", " -- ."]) assert.equal(view(`ls ${flag}${path}`, ls), expected);
  for (const output of [ls + "notice\n", ls.replace("Oct", "Okt"), ls.replace("-rw", "crw"), ls.replace(" -> ", " => "), ls.replace("12:34", "25:34"), ls + "\nother:\n", ls.replace("\n", "\r\n")]) refusal("ls -l", output);
});
test("literal identity refuses shell syntax, extra options and conflicting ffmpeg flags", () => {
  for (const command of ["ps aux", "ps -axo pid,ppid,stat,comm extra", "ps -eo pid,ppid,stat,args", "X=1 ps -axo pid,ppid,stat,comm", "ps -axo pid,ppid,stat,comm | sort", "ls -lh", "ls -l . ..", "ls -l -R", "ls -l; pwd"]) refusal(command, command.startsWith("ls") ? ls : ps);
  for (const command of [ff.replace("-hide_banner ", ""), ff.replace("error", "warning"), ff.replace("pipe:1", "pipe:2"), `${ff} -stats`, ff.replace("-nostats", "-nostats -nostats"), ff.replace("-loglevel error", "-loglevel error -v error"), ff.replace("-nostats", "-nostats -report"), ff.replace("-nostats", "-nostats -y -n")]) refusal(command, progress);
  assert.equal(view(ff.replace("-loglevel", "-v"), progress), block(5, 1, "end"));
});
test("ffmpeg retains final WHOLE block only after complete consistent monotonic known blocks", () => {
  assert.equal(view(ff, progress), block(5, 1, "end"));
  for (const output of [progress + "warning\n", progress.replace("frame=1", "frame=6"), progress.replace("out_time_ms=0", "out_time_ms=1"), progress.replace("progress=end", "progress=continue"), progress.replace("dup_frames=0", "dup_frames=2"), progress.replace("total_size=N/A", "total_size=20"), progress.replace("speed= 312x", "speed=???"), progress.replace("fps=0.00", "unknown=0.00"), progress.replace("\n", "\r\n"), progress.slice(0, -1)]) refusal(ff, output);
  for (const facts of [{ status: "failure" }, { completeness: "unknown" }, { source: "mcp" }, { metadata: { exit: 1, truncated: false } }, { metadata: { exit: 0 } }]) assert.equal(reduceAutomaticCli({ ...observe(ff, progress), ...facts } as AutomaticObservation), undefined);
  const result = filterAutomatic(observe(ff, progress), { reducers: [{ id: "cli", reduce: reduceAutomaticCli }] });
  assert.equal(result.status, "reduced"); assert.equal(result.replacement, block(5, 1, "end"));
});

interface Receipt { argv: string[]; original: string; stderr: string; exit: number; platform: string; stdoutSha256: string; binarySha256: string; version: string; }
const hash = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
function semanticOracle(receipt: Receipt) {
  const command = receipt.argv.map((arg, i) => i && arg.includes(" ") ? `'${arg}'` : arg).join(" ");
  const result = view(command, receipt.original), rows = receipt.original.trimEnd().split("\n");
  if (receipt.argv[0]!.endsWith("ps")) {
    // Independent semantic oracle, not reducer-required spans: compare all row cells and full tails.
    const start = rows.shift()!.indexOf("COMM");
    const expected = rows.map(row => [...row.slice(0, start).trim().split(/ +/), row.slice(start)].join("\t"));
    assert.deepEqual(result.trimEnd().split("\n").slice(1).map((row, i) => i === expected.length - 1 ? row.trimEnd() : row), expected.map((row, i) => i === expected.length - 1 ? row.trimEnd() : row));
  } else if (receipt.argv[0]!.endsWith("ls")) {
    const native = rows.filter(row => !row.startsWith("total "));
    const compact = result.trimEnd().split("\n").filter(row => !row.startsWith("total "));
    assert.equal(compact.length, native.length);
    native.forEach((row, i) => {
      const match = /^(\S+) +(\d+) +(\S+) +(\S+) +(\d+) +(\S+) +(\d+) +(\S+) (.*)$/.exec(row)!;
      assert.deepEqual(compact[i]!.split("\t"), match.slice(1));
    });
  } else {
    const final = receipt.original.lastIndexOf("frame=");
    assert.equal(result, receipt.original.slice(final)); assert.ok(result.endsWith("progress=end\n"));
  }
}
for (const file of readdirSync(fixtures).filter(file => file.endsWith(".json"))) test(`full native receipt ${file}`, () => {
  const receipt: Receipt = JSON.parse(readFileSync(new URL(file, fixtures), "utf8"));
  assert.equal(receipt.exit, 0); assert.equal(hash(receipt.original), receipt.stdoutSha256); semanticOracle(receipt);
});

test("operational: actual platform ps/ls and available ffmpeg (no core I/O)", { skip: !["darwin", "linux"].includes(process.platform) }, () => {
  const dir = mkdtempSync(join(tmpdir(), "hugr-cli-"));
  try {
    writeFileSync(join(dir, "notes.txt"), "notes\n"); writeFileSync(join(dir, "file 日本 😀.txt"), "hello\n");
    chmodSync(join(dir, "notes.txt"), 0o644); mkdirSync(join(dir, "folder name")); symlinkSync("file 日本 😀.txt", join(dir, "link name"));
    function capture(name: string, argv: string[], version: string) {
      const run = spawnSync(argv[0]!, argv.slice(1), { encoding: "utf8", env: { ...process.env, LC_ALL: "C", LANG: "C" }, timeout: 15000, maxBuffer: 4 * 1024 * 1024 });
      assert.ifError(run.error); assert.equal(run.status, 0, run.stderr);
      const receipt: Receipt = { argv, original: run.stdout, stderr: run.stderr, exit: run.status!, platform: process.platform, stdoutSha256: hash(run.stdout), binarySha256: hash(readFileSync(argv[0]!)), version };
      semanticOracle(receipt);
      if (process.env.HUGR_CAPTURE_CLI === "1") writeFileSync(new URL(`${process.platform}-${name}.json`, fixtures), JSON.stringify(receipt, null, 2) + "\n");
    }
    const version = process.platform === "darwin" ? spawnSync("/usr/bin/sw_vers", [], { encoding: "utf8" }).stdout : spawnSync("/usr/bin/ps", ["--version"], { encoding: "utf8" }).stdout;
    for (const flag of ["-axo", "-eo"]) capture(`ps${flag}`, ["/bin/ps", flag, "pid,ppid,stat,comm"], version);
    for (const flag of ["-l", "-la", "-al"]) capture(`ls${flag}`, ["/bin/ls", flag, "--", dir], process.platform === "darwin" ? version : spawnSync("/bin/ls", ["--version"], { encoding: "utf8" }).stdout);
    const binary = spawnSync("which", ["ffmpeg"], { encoding: "utf8" }).stdout.trim();
    if (binary) capture("ffmpeg", [binary, ...ff.split(" ").slice(1)], spawnSync(binary, ["-version"], { encoding: "utf8" }).stdout);
    else assert.equal(process.env.HUGR_CAPTURE_CLI, undefined, "capture requires actual ffmpeg");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
