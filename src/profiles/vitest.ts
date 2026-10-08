import { formatProfiles } from "./formats.js";
import type { Profile } from "../core/types.js";

export const familyProfiles: readonly Profile[] = formatProfiles.filter((profile) => profile.id === "vitest");
