import type { Profile } from "../core/types.js";
import { familyProfiles as cargoTest } from "./cargo-test.js";
import { familyProfiles as cargoBuild } from "./cargo-build.js";
import { familyProfiles as pytest } from "./pytest.js";
import { familyProfiles as goTest } from "./go-test-text.js";
import { familyProfiles as jest } from "./jest.js";
import { familyProfiles as vitest } from "./vitest.js";
import { familyProfiles as tsc } from "./tsc.js";
import { formatProfiles } from "./formats.js";

export const profiles: readonly Profile[] = Object.freeze([
  ...cargoTest, ...cargoBuild, ...pytest, ...goTest, ...jest, ...vitest,
  ...formatProfiles.filter((profile) => profile.id === "git-status" || profile.id === "rg"), ...tsc,
]);
