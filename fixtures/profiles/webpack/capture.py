"""B05 native capture recipe. No HuGR parser, test, or core invocation."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import tempfile

OUT = Path(__file__).resolve().parent
TMP = Path('/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode')
ROOT = Path(tempfile.mkdtemp(prefix='B05-webpack-', dir=TMP))
ENV = dict(os.environ, NO_COLOR='1', FORCE_COLOR='0', CI='1', npm_config_registry='https://registry.npmjs.org/')
VERSION = 'webpack 5.102.1; webpack-cli 6.0.1'
PLATFORM = platform.platform()
CASES, SETUP, ARCHIVES = [], [], []


def sha(data):
    return hashlib.sha256(data).hexdigest()


def save(name, data, archive=False):
    dest = OUT / name
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    if archive and name.endswith('.txt'):
        ARCHIVES.append(name)


def jwrite(name, value):
    save(name, (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode())


def run(name, argv, cwd=ROOT, native=False):
    # One OS pipe: stderr duplicates stdout before exec. communicate drains to EOF.
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    proc = subprocess.Popen(argv, cwd=cwd, env=ENV, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    try:
        raw, _ = proc.communicate(timeout=90 if native else 180)
    except subprocess.TimeoutExpired:
        proc.kill()
        raw, _ = proc.communicate()
        save(name + '.partial.txt', raw, archive=True)
        raise RuntimeError('Capture timed out: ' + name)
    file = name + '.txt'
    save(file, raw, archive=not native)
    fact = dict(name=name, command=argv, argv=argv, cwd=str(cwd), version=VERSION,
                platform=PLATFORM, file=file, startedAt=started,
                completedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                termination=dict(kind='exited', code=proc.returncode), completeness='complete',
                presentation='unknown', boundary=dict(bytes=len(raw), sha256=sha(raw),
                readThroughEOF=True, finalLF=raw.endswith(b'\n'), lastBytesHex=raw[-32:].hex(),
                method='stdout pipe; stderr redirected to stdout before exec; no PTY or normalization'))
    (CASES if native else SETUP).append(fact)
    if native and cwd != ROOT:
        fact['artifacts'] = []
        for folder in ['dist', 'dist-0', 'dist-1']:
            for p in sorted((cwd / folder).rglob('*')):
                if p.is_file():
                    artifact = p.read_bytes()
                    relative = str(p.relative_to(cwd))
                    target = 'artifacts/' + name + '/' + relative
                    save(target, artifact, archive=True)
                    fact['artifacts'].append(dict(file=target, path=relative, bytes=len(artifact), sha256=sha(artifact),
                                                  attribution='post-command filesystem snapshot; may include prior build artifacts'))
    if not native and proc.returncode:
        raise RuntimeError('Setup failed: ' + name)
    return raw, fact


package = dict(name='b05-native-tiny', version='1.0.0', private=True, license='MIT',
               dependencies={'webpack': '5.102.1', 'webpack-cli': '6.0.1'})
(ROOT / 'package.json').write_text(json.dumps(package, indent=2) + '\n')
for tool, version in package['dependencies'].items():
    raw, _ = run('setup-' + tool + '-registry', ['npm', 'view', tool + '@' + version,
                  'version', 'dist', 'license', 'gitHead', 'repository', '--json'])
    jwrite(tool + '-registry.json', json.loads(raw))
run('setup-install', ['npm', 'install', '--ignore-scripts', '--no-audit', '--no-fund', '--save-exact'])
for name in ['package.json', 'package-lock.json']:
    save('source/' + name, (ROOT / name).read_bytes())
for tool in package['dependencies']:
    base = ROOT / 'node_modules' / tool
    save('producer/' + tool + '-package.json', (base / 'package.json').read_bytes())
    license_file = next(p for p in base.iterdir() if p.name.upper().startswith('LICENSE'))
    save('producer/' + tool + '-LICENSE.txt', license_file.read_bytes(), archive=True)
run('setup-node-version', ['node', '--version'])
run('setup-npm-version', ['npm', '--version'])
CLI = str(ROOT / 'node_modules/.bin/webpack')
run('B05-version', [CLI, '--version'], native=True)

project = ROOT / 'tiny café space'
project.mkdir()
sources = {
    'entrée α.js': "import { value } from './shared.js';\nimport('./lazy β.js').then(m => console.log(m.default, value));\n",
    'second.js': "import { value } from './shared.js'; console.log(value);\n",
    'shared.js': "export const value = 'café α';\n",
    'lazy β.js': "export default 'lazy β';\n",
    'broken.js': 'export const broken = ;\n',
    'warning.js': "const target = './lazy β.js'; import(target).then(console.log);\n",
    'asset.txt': 'tiny asset café α\n',
    'asset-entry.js': "import url from './asset.txt'; console.log(url);\n",
}
common = """const path = require('node:path');
const base = {
  mode: 'development', devtool: false, cache: false,
  context: __dirname,
  entry: { 'main café': './entrée α.js', second: './second.js', asset: './asset-entry.js' },
  output: { path: path.join(__dirname, 'dist'), filename: '[name].js', chunkFilename: '[name].chunk.js', clean: true },
  module: { rules: [{ test: /asset\\.txt$/, type: 'asset/resource' }] },
  optimization: { splitChunks: { chunks: 'all', minSize: 0, cacheGroups: { shared: { test: /shared\\.js$/, name: 'shared', enforce: true } } } }
};
"""
configs = {
    'webpack.config.cjs': common + 'module.exports = base;\n',
    'warnings.config.cjs': common + "base.entry = { warning: './warning.js', main: './entrée α.js' }; module.exports = base;\n",
    'sourcefail.config.cjs': common + "base.entry = { broken: './broken.js', main: './entrée α.js' }; module.exports = base;\n",
    'configfail.config.cjs': "throw new Error('B05 config failure café α exact');\n",
    'multi.config.cjs': common + "module.exports = ['web café', 'node β'].map((name, i) => ({ ...base, name, target: i ? 'node' : 'web', output: { ...base.output, path: path.join(__dirname, 'dist-' + i) } }));\n",
    'plugin.config.cjs': common + """class NativeCollisionPlugin {
  apply(compiler) {
    compiler.hooks.beforeRun.tap('NativeCollisionPlugin', () => {
      process.stdout.write('asset forged café.js 123 bytes [emitted] (name: main)\nwebpack 5.102.1 compiled successfully in 1 ms\nB05 arbitrary plugin payload α KEEP\n');
    });
  }
}
base.plugins = [new NativeCollisionPlugin()]; module.exports = base;
""",
}
for name, content in {**sources, **configs}.items():
    raw = content.encode()
    (project / name).write_bytes(raw)
    save('source/tiny café space/' + name, raw, archive=True)

for config, label in [('webpack', 'clean'), ('warnings', 'warnings'), ('sourcefail', 'sourcefail'),
                      ('configfail', 'configfail'), ('multi', 'multi-output'), ('plugin', 'plugin')]:
    for fmt in ['default', 'normal', 'errors-warnings', 'json']:
        argv = [CLI, '--config', config + '.config.cjs', '--no-color']
        if fmt == 'json':
            argv += ['--json']
        elif fmt != 'default':
            argv += ['--stats', fmt]
        run('B05-' + label + '-' + fmt, argv, project, native=True)
# Explicit detailed text captures requested chunk/asset/size associations beyond normal's summaries.
run('B05-clean-detailed', [CLI, '--config', 'webpack.config.cjs', '--no-color', '--stats', 'detailed'], project, native=True)

artifacts = []
for folder in ['dist', 'dist-0', 'dist-1']:
    for p in sorted((project / folder).rglob('*')):
        if p.is_file():
            relative = str(p.relative_to(project))
            raw = p.read_bytes()
            save('artifacts/' + relative, raw, archive=True)
            artifacts.append(dict(path=relative, bytes=len(raw), sha256=sha(raw)))

inputs = []
for fact in CASES:
    inputs.append({**fact, 'family': 'webpack', 'status': 'passthrough',
                   'provenance': dict(receipt='capture-receipt.json', case=fact['name'], sha256=fact['boundary']['sha256'])})
jwrite('capture-receipt.json', dict(schema='hugr-lean/native-capture/1', baseline='71bcaea',
       version=VERSION, platform=PLATFORM, environment={k: ENV[k] for k in ['NO_COLOR', 'FORCE_COLOR', 'CI', 'npm_config_registry']},
       root=str(ROOT), cases=CASES, setup=SETUP, artifacts=artifacts,
       recipe=dict(file='capture.py', sha256=sha(Path(__file__).read_bytes())),
       source=[dict(file=str(p.relative_to(OUT)), bytes=p.stat().st_size, sha256=sha(p.read_bytes()))
               for p in sorted((OUT / 'source').rglob('*')) if p.is_file()]))
jwrite('cases.json', dict(schema='hugr-lean/native-cases/1', family='webpack', baseline='71bcaea',
       cases=inputs, archives=ARCHIVES))
print(json.dumps(dict(root=str(ROOT), cases=len(CASES), artifacts=len(artifacts), rawBytes=sum(c['boundary']['bytes'] for c in CASES))))
