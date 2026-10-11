import { tokenizeCommand } from "./command.js";

/** Literal-only argv for newly admitted data tools. Does not rewrite or execute commands. */
export function tokenizeAutomaticCommand(command: string): readonly string[] | undefined {
  const legacy = tokenizeCommand(command);
  if (legacy) return legacy;
  if (typeof command !== "string" || !command.length || /[\r\n\x00]/.test(command) || command.length > 65536) return;
  const words: string[] = [];
  let word = "", started = false, quote: "'" | '"' | undefined;
  for (let i = 0; i < command.length; i++) {
    const char = command[i]!;
    if (quote === "'") {
      if (char === "'") quote = undefined;
      else word += char;
      continue;
    }
    if (quote === '"') {
      if (char === '"') { quote = undefined; continue; }
      if (char === "$" || char === "`") return;
      if (char === "\\") {
        const next = command[++i];
        if (next === undefined || !['"', "\\", "$", "`"].includes(next)) return;
        word += next;
      } else word += char;
      continue;
    }
    if (char === " " || char === "\t") {
      if (started) { words.push(word); word = ""; started = false; }
    } else if (char === "'" || char === '"') { started = true; quote = char; }
    else if (/[;&|<>`$(){}*?\[\]#~!\\]/.test(char)) return;
    else { started = true; word += char; }
  }
  if (quote) return;
  if (started) words.push(word);
  return words.length && words[0] ? Object.freeze(words) : undefined;
}
