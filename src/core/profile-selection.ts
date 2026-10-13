import { profiles } from "../profiles/index.js";
import type { Profile } from "./types.js";

/** Detached immutable records; retain the actual built-in matcher and reducer functions. */
export function getProfiles(): readonly Profile[] {
  return Object.freeze(profiles.map(({ id, match, reduce }) => Object.freeze({ id, match, reduce })));
}
