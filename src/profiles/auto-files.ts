import type { AutomaticReducer, AutomaticObservation } from "../core/automatic-types.js";
import type { Piece, Reduction, Span } from "../core/types.js";

const absolute = (path: string): boolean => /^(?:\/[^/]|\/(?:$)|\/\/[^/]+\/[^/]+\/|[A-Za-z]:[\\/]|\\\\[^\\]+\\[^\\]+\\)/u.test(path)
  && !/[\r\n\x00-\x1f\x7f]/u.test(path);
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const syntax = (text: string): Piece => ({ text });

function factored(output: string, paths: Span[], before: Piece[] = [], tails?: Span[]): Reduction | undefined {
  if (paths.length < 2) return;
  const first = output.slice(...paths[0]!);
  let common = first.length;
  for (const path of paths.slice(1)) {
    const text = output.slice(...path);
    let i = 0;
    while (i < common && first[i] === text[i]) i++;
    common = i;
  }
  const prefix = first.slice(0, common);
  const length = (first.startsWith("/") ? prefix.lastIndexOf("/") : Math.max(prefix.lastIndexOf("/"), prefix.lastIndexOf("\\"))) + 1;
  if (!length || paths.some(([start, end]) => end - start <= length)) return;
  const scope: Span = [paths[0]![0], paths[0]![0] + length];
  const pieces: Piece[] = [...before, scope, syntax(":"), syntax("\n")];
  const required: Span[] = [...before.filter((p): p is Span => Array.isArray(p)), scope];
  paths.forEach(([start, end], index) => {
    const suffix: Span = [start + length, end];
    pieces.push(suffix); required.push(suffix);
    if (tails) { pieces.push(tails[index]!); required.push(tails[index]!); }
    else if (index < paths.length - 1) pieces.push(syntax("\n"));
  });
  return { pieces, required };
}

function glob(observation: AutomaticObservation): Reduction | undefined {
  const { output, metadata } = observation;
  const rows = output.split("\n");
  if (!integer(metadata.count) || metadata.count !== rows.length || !rows.every(absolute)) return;
  let start = 0;
  const paths: Span[] = rows.map(row => { const span: Span = [start, start + row.length]; start += row.length + 1; return span; });
  return factored(output, paths);
}

function grep(observation: AutomaticObservation): Reduction | undefined {
  const { output, metadata } = observation;
  const header = /^Found ([1-9]\d*) matches\n/u.exec(output);
  if (!header || !integer(metadata.matches) || Number(header[1]) !== metadata.matches) return;
  const paths: Span[] = [], tails: Span[] = [];
  let cursor = header[0].length, matches = 0;
  while (cursor < output.length) {
    const end = output.indexOf("\n", cursor);
    if (end < 0 || output[end - 1] !== ":" || !absolute(output.slice(cursor, end - 1))) return;
    paths.push([cursor, end - 1]);
    const tailStart = end - 1;
    cursor = end + 1;
    let groupMatches = 0;
    while (cursor < output.length) {
      const next = output.indexOf("\n", cursor);
      const stop = next < 0 ? output.length : next;
      const row = output.slice(cursor, stop);
      const match = /^  Line ([1-9]\d*): ([^\r\n]*)$/u.exec(row);
      if (!match || !Number.isSafeInteger(Number(match[1]))) return;
      matches++; groupMatches++;
      cursor = next < 0 ? output.length : next + 1;
      let blanks = 0;
      while (output[cursor] === "\n") { cursor++; blanks++; }
      // Ripgrep text may retain one LF: same-file rows then have one blank,
      // groups have two blanks, and the final match may end in LF.
      // Keep all these bytes inside the source-backed whole tail.
      if (cursor === output.length) { if (blanks) return; break; }
      if (output.startsWith("  Line ", cursor)) { if (blanks > 1) return; continue; }
      if (blanks < 1 || blanks > 2) return;
      break; // Next iteration must validate a complete absolute path header.
    }
    if (!groupMatches) return;
    tails.push([tailStart, cursor]);
  }
  if (matches !== metadata.matches) return;
  return factored(output, paths, [[0, header[0].length]], tails);
}

function directory(observation: AutomaticObservation): Reduction | undefined {
  const { output, args, metadata } = observation;
  if (typeof args.filePath !== "string" || (args.offset !== undefined && ![0, 1].includes(args.offset as number))) return;
  if (args.limit !== undefined && !integer(args.limit)) return;
  const wrapper = /^<path>([^\r\n<>]+)<\/path>\n<type>directory<\/type>\n<entries>\n([^]*?)\n\n\((0|[1-9]\d*) entries\)\n<\/entries>$/u.exec(output);
  if (!wrapper || !absolute(wrapper[1]!)) return;
  const entries = wrapper[2] === "" ? [] : wrapper[2]!.split("\n");
  const count = Number(wrapper[3]);
  if (!Number.isSafeInteger(count) || count !== entries.length || (typeof args.limit === "number" && count > args.limit)) return;
  if (!entries.every(entry => /^[^/\\\r\n\x00-\x1f<>]+\/?$/u.test(entry) && entry !== "." && entry !== "..")) return;
  if (metadata.display !== undefined) {
    const display = metadata.display;
    if (!record(display) || display.type !== "directory" || display.path !== wrapper[1] || display.offset !== 1
      || display.totalEntries !== count || display.truncated !== false || !Array.isArray(display.entries)
      || display.entries.length !== count || !display.entries.every((entry, i) => entry === entries[i])) return;
  }
  // Keep path/type header and complete entries/footer; remove only redundant entries tags.
  const headerEnd = output.indexOf("<entries>");
  const bodyStart = headerEnd + "<entries>\n".length;
  const footerEnd = output.length - "\n</entries>".length;
  const header: Span = [0, headerEnd], body: Span = [bodyStart, footerEnd];
  return { pieces: [header, body], required: [header, body] };
}

/** Native OpenCode 1.18.17 only; unknown grammar never becomes a partial view. */
export const reduceAutomaticFiles: AutomaticReducer = observation => {
  if (observation.source !== "native" || observation.status !== "success" || observation.completeness !== "complete"
    || observation.metadata.truncated !== false) return;
  switch (observation.tool) {
    case "glob": return glob(observation);
    case "grep": return grep(observation);
    case "read": return directory(observation);
    default: return;
  }
};
