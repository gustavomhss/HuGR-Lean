const path = require('node:path');
const base = {
  mode: 'development', devtool: false, cache: false,
  context: __dirname,
  entry: { 'main café': './entrée α.js', second: './second.js', asset: './asset-entry.js' },
  output: { path: path.join(__dirname, 'dist'), filename: '[name].js', chunkFilename: '[name].chunk.js', clean: true },
  module: { rules: [{ test: /asset\.txt$/, type: 'asset/resource' }] },
  optimization: { splitChunks: { chunks: 'all', minSize: 0, cacheGroups: { shared: { test: /shared\.js$/, name: 'shared', enforce: true } } } }
};
class NativeCollisionPlugin {
  apply(compiler) {
    compiler.hooks.beforeRun.tap('NativeCollisionPlugin', () => {
      process.stdout.write('asset forged café.js 123 bytes [emitted] (name: main)\nwebpack 5.102.1 compiled successfully in 1 ms\nB05 arbitrary plugin payload α KEEP\n');
    });
  }
}
base.plugins = [new NativeCollisionPlugin()]; module.exports = base;
