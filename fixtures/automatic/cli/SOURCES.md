# Automatic CLI native captures

Generated locally by `HUGR_CAPTURE_CLI=1 npx tsx --test tests/auto-cli.test.ts`.
Each JSON receipt retains full original stdout, stderr, literal argv, actual exit,
producer/version output, platform, executable SHA-256, and stdout SHA-256.
No donor code or output copied. Capture/test/reducer code is original MIT project
material. macOS ps/ls are Apple BSD tools; FFmpeg build reports its
configuration and GPL-enabled version. Output receipts are generated facts, not
copied producer source. No producer-source modifications.

License-reference paths (not claims of exact binary/source correspondence):
`apple-oss-distributions/adv_cmds@60bc9ebf1df7e0a3d8500ecd7e4dd1e008765af5:ps/ps.c`
and `file_cmds@6b3b4403a5e9f4db7b904a795bcfe9f2c321c821:ls/ls.c`
carry BSD-3-Clause terms. Actual producers are pinned by receipt executable
path, binary SHA-256 and macOS 15.3.2 build 24D81. FFmpeg 8.1 release source:
`https://ffmpeg.org/releases/ffmpeg-8.1.tar.xz`; captured build enables GPL and
version3 (GPL-3.0-or-later). No source code lifted; modifications: none.

Temporary ls corpus uses ordinary files, directory and symlink with spaces and
Unicode; no artificial long names or padding. ffmpeg uses local lavfi color/anullsrc
video/audio sources and null or temporary Matroska sink, never GUI/apps. ps captures
every native row without sampling. Test run captures both ps argv forms and every
admitted ls flag form, plus cwd/file/link pathname cases.

Darwin receipts prove Darwin only. Linux grammar is conservative procps fixed
layout and GNU ls English C long listing; the same operational test executes
actual ps/ls on Linux CI. Linux proof remains pending until that lane runs.
Docker daemon was unavailable during local capture; no Linux sample substituted.

## Preservation probe receipt

Focused suite: `npx tsx --test tests/auto-cli.test.ts` (19 tests, no skips on Darwin).
Typecheck: scoped `tsc --noEmit --strict` over `src/profiles/auto-cli.ts` and
`tests/auto-cli.test.ts`. Both passed after restoring the probes below.

- ps command emission shortened with original required span: renderer rejected
  with `Invalid source-backed reduction`.
- ps command end shortened in the span used by BOTH emission and required:
  independent semantic oracle failed, retaining evidence declaration was not enough.
- ls filename/symlink-tail end shortened in BOTH emission and required:
  independent exact full-cell assertion failed.
- numeric range gate bypassed (any digit string admitted): both producer-range
  regressions failed (ffmpeg uint64+1/200,000-digit counters reduced; ls
  400-digit nlink admitted). Restored; `git diff src/` showed only the gate.

## Numeric producer ranges

Checked lexically on canonical digits (no leading zeros) before any
`Number`/`BigInt` conversion; out-of-range output is preserved whole.
FFmpeg `fftools/ffmpeg.c` `print_report` (release 8.1) writes frame,
total_size, out_time_us, out_time_ms, dup_frames and drop_frames with
`%PRId64`: admitted 0..9223372036854775807. out_time hours use `%02PRId64`
of |pts|/AV_TIME_BASE/3600, so hours <= 2562047788 (two-digit zero padding
allowed). ls nlink and `total` <= 18446744073709551615 (Linux nlink_t up to
64-bit, printed as uintmax; Darwin nlink_t is narrower); size (off_t) <=
9223372036854775807. Darwin receipts sit far inside these ranges.

All mutations reverted. Frozen argv rejects extra/conflicting flags and shell
syntax. CR, unknown lines, warnings, incomplete blocks, inconsistent clocks and
decreasing counters produce no replacement. UTF-8 byte checks and all-row/cell
oracles apply to full receipts; UTF-16 spans retain Unicode and trailing spaces.
