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
function refusal(command: string, output: string) {
  const observation = observe(command, output);
  assert.equal(reduceAutomaticCli(observation), undefined, command);
  const result = filterAutomatic(observation, { reducers: [{ id: "cli", reduce: reduceAutomaticCli }] });
  assert.equal("replacement" in result, false, command); assert.equal(result.inputBytes, Buffer.byteLength(output));
}
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

// Producer-native ranges: ffmpeg %PRId64 counters (non-negative int64), ls nlink/total uint64, size off_t int64.
const INT64_MAX = "9223372036854775807", INT64_OVER = "9223372036854775808";
const UINT64_MAX = "18446744073709551615", UINT64_OVER = "18446744073709551616", HUGE = "1" + "0".repeat(199999);
function outOfRange(command: string, output: string) {
  refusal(command, output);
  for (const options of [undefined, { reducers: [{ id: "cli", reduce: reduceAutomaticCli }] }]) {
    const result = filterAutomatic(observe(command, output), options);
    assert.notEqual(result.status, "reduced", command); assert.equal("replacement" in result, false);
    assert.equal(result.inputBytes, Buffer.byteLength(output)); assert.equal(result.outputBytes, result.inputBytes);
  }
}
const atMax = progress.replace(/frame=\d+/g, `frame=${INT64_MAX}`).replace(/total_size=N\/A/g, `total_size=${INT64_MAX}`)
  .replace(/dup_frames=0/g, `dup_frames=${INT64_MAX}`).replace(/drop_frames=0/g, `drop_frames=${INT64_MAX}`)
  .replace(/out_time_us=\d+/g, `out_time_us=${INT64_MAX}`).replace(/out_time_ms=\d+/g, `out_time_ms=${INT64_MAX}`)
  .replace(/out_time=\S+/g, "out_time=2562047788:00:54.775807");
test("ffmpeg int64 counters refuse beyond producer range before numeric conversion", () => {
  const final = atMax.slice(atMax.lastIndexOf("frame="));
  assert.equal(view(ff, atMax), final);
  const result = filterAutomatic(observe(ff, atMax), { reducers: [{ id: "cli", reduce: reduceAutomaticCli }] });
  assert.equal(result.status, "reduced"); assert.equal(result.replacement, final);
  for (const big of [UINT64_OVER, INT64_OVER, HUGE]) {
    for (const key of ["frame", "dup_frames", "drop_frames"]) outOfRange(ff, progress.replace(new RegExp(`${key}=\\d+`, "g"), `${key}=${big}`));
    outOfRange(ff, progress.replace(/total_size=N\/A/g, `total_size=${big}`));
  }
  outOfRange(ff, atMax.replace(/out_time_(u|m)s=\d+/g, `out_time_$1s=${INT64_OVER}`).replace(/out_time=\S+/g, "out_time=2562047788:00:54.775808"));
  // Also caught by clock-vs-us disagreement: here the hours gate bounds pre-conversion cost (see spy test).
  outOfRange(ff, progress.replace(/out_time=\d+/g, `out_time=${HUGE}`));
});
test("ffmpeg out_time hours gate refuses non-native padding the clock agreement alone admits", () => {
  // %02PRId64 never pads beyond two digits; BigInt("000") === 0n would otherwise agree with out_time_us=0.
  outOfRange(ff, progress.replace("out_time=00:00:00.000000", "out_time=000:00:00.000000"));
  outOfRange(ff, progress.replace("out_time=00:00:01.000000", "out_time=0000:00:01.000000"));
});
test("range gates run before Number/BigInt: no conversion argument exceeds 20 digits", () => {
  const lengths: number[] = [], real = { BigInt: globalThis.BigInt, Number: globalThis.Number };
  const spy = <T extends object>(target: T) => new Proxy(target, { apply(fn, self, args: unknown[]) { lengths.push(String(args[0]).length); return Reflect.apply(fn as (...a: unknown[]) => unknown, self, args); } });
  const cases: [string, string][] = [
    [ff, progress.replace(/out_time=\d+/g, `out_time=${HUGE}`)], [ff, progress.replace(/frame=\d+/g, `frame=${HUGE}`)],
    [ff, progress.replace(/out_time_(u|m)s=\d+/g, `out_time_$1s=${HUGE}`)], [ff, progress.replace(/total_size=N\/A/g, `total_size=${HUGE}`)],
    ["ls -l", ls.replace("  1 owner", `  ${HUGE} owner`)], ["ls -l", ls.replace("staff  5", `staff  ${HUGE}`)]];
  const results: unknown[] = []; let control = 0;
  globalThis.BigInt = spy(real.BigInt); globalThis.Number = spy(real.Number);
  try {
    // Positive control: a valid stream and listing reach the spied conversions.
    assert.ok(reduceAutomaticCli(observe(ff, progress)) && reduceAutomaticCli(observe("ls -l", ls))); control = lengths.length;
    for (const [command, output] of cases) results.push(reduceAutomaticCli(observe(command, output)));
  } finally { globalThis.BigInt = real.BigInt; globalThis.Number = real.Number; }
  assert.ok(control > 0, "spy observed no conversions");
  assert.deepEqual(results, cases.map(() => undefined));
  assert.ok(Math.max(0, ...lengths) <= 20, `conversion of ${Math.max(...lengths)} digits`);
});
test("ls nlink, size and total refuse beyond producer range before numeric conversion", () => {
  const max = ls.replace("total 8", `total ${UINT64_MAX}`).replaceAll("  1 owner", `  ${UINT64_MAX} owner`).replace("staff  5", `staff  ${INT64_MAX}`);
  assert.equal(view("ls -l", max), `total ${UINT64_MAX}\n-rw-r--r--\t${UINT64_MAX}\towner\tstaff\t${INT64_MAX}\tOct\t10\t12:34\tfile 日本 😀 suffix  \nlrwxr-xr-x\t${UINT64_MAX}\towner\tstaff\t6\tOct\t10\t2025\tlink name -> target 日本 suffix  \n`);
  for (const big of [UINT64_OVER, "1" + "0".repeat(399), HUGE]) {
    outOfRange("ls -l", ls.replace("  1 owner", `  ${big} owner`));
    outOfRange("ls -l", ls.replace("total 8", `total ${big}`));
  }
  for (const big of [INT64_OVER, HUGE]) outOfRange("ls -l", ls.replace("staff  5", `staff  ${big}`));
});
const linuxPs = (pid: string, ppid: string) => `    PID    PPID STAT COMMAND\n${pid.padStart(7)} ${ppid.padStart(7)} Ss   systemd\n`;
const darwinPs = (pid: string, ppid: string) => `  PID  PPID STAT COMM\n${pid.padStart(5)} ${ppid.padStart(5)} Ss   launchd\n`;
test("ps PID/PPID gate refuses beyond Linux PID_MAX_LIMIT inside the 7-wide procps columns", () => {
  assert.equal(view("ps -eo pid,ppid,stat,comm", linuxPs("4194303", "4194303")), "PID\tPPID\tSTAT\tCOMMAND\n4194303\t4194303\tSs\tsystemd\n");
  assert.equal(view("ps -axo pid,ppid,stat,comm", darwinPs("99999", "0")), "PID\tPPID\tSTAT\tCOMM\n99999\t0\tSs\tlaunchd\n");
  for (const big of ["4194304", "9999999"]) for (const output of [linuxPs(big, "1"), linuxPs("2", big)]) outOfRange("ps -eo pid,ppid,stat,comm", output);
});
test("ps column-width refusal: wider values break fixed layout (pid gate is defense in depth)", () => {
  for (const big of ["2147483648", HUGE]) for (const output of [linuxPs(big, "1"), linuxPs("2", big)]) outOfRange("ps -eo pid,ppid,stat,comm", output);
  for (const big of ["100000", HUGE]) for (const output of [darwinPs(big, "1"), darwinPs("2", big)]) outOfRange("ps -axo pid,ppid,stat,comm", output);
  for (const output of [linuxPs("0", "1"), linuxPs("01", "1"), linuxPs("2", "00")]) outOfRange("ps -eo pid,ppid,stat,comm", output);
});
test("ps refuses native Darwin exiting-process rows (STAT ?) and preserves the whole listing", () => {
  // adv_cmds ps print.c state(): unknown/exiting process state prints '?'; comm shows as (name).
  outOfRange("ps -axo pid,ppid,stat,comm", ps + "46503 40672 ?    (gh)\n");
  outOfRange("ps -axo pid,ppid,stat,comm", ps + "38889 38884 ?E   (bun)\n");
});

interface Receipt { argv: string[]; cwd: string; original: string; stderr: string; exit: number; platform: string; stdoutSha256: string; binarySha256: string; version: string; source: string; license: string; capturedAt: string; }
const hash = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
function semanticOracle(receipt: Receipt, live = false) {
  const command = receipt.argv.map((arg, i) => i && arg.includes(" ") ? `'${arg}'` : arg).join(" ");
  if (live && receipt.argv[0]!.endsWith("ps") && reduceAutomaticCli(observe(command, receipt.original)) === undefined) {
    // A live process list can legitimately contain transient exiting rows (Darwin STAT '?'), which the
    // grammar refuses. Only that independently identified production excuses refusal; original must survive.
    const [header, ...rows] = receipt.original.slice(0, -1).split("\n"), state = header!.indexOf("PPID") + 5;
    assert.ok(rows.some(row => row[state] === "?"), `unexplained live ps refusal:\n${receipt.original}`);
    assert.notEqual(process.env.HUGR_CAPTURE_CLI, "1", "do not commit an unsupported live ps receipt; recapture");
    const preserved = filterAutomatic(observe(command, receipt.original), { reducers: [{ id: "cli", reduce: reduceAutomaticCli }] });
    assert.equal("replacement" in preserved, false); assert.equal(preserved.inputBytes, Buffer.byteLength(receipt.original, "utf8"));
    return;
  }
  const result = view(command, receipt.original), rows = receipt.original.slice(0, -1).split("\n");
  const automatic = filterAutomatic(observe(command, receipt.original), { reducers: [{ id: "cli", reduce: reduceAutomaticCli }] });
  assert.equal(automatic.inputBytes, Buffer.byteLength(receipt.original, "utf8"));
  if (Buffer.byteLength(result, "utf8") < automatic.inputBytes) {
    assert.equal(automatic.status, "reduced"); assert.equal(automatic.replacement, result); assert.equal(automatic.outputBytes, Buffer.byteLength(result, "utf8"));
  } else assert.equal("replacement" in automatic, false);
  if (receipt.argv[0]!.endsWith("ps")) {
    // Independent semantic oracle, not reducer-required spans: compare all row cells and full tails.
    const start = rows.shift()!.indexOf("COMM");
    const expected = rows.map(row => [...row.slice(0, start).trim().split(/ +/), row.slice(start)].join("\t"));
    assert.deepEqual(result.slice(0, -1).split("\n").slice(1), expected);
  } else if (receipt.argv[0]!.endsWith("ls")) {
    const native = rows.filter(row => !row.startsWith("total "));
    const compact = result.slice(0, -1).split("\n").filter(row => !row.startsWith("total "));
    assert.equal(compact.length, native.length);
    native.forEach((row, i) => {
      const match = /^(\S+) +(\d+) +(\S+) +(\S+) +(\d+) +(\S+) +(\d+) +(\S+) (.*)$/.exec(row)!;
      assert.deepEqual(compact[i]!.split("\t"), match.slice(1));
    });
  } else {
    const final = receipt.original.lastIndexOf(receipt.original.startsWith("frame=") ? "frame=" : "bitrate=");
    assert.equal(result, receipt.original.slice(final)); assert.ok(result.endsWith("progress=end\n"));
  }
}
const receipts = readdirSync(fixtures).filter(file => file.endsWith(".json"));
test("committed native receipt set exists, contains ps/ls/video/audio/file evidence", () => {
  for (const name of ["ps-axo", "ps-eo", "ls-l", "ls-la", "ls-al", "ls-cwd", "ls-file", "ls-link", "ffmpeg", "ffmpeg-audio", "ffmpeg-file"]) assert.ok(receipts.includes(`darwin-${name}.json`), name);
});
for (const file of receipts) test(`full native receipt ${file}`, () => {
  const receipt: Receipt = JSON.parse(readFileSync(new URL(file, fixtures), "utf8"));
  assert.equal(receipt.exit, 0); assert.equal(receipt.stderr, ""); assert.equal(hash(receipt.original), receipt.stdoutSha256); semanticOracle(receipt);
});

test("operational: actual platform ps/ls and available ffmpeg (no core I/O)", { skip: !["darwin", "linux"].includes(process.platform) }, () => {
  const dir = mkdtempSync(join(tmpdir(), "hugr-cli-"));
  try {
    writeFileSync(join(dir, "notes.txt"), "notes\n"); writeFileSync(join(dir, "file 日本 😀.txt"), "hello\n");
    chmodSync(join(dir, "notes.txt"), 0o644); mkdirSync(join(dir, "folder name")); symlinkSync("file 日本 😀.txt", join(dir, "link name"));
    function capture(name: string, argv: string[], version: string) {
      const run = spawnSync(argv[0]!, argv.slice(1), { cwd: dir, encoding: "utf8", env: { ...process.env, LC_ALL: "C", LANG: "C" }, timeout: 15000, maxBuffer: 4 * 1024 * 1024 });
      assert.ifError(run.error); assert.equal(run.status, 0, run.stderr); assert.equal(run.stderr, "");
      const producer = argv[0]!.endsWith("ffmpeg") ? "ffmpeg" : process.platform === "darwin" ? "apple" : argv[0]!.endsWith("ps") ? "procps" : "coreutils";
      const apple = argv[0]!.endsWith("ps") ? "adv_cmds/blob/60bc9ebf1df7e0a3d8500ecd7e4dd1e008765af5/ps/ps.c" : "file_cmds/blob/6b3b4403a5e9f4db7b904a795bcfe9f2c321c821/ls/ls.c";
      const sources = { ffmpeg: [`https://ffmpeg.org/releases/ffmpeg-${version.split(" ")[2]}.tar.xz`, version.includes("--enable-gpl") ? version.includes("--enable-version3") ? "GPL-3.0-or-later" : "GPL-2.0-or-later" : "LGPL; see captured build configuration"], apple: [`https://github.com/apple-oss-distributions/${apple}`, "BSD-3-Clause; source reference for license only, binary pinned by hash/build"], procps: ["https://gitlab.com/procps-ng/procps", "GPL-2.0-or-later"], coreutils: ["https://www.gnu.org/software/coreutils/", "GPL-3.0-or-later"] };
      const receipt: Receipt = { argv, cwd: dir, original: run.stdout, stderr: run.stderr, exit: run.status!, platform: process.platform, stdoutSha256: hash(run.stdout), binarySha256: hash(readFileSync(argv[0]!)), version, source: sources[producer][0]!, license: sources[producer][1]!, capturedAt: new Date().toISOString() };
      semanticOracle(receipt, true);
      if (process.env.HUGR_CAPTURE_CLI === "1") writeFileSync(new URL(`${process.platform}-${name}.json`, fixtures), JSON.stringify(receipt, null, 2) + "\n");
    }
    const version = process.platform === "darwin" ? spawnSync("/usr/bin/sw_vers", [], { encoding: "utf8" }).stdout : spawnSync("/usr/bin/ps", ["--version"], { encoding: "utf8" }).stdout;
    for (const flag of ["-axo", "-eo"]) capture(`ps${flag}`, ["/bin/ps", flag, "pid,ppid,stat,comm"], version);
    for (const flag of ["-l", "-la", "-al"]) capture(`ls${flag}`, ["/bin/ls", flag, "--", dir], process.platform === "darwin" ? version : spawnSync("/bin/ls", ["--version"], { encoding: "utf8" }).stdout);
    for (const [name, args] of [["ls-cwd", []], ["ls-file", ["notes.txt"]], ["ls-link", ["link name"]]] as const) capture(name, ["/bin/ls", "-l", ...args], version);
    const binary = spawnSync("which", ["ffmpeg"], { encoding: "utf8" }).stdout.trim();
    if (binary) {
      const version = spawnSync(binary, ["-version"], { encoding: "utf8" }).stdout;
      capture("ffmpeg", [binary, ...ff.split(" ").slice(1)], version);
      capture("ffmpeg-audio", [binary, ...ff.replace("color=size=16x16:rate=5", "anullsrc").split(" ").slice(1)], version);
      capture("ffmpeg-file", [binary, ...ff.replace("-f null -", `-c:v ffv1 -f matroska ${join(dir, "video.mkv")}`).split(" ").slice(1)], version);
    }
    else assert.equal(process.env.HUGR_CAPTURE_CLI, undefined, "capture requires actual ffmpeg");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
