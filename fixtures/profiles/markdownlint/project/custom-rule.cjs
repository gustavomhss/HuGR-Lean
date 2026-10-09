// Original L11 fixture code; MIT under this repository's license.
module.exports = {
  names: ["L11-BAD", "no-bad-token"],
  description: "BAD token forbidden",
  information: new URL("https://example.invalid/L11-BAD"),
  tags: ["l11"],
  parser: "none",
  function: (params, onError) => {
    params.lines.forEach((line, index) => {
      const column = line.indexOf("BAD");
      if (column !== -1) {
        onError({
          lineNumber: index + 1,
          detail: "Keep Unicode context and custom aliases",
          context: line,
          range: [column + 1, 3]
        });
      }
    });
  }
};
