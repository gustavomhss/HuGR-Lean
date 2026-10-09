# Pinned producer evidence

Verbatim line windows; headings added. License MIT for all windows.

## markdownlint-cli2-formatter-default@613b0e9e64eac8e51f0cdc645af0a6026f6cdf50 `formatter-default/markdownlint-cli2-formatter-default.js` L7-L23

```text
// Formats markdownlint-cli2 results in the style of `markdownlint-cli`
const outputFormatter = (/** @type {OutputFormatterOptions} */ options) => {
  const { results, logError } = options;
  for (const errorInfo of results) {
    const { fileName, lineNumber, ruleNames, ruleDescription, errorDetail, errorContext, errorRange, severity } = errorInfo;
    const rule = ruleNames.join("/");
    const line = `:${lineNumber}`;
    const rangeStart = (errorRange && errorRange[0]) || 0;
    const column = rangeStart ? `:${rangeStart}` : "";
    const description = ruleDescription;
    const detail = (errorDetail ? ` [${errorDetail}]` : "");
    const context = (errorContext ? ` [Context: "${errorContext}"]` : "");
    const sev = (severity ? ` ${severity}` : "");
    logError(`${fileName}${line}${column}${sev} ${rule} ${description}${detail}${context}`);
  }
  return Promise.resolve();
};
```

## markdownlint-cli2@916ad0aaa108c64d294101002066f530ea170b10 `README.md` L232-L259

```text
### Output Formatters

In addition to (or instead of) the default behavior of writing a list of all
issues to the standard error (`stderr`) device, custom output formatters can be
configured to produce a variety of outputs like:

- [List of issues (default)][formatter-default]
- [List of issues with color and links][formatter-pretty]
- [GitLab Code Quality report file][formatter-codequality]
- [JSON file][formatter-json]
- [JUnit XML file][formatter-junit]
- [Static Analysis Results Interchange Format/SARIF file][formatter-sarif]
- [Summary of issues found][formatter-summarize]
- [Flexible string template][formatter-template] supporting:
  - Azure Pipelines Task command LogIssue format
  - GitHub Actions workflow commands format

[formatter-default]: ./formatter-default/README.md
[formatter-codequality]: ./formatter-codequality/README.md
[formatter-json]: ./formatter-json/README.md
[formatter-junit]: ./formatter-junit/README.md
[formatter-pretty]: ./formatter-pretty/README.md
[formatter-sarif]: ./formatter-sarif/README.md
[formatter-summarize]: ./formatter-summarize/README.md
[formatter-template]: ./formatter-template/README.md

For more information, refer to the documentation for the `outputFormatters`
parameter below.
```

## markdownlint-cli2@916ad0aaa108c64d294101002066f530ea170b10 `README.md` L261-L265

```text
### Exit Codes

- `0`: Linting was successful and there were no errors (there may be warnings)
- `1`: Linting was successful and there were errors (and possibly warnings)
- `2`: Linting was not successful due to a problem or failure
```

## markdownlint-cli2@916ad0aaa108c64d294101002066f530ea170b10 `README.md` L394-L414

```text
  - `noBanner`: `Boolean` value to disable the display of the banner message and
    version numbers on `stdout`
    - This top-level setting is valid **only** in the directory from which
      `markdownlint-cli2` is run
    - Use with `noProgress` to suppress all output to `stdout` (i.e., `--quiet`)
  - `noInlineConfig`: `Boolean` value to disable the support of
    [HTML comments][html-comment] within Markdown content
    - For example: `<!-- markdownlint-disable some-rule -->`
  - `noProgress`: `Boolean` value to disable the display of progress on `stdout`
    - This top-level setting is valid **only** in the directory from which
      `markdownlint-cli2` is run
    - Use with `noBanner` to suppress all output to `stdout` (i.e., `--quiet`)
  - `outputFormatters`: `Array` of `Array`s, each of which has a `String`
    naming an [output formatter][output-formatters] followed by parameters
    - Formatters can be used to customize the tool's output for different
      scenarios
    - Relative paths are resolved based on the location of the `JSONC` file
    - For example: `[ [ "formatter-name", param_0, param_1, ... ], ... ]`
    - This top-level setting is valid **only** in the directory from which
      `markdownlint-cli2` is run
    - Search [`markdownlint-cli2-formatter` on npm][markdownlint-cli2-formatter]
```

## markdownlint-cli2@916ad0aaa108c64d294101002066f530ea170b10 `README.md` L495-L502

```text
### `markdownlint-cli`

- The glob implementation and handling of pattern matching is slightly
  different
- Configuration files are supported in every directory (vs. only one at the
  root)
- The `INI` config format, `.markdownlintrc`, and `.markdownlintignore` are not
  supported
```

## markdownlint@e41e5a40ba934f079da0ffbdea0309869c034d47 `doc/CustomRules.md` L87-L101

```text
A rule is implemented as an `Object`:

- `names` is a required `Array` of `String` values that identify the rule in
  output messages and config.
- `description` is a required `String` value that describes the rule in output
  messages.
- `information` is an optional (absolute) `URL` of a link to more information
  about the rule.
- `tags` is a required `Array` of `String` values that groups related rules for
  easier customization.
- `parser` is a required `String` value `"markdownit" | "micromark" | "none"`
  that specifies the parser data used via `params.parsers` (see below).
- `asynchronous` is an optional `Boolean` value that indicates whether the rule
  returns a `Promise` and runs asynchronously.
- `function` is a required `Function` that implements the rule and is passed two
```

## markdownlint@e41e5a40ba934f079da0ffbdea0309869c034d47 `doc/CustomRules.md` L124-L148

```text
  - `onError` is a function that takes a single `Object` parameter with one
    required and four optional properties:
    - `lineNumber` is a required `Number` specifying the 1-based line number of
      the error.
    - `detail` is an optional `String` with information about what caused the
      error.
    - `context` is an optional `String` with relevant text surrounding the error
      location.
    - `information` is an optional (absolute) `URL` of a link to override the
      same-named value provided by the rule definition. (Uncommon)
    - `range` is an optional `Array` with two `Number` values identifying the
      1-based column and length of the error.
    - `fixInfo` is an optional `Object` with information about how to fix the
      error (all properties are optional, but at least one of `deleteCount` and
      `insertText` should be present; when applying a fix, the delete should be
      performed before the insert):
      - `lineNumber` is an optional `Number` specifying the 1-based line number
        of the edit.
      - `editColumn` is an optional `Number` specifying the 1-based column
        number of the edit.
      - `deleteCount` is an optional `Number` specifying the number of
        characters to delete (the value `-1` is used to delete the line).
      - `insertText` is an optional `String` specifying the text to insert. `\n`
        is the platform-independent way to add a line break; line breaks should
        be added at the beginning of a line instead of at the end.
```

## markdownlint-cli2@916ad0aaa108c64d294101002066f530ea170b10 `markdownlint-cli2.mjs` L48-L48

```text
const pluralize = (/** @type {number} */ count, /** @type {string} */ noun) => `${count} ${noun}${count === 1 ? "" : (noun.endsWith("x") ? "es" : "s")}`;
```

## markdownlint-cli2@916ad0aaa108c64d294101002066f530ea170b10 `markdownlint-cli2.mjs` L1061-L1065

```text
  // Output finding status
  const showProgress = !baseMarkdownlintOptions.noProgress && !formattingContext.formatting;
  if (showProgress) {
    logMessage(`Finding: ${globPatterns.join(" ")}`);
  }
```

## markdownlint-cli2@916ad0aaa108c64d294101002066f530ea170b10 `markdownlint-cli2.mjs` L1091-L1104

```text
      logMessage(`Found:${fileNames.join("\n ")}`);
    }
    logMessage(`Linting: ${pluralize(fileCount, "file")}`);
  }
  // Lint files
  const taskResults = await lintFiles(context, dirInfos, resolvedFileContents, formattingContext);
  // Output summary
  const { lintResults, issuesReported, filesReported, filesAttempted, issuesAttempted } = flattenTaskResults(baseDir, taskResults);
  if (showProgress) {
    if (issuesAttempted > 0) {
      logMessage(`Attempted: ${pluralize(issuesAttempted, "fix")} in ${pluralize(filesAttempted, "file")}`);
    }
    logMessage(`Summary: ${pluralize(issuesReported, "issue")} in ${pluralize(filesReported, "file")}`);
  }
```

## markdownlint-cli2@916ad0aaa108c64d294101002066f530ea170b10 `markdownlint-cli2.mjs` L1112-L1128

```text
    const outputFormatters =
      (optionsOverride && optionsOverride.outputFormatters) ||
      baseMarkdownlintOptions.outputFormatters;
    const modulePaths = resolveModulePaths(
      baseDir,
      baseMarkdownlintOptions.modulePaths || []
    );
    await outputResults(
      context,
      relativeDir,
      lintResults,
      outputFormatters,
      modulePaths,
      logMessage,
      logError,
      noImport
    );
```

## markdownlint-cli2-formatter-json@24710a7febf3eb8b05a34da9078b40fa2133125b `formatter-json/README.md` L15-L37

```text
## Use

For the default output file name of `"markdownlint-cli2-results.json"`, use
the following `.markdownlint-cli2.jsonc`:

```json
{
  "outputFormatters": [
    [ "markdownlint-cli2-formatter-json" ]
  ]
}
```

To customize the output file name or number of spaces to indent, use the
following `.markdownlint-cli2.jsonc`:

```json
{
  "outputFormatters": [
    [ "markdownlint-cli2-formatter-json", { "name": "custom-name.json", "spaces": 1 } ]
  ]
}
```
```

## markdownlint-cli2-formatter-json@24710a7febf3eb8b05a34da9078b40fa2133125b `formatter-json/markdownlint-cli2-formatter-json.js` L15-L27

```text
// Writes markdownlint-cli2 results to a file in JSON format
const outputFormatter = (/** @type {OutputFormatterOptions} */ options, /** @type {Parameters} */ params) => {
  const { directory, fsPromises, results } = options;
  const { name, spaces } = (params || {});
  const content = JSON.stringify(results, null, spaces || 2);
  return fsPromises.writeFile(
    path.resolve(
      directory,
      name || "markdownlint-cli2-results.json"
    ),
    content,
    "utf8"
  );
```
