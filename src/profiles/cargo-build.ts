import { cargoProfiles } from "./cargo.js";
import type { Profile } from "../core/types.js";
export const familyProfiles: readonly Profile[] = cargoProfiles.filter((profile) => profile.id === "cargo-build");
