# L06 source and golden origins

- Native producer: isolated PyPI Pylint 4.0.4 / astroid 4.0.4; exact URLs and wheel SHA-256 in
  unchanged `install-report.json`, source/recipe/EOF hashes in unchanged `capture-receipt.json`.
- Upstream repository: `https://github.com/pylint-dev/pylint`; tag `v4.0.4` resolves to commit
  `e16f942166511d6fb4427e503a734152fae0c4fe`; license **GPL-2.0-or-later**.
- Grammar source: `pylint/reporters/json_reporter.py` at that commit, `JSONReporter.serialize`,
  `JSON2Reporter.serialize` / `serialize_stats`: distinct exact fields, confidence, integer category
  counters, modulesLinted from `len(stats.by_module)`, score and ignored requested text reports.
- Default evaluation source: `pylint/lint/base_options.py` at that commit, evaluation option:
  zero-clamped default score, fivefold error weight, remaining warning/refactor/convention weights,
  division by analyzed statements. JSON2 lacks statements; validation checks only a feasible integer
  denominator and does not fabricate the missing native metric.
- Modification record: no upstream runtime code copied. New TypeScript validation is original,
  informed by native observations and pinned format definitions. Existing `jsonLayout`, tokenizer,
  `nativeProfile` and core source-span renderer are reused unchanged. The upstream `LICENSE` alone
  is copied verbatim to `LICENSE.pylint.txt`, with pinned source path/URL/hash in original receipt.
- Upstream tag pin is not wheel-to-source build correspondence proof; that remains unattested.
- Inputs and collision plugin: original repository MIT material; exact sources under `inputs/`.
  Original failed stdlib-shadowing bootstrap traceback remains an unchanged archive, not a bound case.
- Independent goldens: the original Python lexical whitespace scanner in `capture.py` produced five
  byte-exact `.candidate.txt` files before the TypeScript profile existed. Four canonical candidates
  are copied verbatim into `.golden.txt`, not generated from implementation output. Hashes, source
  files and bytes recorded in `promotion-receipt.json`; `promote.py` validates original receipt hashes.
- Blocked fifth candidate: clean JSON2 score `10.0` is noncanonical under the frozen helper. It remains
  passthrough and its original 141-byte proposal is not counted in implemented savings.
- Supplemental launchers: `capture-launchers.py` records native direct and Python/Python3 module
  argv in `launcher-receipt.json`. These four raw `.txt` witnesses are explicit noninput archives;
  they do not change the original 41-case receipt or imply broad launcher/OS/version coverage.
