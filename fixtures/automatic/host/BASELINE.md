# WP E real-host baseline, 2026-10-10

Baseline `a61dc74d7baea2312e8d6f017d08e1bb839dd477`; host `/Users/gustavoschneiter/.opencode/bin/opencode` returned exactly `1.18.17`. Private SDK: `/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/automatic-sdk-e/config/opencode`, installed exact `@opencode-ai/plugin@1.18.17`. npm warned `ini@7.0.0` requires newer Node than local `v22.17.1`; installation and real host dispatch nevertheless succeeded. No personal SDK/config/auth copied.

All artifact names below are relative to `/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/`. Each completed run retained `argv.json`, config, version, stdout, stderr, model request/response packets, hook JSONL, MCP JSONL, and report or failure JSON. Artifact roots are local evidence, not portable checked-in goldens.

## Genuine shapes from observational source hooks

| Native case | Artifact root | Actual metadata/carrier |
|---|---|---|
| glob | `automatic-host-7R6JtN` | `{count:3,truncated:false}`; newline-separated absolute paths |
| grep | `automatic-host-0JrqLv` | `{matches:3,truncated:false}`; `Found 3 matches`, absolute path headers, `  Line 1: ...` |
| directory read | `automatic-host-5EVAqj` | `{preview,truncated:false,loaded:[],display:{type:"directory",path,entries,offset:1,totalEntries:3,truncated:false}}` |
| bash JSON API | `automatic-host-xxMM1H` | `{output,exit:0,truncated:false}` |
| bash nonzero | `automatic-host-reauUf` | `{output:"native failure e42\n",exit:7,truncated:false}` |
| bash clipping | `automatic-host-7z17Pb` | `{output,exit:0,truncated:true,outputPath}`; model gets native clipping wrapper |
| MCP JSON | `automatic-host-QtSEIp` | raw `{_meta,content:[{type:"text",text,annotations}],structuredContent}`; no invented exit metadata |
| MCP error | `automatic-host-L34Oan` | producer `isError:true`; native error completion, no after-hook |
| MCP clipping | `automatic-host-OIgzYW` | text starts `...output truncated...`; whole packet preserved |
| MCP unknown | `automatic-host-3GHv4I` | opaque text, CR/LF/Unicode/ref preserved |
| MCP attachments | `automatic-host-aVpSRI` | text + resource.text + generated valid PNG + audio; all blocks and structuredContent unchanged; exact PNG data URL reaches next model request |

Directory body actually uses `<path>...</path>\n<type>directory</type>\n<entries>\n...\n\n(3 entries)\n</entries>`. MCP joins text/resource.text with two LF after the hook. Unsupported resource.blob adds exact host-owned `[Binary MCP resource omitted: file:///owned/e42.bin (application/octet-stream, 3 B) is not a supported attachment type]`. Audio stays in raw content but host does not forward it as a model attachment. Initial invalid image control was honestly rejected by oracle; original PNG generator replaced it. Initial failures remain `automatic-host-BbF1Xv` and `automatic-host-sYaWMA`.

## Installed candidate result

Built baseline package, packed snapshot with `npm pack --ignore-scripts`, installed tarball in `automatic-installed-6QsKL4/consumer`, and used plain file plugin entry from installed `dist/index.js` between two observational plugins. No positive plugin options or structuredTools. Each case made exactly two local SSE model requests and used real native/MCP execution.

Six positive assertions failed exactly `Automatic positive did not reduce`: bash JSON (`automatic-host-gZAVPP`), glob (`automatic-host-J4l2eb`), grep (`automatic-host-Dpa1Ky`), directory read (`automatic-host-EViAWj`), MCP JSON (`automatic-host-Q8pUSx`), MCP attachments (`automatic-host-En0ue8`). Lead automatic wiring is absent on this baseline; these assertions remain mandatory, not skipped or weakened.

Preservation runs succeeded: file read `automatic-host-IoyPIj`, bash failure `automatic-host-ZpcsXY`, unknown native `automatic-host-mzod23`, native read failure `automatic-host-iyFYwx`, native clipping `automatic-host-5wcQjY`, MCP error `automatic-host-fsMG41`, MCP clipping `automatic-host-sYKvQL`, MCP unknown `automatic-host-xjparp`, binary resource `automatic-host-o9NXsS`, opt-out `automatic-host-XzBfzm`. Opt-out is only preservation evidence until enabled positive control reduces; it does not establish an active-on/off contrast yet.

## Reproduce

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build
HUGR_SMOKE_DEPS=/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/automatic-sdk-e/config/opencode node scripts/automatic-host-proof.mjs --observe
HUGR_SMOKE_DEPS=/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/automatic-sdk-e/config/opencode node scripts/automatic-host-proof.mjs
```

Focused tests exercise independent oracle rejection, not fake-host compatibility. Real host proof is separate executable and intentionally fails automatic positives on baseline. WP F browser producers can supply `mcp`, `toolName`, and `toolArgs` to `runHostCase`; browser-specific reduction oracle remains lead integration work. No production code, CI, merge, or delegated agent work.

Final strengthened MCP reruns compared raw producer JSON-RPC result with actual before-hook carrier, verified transport arguments, exact native error text, unchanged block references/data, and model image data URL: error `automatic-host-DJst3o`, attachments `automatic-host-oMopy4`, blob `automatic-host-aEtSFy`. Each succeeded observationally. Detached host groups are killed on completion/deadline; launch/exit PID records retained. One outer tool deadline interrupted a loaded-machine run before internal host deadline; identified owned group 43047 was explicitly killed, artifact `automatic-host-6VVoV0` retained.

Final checks: three focused oracle tests passed, typecheck passed, structure passed with existing unrelated size warnings. Calibration: temporarily removed metadata identity assertion; preservation test failed `Missing expected exception.` Restored assertion, reran focused tests successfully. Injected altered arguments, absent next result, wrong ID, attachment source/reference loss, missing JSON ref, and changed native prefix/order are rejected. These checks establish oracle teeth, not successful automatic integration.
