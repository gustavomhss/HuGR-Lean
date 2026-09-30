import type { Line } from "./types.js";

export function* iterateLines(text: string): Generator<Line, void, unknown> {
  let start = 0;
  while (start < text.length) {
    const newline = text.indexOf("\n", start);
    const end = newline === -1 ? text.length : newline + 1;
    let textEnd = newline === -1 ? end : newline;
    if (text.charCodeAt(textEnd - 1) === 13) textEnd--;
    yield { text: text.slice(start, textEnd), span: [start, end] };
    start = end;
  }
}

export function lines(text: string): Line[] {
  return Array.from(iterateLines(text));
}
