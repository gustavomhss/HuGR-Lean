// Original MIT fixture. A dependency lifecycle log is not Bun-owned progress.
const fs = require('node:fs');
const path = require('node:path');
const root = fs.realpathSync(process.env.PRIVATEPROJECT);
const here = fs.realpathSync(__dirname);
if (!here.startsWith(root + path.sep)) throw new Error('outside PRIVATEPROJECT');
const marker = 'P04_DEP_POSTINSTALL_EXECUTED_v1';
fs.writeFileSync(path.join(root, 'postinstall.marker'), marker + '\n');
console.log(marker);
console.log('Resolving dependencies');
console.log('Resolved, downloaded and extracted [999]');
console.log('Saved lockfile');
console.log('+ p04-native-shaped-user-log@9.9.9');
console.log('999 packages installed [0.01ms]');
