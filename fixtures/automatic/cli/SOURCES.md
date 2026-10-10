# Automatic CLI native captures

Generated locally by `HUGR_CAPTURE_CLI=1 npx tsx --test tests/auto-cli.test.ts`.
Each JSON receipt retains full original stdout, stderr, literal argv, actual exit,
producer/version output, platform, executable SHA-256, and stdout SHA-256.
No donor code or output copied. Capture/test/reducer code is original MIT project
material. macOS ps/ls are Apple BSD tools (APSL/BSD); FFmpeg build reports its
configuration and GPL-enabled version. Output receipts are generated facts, not
copied producer source. No producer-source modifications.

Temporary ls corpus uses ordinary files, directory and symlink with spaces and
Unicode; no artificial long names or padding. ffmpeg uses a local lavfi color
source and null sink, never GUI/apps. ps captures every native row without
sampling. Test run captures both ps argv forms and every admitted ls flag form.

Darwin receipts prove Darwin only. Linux grammar is conservative procps fixed
layout and GNU ls English C long listing; the same operational test executes
actual ps/ls on Linux CI. Linux proof remains pending until that lane runs.
Docker daemon was unavailable during local capture; no Linux sample substituted.
