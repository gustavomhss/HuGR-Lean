#!/usr/bin/env node
/**
 * Release gate: `node scripts/release-tag.mjs vX.Y.Z [--notes FILE]`.
 * Fails unless the tag equals `v` + package.json version and CHANGELOG.md and docs/RELEASE.md
 * both have a `## X.Y.Z — ` section. With --notes, writes that docs/RELEASE.md section to FILE.
 */
import { readFileSync, writeFileSync } from "node:fs";

function releaseNotes(markdown, version) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.startsWith(`## ${version} — `));
  if (start < 0) return undefined;
  const end = lines.findIndex((line, index) => index > start && line.startsWith("## "));
  return lines.slice(start + 1, end < 0 ? undefined : end).join("\n").trim() + "\n";
}

function checkRelease(tag, root = new URL("../", import.meta.url)) {
  const read = (file) => readFileSync(new URL(file, root), "utf8");
  const { version } = JSON.parse(read("package.json"));
  if (!/^v\d+\.\d+\.\d+$/.test(tag ?? "")) throw new Error(`Tag must look like vX.Y.Z, got ${JSON.stringify(tag)}`);
  if (tag !== `v${version}`) throw new Error(`Tag ${tag} does not match package.json version ${version}`);
  if (!read("CHANGELOG.md").split(/\r?\n/).some((line) => line.startsWith(`## ${version} — `))) throw new Error(`CHANGELOG.md has no "## ${version} — " section`);
  const notes = releaseNotes(read("docs/RELEASE.md"), version);
  if (!notes || notes.trim().length === 0) throw new Error(`docs/RELEASE.md has no "## ${version} — " section`);
  return { version, notes };
}

const [tag, flag, file] = process.argv.slice(2);
try {
  if (flag !== undefined && (flag !== "--notes" || !file)) throw new Error("Usage: node scripts/release-tag.mjs vX.Y.Z [--notes FILE]");
  const { version, notes } = checkRelease(tag);
  if (file) writeFileSync(file, notes);
  console.log(`Release ${tag} matches hugr-lean@${version}`);
} catch (error) {
  console.error(`::error::${error.message}`);
  process.exitCode = 1;
}
