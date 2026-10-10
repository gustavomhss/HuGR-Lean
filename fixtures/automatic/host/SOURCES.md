# Automatic host proof provenance

Producer, harness, and inventory files are original HuGR-Lean MIT code/data, not copied donor material. `scripts/automatic-proof-server.mjs` uses only Node standard library and MCP newline JSON-RPC transport. Inventory JSON comes from actual owned fixture files, not a HuGR schema. Image/audio/blob blocks are explicit transport-preservation controls, not browser captures.

Host target: `/Users/gustavoschneiter/.opencode/bin/opencode`, version 1.18.17. SDK must be private pinned `@opencode-ai/plugin@1.18.17`; personal 1.18.15 config is not used. Full argv/stdout/stderr/model HTTP packets/hook before-after/MCP transcript remain in isolated temporary artifact roots, including failures. Observational runs prove host shapes only; they do not claim automatic reduction. Browser producer proof belongs to WP F; harness accepts external MCP configuration/tool name/arguments through `runHostCase`.
