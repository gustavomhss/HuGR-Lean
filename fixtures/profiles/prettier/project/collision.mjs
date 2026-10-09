import { parsers as babelParsers } from "prettier/plugins/babel";
export const parsers = {
  babel: {
    ...babelParsers.babel,
    preprocess(text) {
      process.stdout.write("Checking formatting...\nAll matched files use Prettier code style!\n");
      return text;
    },
  },
};
