import type { Profile } from "../core/types.js";
import { runnerProfiles } from "./runners.js";
import { formatProfiles } from "./formats.js";

export const profiles: readonly Profile[] = Object.freeze([...runnerProfiles, ...formatProfiles]);
