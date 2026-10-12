import type { AutomaticFamilyEntry, AutomaticFamilyId, AutomaticObservation, AutomaticReducer } from "./automatic-types.js";
import { reduceAutomaticCli } from "../profiles/auto-cli.js";
import { reduceAutomaticFiles } from "../profiles/auto-files.js";
import { reduceAutomaticSnapshot } from "../profiles/auto-snapshot.js";
import { reduceAutomaticCdp } from "../profiles/auto-cdp.js";
import { reduceAutomaticJson } from "../profiles/auto-json.js";
import { classifyAutomaticSnapshot } from "./automatic-classify.js";

const leaf = (id: AutomaticFamilyId, reduce: AutomaticReducer, lossy = false): AutomaticFamilyEntry =>
  Object.freeze({ id, lossy, reduce: (observation: AutomaticObservation) => classifyAutomaticSnapshot(observation) === id ? reduce(observation) : undefined });

/** Public default leaf families. A leaf never accepts another family's carrier. */
export const automaticReducers: readonly AutomaticFamilyEntry[] = Object.freeze([
  leaf("native-glob", reduceAutomaticFiles), leaf("native-grep", reduceAutomaticFiles),
  leaf("native-read-directory", reduceAutomaticFiles), leaf("cli-ps", reduceAutomaticCli),
  leaf("cli-ls", reduceAutomaticCli),
  leaf("cli-json-producers", observation => reduceAutomaticCdp(observation) ?? reduceAutomaticJson(observation)),
  leaf("cli-ffmpeg", reduceAutomaticCli, true),
  leaf("mcp-browser-snapshot", reduceAutomaticSnapshot), leaf("mcp-devtools-snapshot", reduceAutomaticSnapshot),
  leaf("mcp-cdp-accessibility", observation => reduceAutomaticCdp(observation) ?? reduceAutomaticJson(observation)),
  leaf("mcp-json", reduceAutomaticJson),
]);
export const automaticFamilyIds: readonly AutomaticFamilyId[] = Object.freeze(automaticReducers.map(entry => entry.id));
