const path = require('node:path');
const base = {
  mode: 'development', devtool: false, cache: false,
  context: __dirname,
  entry: { 'main café': './entrée α.js', second: './second.js', asset: './asset-entry.js' },
  output: { path: path.join(__dirname, 'dist'), filename: '[name].js', chunkFilename: '[name].chunk.js', clean: true },
  module: { rules: [{ test: /asset\.txt$/, type: 'asset/resource' }] },
  optimization: { splitChunks: { chunks: 'all', minSize: 0, cacheGroups: { shared: { test: /shared\.js$/, name: 'shared', enforce: true } } } }
};
module.exports = ['web café', 'node β'].map((name, i) => ({ ...base, name, target: i ? 'node' : 'web', output: { ...base.output, path: path.join(__dirname, 'dist-' + i) } }));
