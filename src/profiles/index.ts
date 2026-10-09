import type { Profile } from "../core/types.js";
import { runnerProfiles } from "./runners.js";
import { formatProfiles } from "./formats.js";
import { nodeTestProfile } from "./node-test.js";
import { familyProfiles as cargoBuild } from "./cargo-build.js";
import { familyProfiles as cargoTest } from "./cargo-test.js";
import { familyProfiles as goTest } from "./go-test-text.js";
import { familyProfiles as tsc } from "./tsc.js";
import { familyProfiles as goJson } from "./go-test-json.js";
import { familyProfiles as pnpm } from "./pnpm-install.js";
import { familyProfiles as clippy } from "./cargo-clippy.js";
import { familyProfiles as eslint } from "./eslint.js";
import { familyProfiles as biome } from "./biome.js";
import { ruffProfile } from "./ruff.js";
import { familyProfiles as goMod } from "./go-mod.js";
import { pyrightProfile } from "./pyright.js";
import { pylintProfile } from "./pylint.js";

export const profiles: readonly Profile[] = Object.freeze([
  ...cargoTest, ...cargoBuild,
  ...runnerProfiles.filter((profile) => profile.id === "pytest"), ...goTest,
  ...formatProfiles.filter((profile) => profile.id !== "tsc"), ...tsc, nodeTestProfile, ...goJson, ...pnpm,
  ...clippy, ...eslint, ...biome, ruffProfile, ...goMod, pyrightProfile, pylintProfile,
]);
