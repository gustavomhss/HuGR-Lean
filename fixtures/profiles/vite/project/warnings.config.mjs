export default {
  plugins: [{ name: 'b01-source-warning', transform(code, id) {
    if (id.endsWith('/lazy.js')) return code + '\neval("globalThis.B01 = true");\n';
  } }],
  build: { assetsInlineLimit: 0, chunkSizeWarningLimit: 1, sourcemap: true }
};
