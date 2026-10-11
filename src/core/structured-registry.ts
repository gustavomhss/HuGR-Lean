import type { StructuredFormat, StructuredReducer } from "./structured-types.js";

/** Lead-owned wiring; leaf reducers are installed after independent verification. */
export const structuredReducers: Partial<Record<StructuredFormat, StructuredReducer>> = {};
