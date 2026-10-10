import type { AutomaticEntry } from "./automatic-types.js";
import { reduceAutomaticCli } from "../profiles/auto-cli.js";
import { reduceAutomaticFiles } from "../profiles/auto-files.js";
import { reduceAutomaticSnapshot } from "../profiles/auto-snapshot.js";
import { reduceAutomaticCdp } from "../profiles/auto-cdp.js";
import { reduceAutomaticJson } from "../profiles/auto-json.js";

/** Native model views default on. No caller-manufactured schema or per-tool binding. */
export const automaticReducers: readonly AutomaticEntry[] = Object.freeze([
  { id: "auto-cli", reduce: reduceAutomaticCli }, { id: "auto-files", reduce: reduceAutomaticFiles },
  { id: "auto-snapshot", reduce: reduceAutomaticSnapshot }, { id: "auto-cdp", reduce: reduceAutomaticCdp },
  { id: "auto-json", reduce: reduceAutomaticJson },
].map(entry => Object.freeze(entry)));
