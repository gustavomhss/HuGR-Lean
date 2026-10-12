/** Snapshot enumerable facts once, also retaining protocol flags hidden by object spreading. */
export function snapshotAutomaticMetadata(value: Record<string, unknown>): Readonly<Record<string, unknown>> {
  const copy = { ...value };
  for (const key of ["truncated", "exit"]) {
    if (!Object.hasOwn(copy, key) && key in value) copy[key] = value[key];
  }
  return Object.freeze(copy);
}
