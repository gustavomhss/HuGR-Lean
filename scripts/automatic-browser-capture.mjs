// Original MIT capture harness. No user profile or desktop access.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createInterface } from 'node:readline';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PAGE = `<!doctype html><html lang="en"><meta charset="utf-8">
<title>Owned capture — 東京</title><h1>Account “雪”</h1>
<label>Name &quot;東京&quot;<input id="name" value="Zoë"></label>
<label><input type="checkbox" checked> Keep “雪”</label>
<button disabled>Unavailable</button><button id="open">Open dialog</button>
<a href="/details">Details</a><select aria-label="Region"><option>東京</option><option>Paris</option></select>
<dialog id="modal" aria-label="Edit &quot;雪&quot;"><label>Dialog name<input id="focus" value="東京"></label>
<button onclick="document.querySelector('dialog').close()">Close</button></dialog>
<script>document.querySelector('#open').onclick=()=>{document.querySelector('dialog').showModal();document.querySelector('#focus').focus()};
console.info('Owned page ready — 雪');fetch('/owned.json').then(r=>r.json());</script></html>`;

export const sha256 = value => createHash('sha256').update(value).digest('hex');
export function decodeLine(line) {
  const value = JSON.parse(line);
  if (!value || value.jsonrpc !== '2.0') throw new Error('Non JSON-RPC stdout');
  return value;
}

// Retain original wire chunks separately; JSON files serialize decoded values, not wire bytes.
export class StdioClient {
  constructor(argv, cwd, timeout = 30000) {
    this.argv = argv; this.timeout = timeout; this.pending = new Map();
    this.records = []; this.stdout = []; this.stderr = []; this.stdin = []; this.next = 0;
    this.child = spawn(argv[0], argv.slice(1), { cwd, stdio: ['pipe', 'pipe', 'pipe'], detached: true });
    this.child.stdout.on('data', chunk => this.stdout.push(chunk));
    this.child.stderr.on('data', chunk => this.stderr.push(chunk));
    this.child.on('error', error => this.fail(error));
    this.child.on('exit', (code, signal) => {
      this.exit = { code, signal }; this.fail(new Error(`Producer exited: ${code}/${signal}`));
    });
    this.lines = createInterface({ input: this.child.stdout });
    this.lines.on('line', line => {
      try {
        const response = decodeLine(line);
        this.records.push({ direction: 'receive', message: response });
        const pending = this.pending.get(response.id);
        if (pending) { clearTimeout(pending.timer); this.pending.delete(response.id); pending.resolve(response); }
      } catch (error) { this.protocolFailure = String(error); this.fail(error); }
    });
  }
  fail(error) {
    for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(error); }
    this.pending.clear();
  }
  send(message) {
    const bytes = Buffer.from(JSON.stringify(message) + '\n');
    this.stdin.push(bytes); this.records.push({ direction: 'send', message });
    this.child.stdin.write(bytes);
  }
  request(method, params = {}) {
    const id = ++this.next;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Timeout: ${method}`)); }, this.timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ jsonrpc: '2.0', id, method, params });
    });
  }
  async start() {
    const result = await this.request('initialize', {
      protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'hugr-owned-capture', version: '1.0.0' },
    });
    if (result.error) throw new Error(JSON.stringify(result.error));
    this.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    const list = await this.request('tools/list');
    this.tools = list.result?.tools;
    return list;
  }
  call(name, args = {}) { return this.request('tools/call', { name, arguments: args }); }
  async close() {
    this.child.stdin.end();
    const exited = () => this.exit !== undefined;
    for (let n = 0; n < 10 && !exited(); n++) await new Promise(r => setTimeout(r, 50));
    if (!exited()) { try { process.kill(-this.child.pid, 'SIGTERM'); } catch {} }
    for (let n = 0; n < 20 && !exited(); n++) await new Promise(r => setTimeout(r, 50));
    if (!exited()) { try { process.kill(-this.child.pid, 'SIGKILL'); } catch {} }
    this.lines.close(); this.fail(new Error('Capture closed'));
  }
}

export async function saveClient(client, directory, prefix) {
  const files = {};
  for (const name of ['stdin', 'stdout', 'stderr']) {
    const bytes = Buffer.concat(client[name]);
    const file = `${prefix}.${name}.bin`;
    await writeFile(resolve(directory, file), bytes);
    files[name] = { file, bytes: bytes.length, sha256: sha256(bytes) };
  }
  const file = `${prefix}.json`;
  const bytes = Buffer.from(JSON.stringify({ argv: client.argv, exit: client.exit,
    protocolFailure: client.protocolFailure, records: client.records }) + '\n');
  await writeFile(resolve(directory, file), bytes);
  files.decoded = { file, bytes: bytes.length, sha256: sha256(bytes) };
  return files;
}

export const CDP_CODE = `async (page) => {
  const session = await page.context().newCDPSession(page);
  await session.send('Accessibility.enable');
  const accessibility = await session.send('Accessibility.getFullAXTree');
  const version = await session.send('Browser.getVersion');
  const target = await session.send('Target.getTargetInfo');
  const window = await session.send('Browser.getWindowForTarget', { targetId: target.targetInfo.targetId });
  await session.detach();
  return { accessibility, version, target, window };
}`;

export function resultJson(response) {
  if (response.error || response.result?.isError) throw new Error('Failed native result');
  const text = response.result?.content?.find(block => block.type === 'text')?.text;
  const marker = '### Result\n';
  if (!text?.startsWith(marker)) throw new Error('Missing native result section');
  const end = text.indexOf('\n### ', marker.length);
  return JSON.parse(text.slice(marker.length, end < 0 ? undefined : end));
}

export async function capture(options) {
  const output = resolve(options.output);
  await mkdir(output, { recursive: true, mode: 0o700 });
  await writeFile(resolve(output, 'owned-page.html'), PAGE);
  const receipt = { serialization: 'Decoded JSON serialized with JSON.stringify; .bin files are exact stdio bytes.',
    started: new Date().toISOString(), node: process.version, page: { file: 'owned-page.html', sha256: sha256(PAGE), license: 'MIT' },
    sources: { playwright: { commit: '1b025d7e20a026371cd5f98ba0cdce48892737c8', license: 'Apache-2.0' },
      devtools: { commit: 'f08dbe152502d66e75fa07fb2588dc0feb42bc20', license: 'Apache-2.0' } },
    failures: [], captures: {} };
  const server = createServer((req, res) => {
    if (req.url === '/owned.json') { res.setHeader('Content-Type', 'application/json'); res.end('{"owned":true,"name":"雪"}'); }
    else { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(PAGE); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  receipt.url = `http://127.0.0.1:${server.address().port}/`;
  async function run(prefix, argv, body) {
    const client = new StdioClient(argv, output, options.timeout);
    try { await client.start(); await body(client); }
    catch (error) { receipt.failures.push({ producer: prefix, error: String(error), argv }); }
    finally { await client.close(); receipt.captures[prefix] = await saveClient(client, output, prefix); }
  }
  try {
    receipt.executable = { path: options.executable, sha256: sha256(await readFile(options.executable)) };
    const pkg = JSON.parse(await readFile(resolve(dirname(options.playwright), 'package.json'), 'utf8'));
    receipt.sources.playwright = { ...receipt.sources.playwright, path: options.playwright, version: pkg.version,
      cliSha256: sha256(await readFile(options.playwright)) };
    receipt.sources.playwright.browsers = JSON.parse(await readFile(resolve(dirname(options.playwright), '../playwright-core/browsers.json'), 'utf8'));
    await run('playwright', [process.execPath, options.playwright, 'mcp', '--headless', '--isolated',
      '--executable-path', options.executable, '--sandbox', '--output-dir', output], async client => {
      const codeTool = client.tools?.find(tool => ['browser_run_code', 'browser_run_code_unsafe'].includes(tool.name))?.name;
      if (!codeTool) throw new Error('Producer advertises no Playwright code tool');
      await client.call('browser_navigate', { url: receipt.url });
      await client.call('browser_snapshot', {});
      await client.call('browser_evaluate', { function: '() => ({title: document.title, inputs: Array.from(document.querySelectorAll("input")).map(e => ({type:e.type,value:e.value,checked:e.checked,disabled:e.disabled}))})' });
      async function cdp(label) {
        const decoded = resultJson(await client.call(codeTool, { code: CDP_CODE }));
        await writeFile(resolve(output, `cdp-${label}.json`), JSON.stringify(decoded) + '\n');
        receipt.runtime = decoded.version;
      }
      await cdp('before');
      await client.call('browser_console_messages', { level: 'info' });
      await client.call('browser_network_requests', { static: true });
      await client.call('browser_click', { target: '#open' });
      await client.call('browser_evaluate', { function: '() => ({focused:document.activeElement.id,modal:document.querySelector("dialog").open})' });
      await client.call('browser_snapshot', {});
      await cdp('modal');
      await client.call('browser_evaluate', { function: '() => { throw new Error("Owned intentional failure — 雪"); }' });
    });
    if (options.devtools) {
      receipt.sources.devtools.path = options.devtools;
      receipt.sources.devtools.entrySha256 = sha256(await readFile(options.devtools));
      receipt.sources.devtools.version = JSON.parse(await readFile(resolve(dirname(options.devtools), '../../../package.json'), 'utf8')).version;
      await run('devtools', [process.execPath, options.devtools, '--headless', '--isolated',
        '--executablePath', options.executable, '--no-usage-statistics'], async client => {
        await client.call('navigate_page', { type: 'url', url: receipt.url });
        await client.call('take_snapshot', {});
        await client.call('evaluate_script', { function: '() => { document.querySelector("#open").click(); return {focused:document.activeElement.id}; }' });
        await client.call('take_snapshot', {});
      });
    } else receipt.failures.push({ producer: 'devtools', error: 'No --devtools entry supplied; no native DevTools capture claimed.' });
  } catch (error) { receipt.failures.push({ producer: 'setup', error: String(error) }); }
  finally {
    await new Promise(r => server.close(r));
    receipt.finished = new Date().toISOString();
    await writeFile(resolve(output, 'receipt.json'), JSON.stringify(receipt) + '\n');
  }
  return receipt;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const options = {};
  for (let i = 2; i < process.argv.length; i += 2) {
    const key = process.argv[i].replace(/^--/, '');
    if (!['output', 'playwright', 'executable', 'devtools', 'timeout'].includes(key) || !process.argv[i + 1]) throw new Error('Expected --output --playwright --executable [--devtools] [--timeout]');
    options[key] = key === 'timeout' ? Number(process.argv[i + 1]) : process.argv[i + 1];
  }
  if (!options.output || !options.playwright || !options.executable) throw new Error('Required: --output --playwright --executable');
  const receipt = await capture(options);
  process.stdout.write(JSON.stringify(receipt) + '\n');
  if (receipt.failures.length) process.exitCode = 1;
}
