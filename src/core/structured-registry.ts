import type { StructuredFormat, StructuredReducer } from "./structured-types.js";
import { reduceJson } from "../profiles/structured-json.js";
import { reduceTable } from "../profiles/structured-table.js";
import { reduceProgress } from "../profiles/structured-progress.js";
import { reduceProcesses } from "../profiles/structured-processes.js";
import { reduceFiles } from "../profiles/structured-files.js";
import { reduceWindows } from "../profiles/structured-windows.js";
import { reduceEvents } from "../profiles/structured-events.js";
import { reduceAccessibility } from "../profiles/structured-accessibility.js";
import { reduceAccessibilityProperties } from "../profiles/structured-accessibility-properties.js";
import { reduceAccessibilityScope } from "../profiles/structured-accessibility-scope.js";

/** Closed, opt-in registry. Existing command profiles remain independent. */
export const structuredReducers: Partial<Record<StructuredFormat, StructuredReducer>> = Object.freeze({
  json: reduceJson, table: reduceTable, progress: reduceProgress, processes: reduceProcesses,
  files: reduceFiles, windows: reduceWindows, events: reduceEvents,
  accessibility: reduceAccessibility, "accessibility-properties": reduceAccessibilityProperties,
  "accessibility-scope": reduceAccessibilityScope,
});
