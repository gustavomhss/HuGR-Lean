import type { Profile } from "../core/types.js";

// Compiling authoring seam only; lead registers the reviewed implementation later.
export const nodeTestProfile: Profile = {
  id: "node-test",
  match: (argv) => (argv[0] === "node" || argv[0] === "tsx") && argv[1] === "--test",
  reduce: () => undefined,
};
