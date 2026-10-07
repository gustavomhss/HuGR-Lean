import type { Profile } from "../core/types.js";
import { cargoProfiles } from "./cargo.js";
import { goProfile } from "./go.js";
import { pytestProfile } from "./pytest.js";

// Compatibility collection; individual grammars have disjoint ownership.
export const runnerProfiles: readonly Profile[] = [...cargoProfiles, pytestProfile, goProfile];
