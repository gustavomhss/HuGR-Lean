import type { Observation } from "./types.js";

function supportedSgr(parameters: string): boolean {
  if (parameters === "") return true;
  const values = parameters.split(";").map(Number);
  for (let i = 0; i < values.length; i++) {
    const value = values[i]!;
    if (value === 38 || value === 48) {
      const mode = values[++i];
      const count = mode === 5 ? 1 : mode === 2 ? 3 : 0;
      if (!count) return false;
      for (let j = 0; j < count; j++) {
        const channel = values[++i];
        if (channel === undefined || channel < 0 || channel > 255) return false;
      }
    } else if (!(value <= 9 || [21, 22, 23, 24, 25, 27, 28, 29, 39, 49].includes(value)
      || (value >= 30 && value <= 37) || (value >= 40 && value <= 47)
      || (value >= 90 && value <= 97) || (value >= 100 && value <= 107))) return false;
  }
  return true;
}

/** SGR presentation only. Without terminal geometry, any CR preserves the entire input. */
export function normalize(output: string, presentation: Observation["presentation"] = "unknown"): string {
  if (presentation !== "terminal-rendered" || output.includes("\r")) return output;
  let unsafe = false;
  const plain = output.replace(/\x1b\[((?:[0-9]{1,3}(?:;[0-9]{1,3})*)?)m/g, (sequence, parameters: string) => {
    if (supportedSgr(parameters)) return "";
    unsafe = true;
    return sequence;
  });
  if (unsafe || /[\x00-\x09\x0b\x0c\x0e-\x1f\x7f-\x9f\p{Cf}]/u.test(plain)) return output;
  return plain;
}
