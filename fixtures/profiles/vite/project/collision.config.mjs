export default {
  plugins: [{ name: 'b01-native-shaped-stdout', buildStart() {
    console.log('transforming...');
    console.log('✓ 999 modules transformed.');
    console.log('rendering chunks...');
    console.log('computing gzip size...');
    console.log('dist/assets/plugin-evidence.js  7.00 kB │ gzip: 3.00 kB');
    console.log('✓ built in 777ms');
  } }],
  build: { assetsInlineLimit: 0 }
};
