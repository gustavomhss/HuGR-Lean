/** Frozen literal argv routing: JSON wins over benchmark, explicit booleans use their final value. */
export function goMode(argv: readonly string[]): "text" | "json" | "bench" | undefined {
  if (argv[0] !== "go" || argv[1] !== "test") return undefined;
  let json = false, bench = false;
  const values = new Set(["-run", "-bench", "-benchtime", "-count", "-cpu", "-parallel", "-timeout", "-tags", "-coverprofile", "-covermode", "-coverpkg", "-p", "-shuffle"]);
  const flags = new Set(["-v", "-race", "-cover", "-short", "-failfast", "-benchmem"]);
  for (let i = 2; i < argv.length; i++) {
    const value = argv[i]!;
    if (value === "-json" || value === "-json=true") { json = true; continue; }
    if (value === "-json=false") { json = false; continue; }
    if (flags.has(value)) continue;
    const [key, inline] = value.split("=", 2);
    if (values.has(key!)) {
      if (key === "-bench") bench = true;
      if (inline === "") return undefined;
      if (inline === undefined) {
        const argument = argv[++i];
        if (argument === undefined || argument.startsWith("-")) return undefined;
      }
      continue;
    }
    if (value.startsWith("-")) return undefined;
  }
  return json ? "json" : bench ? "bench" : "text";
}
