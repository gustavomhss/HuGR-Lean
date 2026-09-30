# CLI ownership

Accountable owner and review contact: `gmhelmold`; the lead assigns an independent CLI/package reviewer.

- Owned implementation: `src/cli/index.ts`, integrated at rebuild `795df94`; `tests/cli.test.ts` witnesses the compiled entry and package `bin` declares its path.
- Responsibilities: strict filter/raw flags, supplied-byte I/O, raw list/get/purge access, doctor/version reporting, and error/exit semantics 0/1/2.
- Coordinate observation defaults/results with [core](../core/OWNERSHIP.md), local storage guarantees with [raw](../raw/OWNERSHIP.md), and host diagnostics with [OpenCode](../opencode/OWNERSHIP.md).
- Review must use actual built/installed entry points and byte-exact failure/unknown-output controls; mocked argument calls alone do not prove packaging.
- Keep `--terminal-rendered`, raw-only `--directory`, exact stdout, and doctor package facts aligned with compiled-source tests; clean-installed package proof remains separate.
- Follow [maintenance](MAINTENANCE.md), [manual](MANUAL.md), and [blast radius](BLAST_RADIUS.md); stop for lead review after green CI.
