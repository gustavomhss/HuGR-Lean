#!/usr/bin/env bash
set -euo pipefail
if ! branch=$(git branch --show-current); then
  printf '%s\n' 'Cannot read current Git branch.' >&2; exit 1
fi
if [[ "$branch" != main ]]; then
  printf '%s\n' 'Release requires main.' >&2; exit 1
fi
if ! status=$(git status --porcelain); then
  printf '%s\n' 'Cannot read Git working-tree status.' >&2; exit 1
fi
if [[ -n "$status" ]]; then
  printf '%s\n' 'Release requires a clean working tree.' >&2; exit 1
fi
version=$(node --input-type=module -e 'import {readFileSync} from "node:fs"; const p=JSON.parse(readFileSync("package.json","utf8")); const c=readFileSync("CHANGELOG.md","utf8"); if(!/^0\.[0-9]+\.[0-9]+$/.test(p.version)||!c.split("\n").some(line=>line.startsWith(`## ${p.version} — `))) throw new Error("Version/changelog mismatch"); console.log(p.version);')
if git show-ref --verify --quiet "refs/tags/v${version}"; then
  printf '%s\n' 'Release tag already exists.' >&2; exit 1
else
  code=$?
  if [[ "$code" != 1 ]]; then printf '%s\n' 'Cannot inspect local release tag.' >&2; exit 1; fi
fi
if git ls-remote --exit-code --tags origin "refs/tags/v${version}"; then
  printf '%s\n' 'Remote release tag already exists.' >&2; exit 1
else
  code=$?
  if [[ "$code" != 2 ]]; then printf '%s\n' 'Cannot inspect remote release tag.' >&2; exit 1; fi
fi
npm run check
npm run smoke
npm pack
artifact="hugr-lean-${version}.tgz"
node --input-type=module -e 'import {readFileSync,writeFileSync} from "node:fs"; import {createHash} from "node:crypto"; const file=process.argv[1]; writeFileSync(`${file}.sha256`,`${createHash("sha256").update(readFileSync(file)).digest("hex")}  ${file}\n`);' "$artifact"
git tag -a "v${version}" -m "HuGR-Lean ${version}"
git -c credential.helper='!gh auth git-credential' push origin "v${version}"
gh release create "v${version}" "$artifact" "${artifact}.sha256" --verify-tag --title "HuGR-Lean ${version}" --notes-file docs/RELEASE.md --latest
