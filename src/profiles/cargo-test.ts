import { runnerProfiles } from "./runners.js";
import type { Profile } from "../core/types.js";

export const familyProfiles: readonly Profile[] = runnerProfiles.filter((profile) => profile.id === "cargo-test");
