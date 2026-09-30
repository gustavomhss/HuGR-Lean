/** A narrow literal invocation grammar, not a shell parser or command rewriter. */
export function tokenizeCommand(command: string): readonly string[] | undefined {
  if (typeof command !== "string" || /[^\x20-\x7e\t]/.test(command)) return undefined;
  const argv: string[] = [];
  let offset = 0;
  while (offset < command.length) {
    if (command[offset] === " " || command[offset] === "\t") { offset++; continue; }
    const quote = command[offset];
    let word: string;
    if (quote === '"' || quote === "'") {
      // Quoted executables and concatenated quoting differ across shell dialects.
      if (argv.length === 0) return undefined;
      const end = command.indexOf(quote, offset + 1);
      if (end === -1) return undefined;
      word = command.slice(offset + 1, end);
      if (!/^[A-Za-z0-9_./:+,= -]*$/.test(word)) return undefined;
      offset = end + 1;
      if (offset < command.length && command[offset] !== " " && command[offset] !== "\t") return undefined;
    } else {
      const start = offset;
      while (offset < command.length && command[offset] !== " " && command[offset] !== "\t") offset++;
      word = command.slice(start, offset);
      if (!/^[A-Za-z0-9_./:+,=-]+$/.test(word) || word.startsWith("=")) return undefined;
    }
    // Observation has no dialect: never reinterpret a leading assignment as argv.
    if (argv.length === 0 && (!/^[A-Za-z0-9_./][A-Za-z0-9_./:+,-]*$/.test(word))) return undefined;
    argv.push(word);
  }
  return argv.length ? Object.freeze(argv) : undefined;
}
