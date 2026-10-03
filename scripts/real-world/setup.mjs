// Network/dependency setup only. Native benchmark commands belong to the capture runner.
import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { runOwnedProcess } from "./owned-process.mjs";

export const PINS = Object.freeze([
  { id: "itoa", repository: "https://github.com/dtolnay/itoa.git", commit: "1577ed901354d0d7448ac162328f9dbf5183124c",
    license: "MIT OR Apache-2.0", licensePaths: ["LICENSE-MIT", "LICENSE-APACHE"], sourcePaths: ["Cargo.toml", "src/lib.rs", "tests/test.rs"] },
  { id: "gjson", repository: "https://github.com/tidwall/gjson.git", commit: "8d89927eff414537088a6092d53fecf6711c1e75",
    license: "MIT", licensePaths: ["LICENSE"], sourcePaths: ["go.mod", "gjson.go", "gjson_test.go"] },
  { id: "boltons", repository: "https://github.com/mahmoud/boltons.git", commit: "4e5faa3d7e4008d89e0d8bf1ea87b6d9a061a16d",
    license: "BSD-3-Clause", licensePaths: ["LICENSE"], sourcePaths: ["pyproject.toml", "tox.ini", "tests/test_iterutils.py"] },
  { id: "ms", repository: "https://github.com/vercel/ms.git", commit: "4ff48cec099f0514c3e9bbca18706c9c21122bfb",
    license: "MIT", licensePaths: ["LICENSE"], sourcePaths: ["package.json", "pnpm-lock.yaml", "jest.config.ts", "src/index.test.ts"] },
  { id: "ufo", repository: "https://github.com/unjs/ufo.git", commit: "f06c800d0c59f2a4a1b9ba65eb6cb61a84419be6",
    license: "MIT", licensePaths: ["LICENSE"], sourcePaths: ["package.json", "pnpm-lock.yaml", "test/parse.test.ts"] },
  { id: "hugr", repository: "https://github.com/gmhelmold/HuGR-Lean.git", commit: "69607794cbb2a3ce6707a509777ac648aa859bdd",
    license: "MIT", licensePaths: ["LICENSE"], sourcePaths: ["package.json", "package-lock.json", "src/core/types.ts", "tests/core.test.ts", "tests/runners.test.ts"] },
].map((pin) => Object.freeze({ ...pin, licensePaths: Object.freeze(pin.licensePaths), sourcePaths: Object.freeze(pin.sourcePaths) })));

export const TOOLING = Object.freeze({ pnpm: "10.33.2", pytest: "9.0.3" });
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (value) => JSON.stringify(value, null, 2) + "\n";

/** Allowlist executable discovery/platform variables; never inherit credentials or tool config. */
export function isolatedEnv(root, source = process.env) {
  const env = {};
  for (const key of ["PATH", "SystemRoot", "WINDIR", "COMSPEC", "PATHEXT"]) if (source[key]) env[key] = source[key];
  Object.assign(env, {
    HOME: path.join(root, "home"), USERPROFILE: path.join(root, "home"),
    XDG_CONFIG_HOME: path.join(root, "config"), XDG_CACHE_HOME: path.join(root, "cache"),
    XDG_DATA_HOME: path.join(root, "data"), XDG_STATE_HOME: path.join(root, "state"),
    TMPDIR: path.join(root, "tmp"), TMP: path.join(root, "tmp"), TEMP: path.join(root, "tmp"),
    npm_config_cache: path.join(root, "cache/npm"), npm_config_prefix: path.join(root, "tooling"),
    npm_config_userconfig: path.join(root, "config/npmrc"), npm_config_globalconfig: path.join(root, "config/npmrc-global"),
    // Use the explicitly installed pnpm, including ms's compatible 10.33.0 declaration.
    npm_config_manage_package_manager_versions: "false",
    CARGO_HOME: path.join(root, "cache/cargo"), RUSTUP_HOME: path.join(root, "cache/rustup"),
    GOPATH: path.join(root, "cache/go-path"), GOMODCACHE: path.join(root, "cache/go-mod"),
    GOCACHE: path.join(root, "cache/go-build"), GOENV: "off", GOTOOLCHAIN: "local",
    PIP_CACHE_DIR: path.join(root, "cache/pip"), PIP_CONFIG_FILE: process.platform === "win32" ? "NUL" : "/dev/null",
    PYTHONNOUSERSITE: "1", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: path.join(root, "config/gitconfig"),
    GIT_TERMINAL_PROMPT: "0", GIT_AUTHOR_NAME: "HuGR benchmark", GIT_AUTHOR_EMAIL: "bench@example.invalid",
    GIT_COMMITTER_NAME: "HuGR benchmark", GIT_COMMITTER_EMAIL: "bench@example.invalid",
  });
  return env;
}

/** Every setup invocation retains raw stdout/stderr/arrival-order bytes, including spawn failure. */
export function setupRunner(root, env) {
  let sequence = 0;
  const session = randomUUID();
  return async (name, file, args, { cwd = root, timeout = 600_000, environment = env } = {}) => {
    if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`SETUP_INVALID_NAME: ${name}`);
    const base = path.join(root, "setup-logs", `${session}-${++sequence}-${name}`);
    await mkdir(path.dirname(base), { recursive: true });
    const stdout = [], stderr = [], merged = [];
    const started = new Date().toISOString();
    await Promise.all(["stdout", "stderr", "output"].map((suffix) => writeFile(`${base}.${suffix}`, "")));
    await writeFile(`${base}.json`, json({ name, file, args, cwd, started, state: "running" }));
    // Append while running: interruption of the caller still leaves observed bytes and running metadata.
    let pending = Promise.resolve(), logError;
    const retain = (stream, chunk) => {
      pending = pending.then(() => Promise.all([appendFile(`${base}.${stream}`, chunk), appendFile(`${base}.output`, chunk)]))
        .catch((error) => { logError ??= error; });
    };
    const result = await runOwnedProcess(file, args, {
      cwd, env: environment, timeout,
      onStdout: (chunk) => { stdout.push(chunk); merged.push(chunk); retain("stdout", chunk); },
      onStderr: (chunk) => { stderr.push(chunk); merged.push(chunk); retain("stderr", chunk); },
    });
    const { timedOut, spawnError, killErrors } = result;
    await pending;
    const record = { name, file, args, cwd, started, state: "finished", finished: new Date().toISOString(), code: result.code, signal: result.signal, timedOut,
      durationMs: result.durationMs, durationBoundary: result.durationBoundary,
      nativeSpawned: result.nativeSpawned, nativeExitObserved: result.nativeExitObserved,
      ...(result.guardianElapsedMs === undefined ? {} : { guardianElapsedMs: result.guardianElapsedMs }),
      ...(result.exitDurationMs === undefined ? {} : { exitDurationMs: result.exitDurationMs }),
      ...(spawnError ? { spawnError } : {}), ...(killErrors.length ? { killErrors } : {}),
      stdout: `${base}.stdout`, stderr: `${base}.stderr`, output: `${base}.output` };
    if (logError) throw Object.assign(new Error(`SETUP_LOG_FAILED: ${name}: ${logError.message}`), { record });
    await writeFile(`${base}.json`, json(record));
    if (spawnError || timedOut || killErrors.length || result.code !== 0 || result.signal) {
      throw Object.assign(new Error(`SETUP_FAILED: ${name}: ${timedOut ? "timeout" : spawnError ?? `exit=${result.code} signal=${result.signal}`}; logs=${base}`), { record });
    }
    return { ...record, text: Buffer.concat(stdout).toString("utf8"), errorText: Buffer.concat(stderr).toString("utf8") };
  };
}

export async function verifyCheckout(project, run) {
  if (!/^[a-f0-9]{40}$/.test(project.commit)) throw new Error(`SETUP_INVALID_PIN: ${project.id}`);
  const head = (await run(`${project.id}-head`, "git", ["rev-parse", "HEAD"], { cwd: project.path })).text.trim();
  if (head !== project.commit) throw new Error(`SETUP_HEAD_MISMATCH: ${project.id}: expected=${project.commit} actual=${head}`);
  const status = (await run(`${project.id}-clean`, "git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: project.path })).text;
  if (status !== "") throw new Error(`SETUP_DIRTY_CHECKOUT: ${project.id}: ${status}`);
  const licenseFiles = [];
  for (const relative of project.licensePaths) {
    const bytes = await readFile(path.join(project.path, relative));
    if (bytes.length === 0) throw new Error(`SETUP_EMPTY_LICENSE: ${project.id}/${relative}`);
    licenseFiles.push({ path: relative, sha256: digest(bytes), bytes: bytes.length });
  }
  const texts = await Promise.all(project.licensePaths.map((relative) => readFile(path.join(project.path, relative), "utf8")));
  if (project.license.includes("MIT") && !texts.some((text) => text.includes("Permission is hereby granted"))) throw new Error(`SETUP_LICENSE_MISMATCH: ${project.id}: MIT`);
  if (project.license.includes("Apache") && !texts.some((text) => text.includes("Apache License") && text.includes("Version 2.0"))) throw new Error(`SETUP_LICENSE_MISMATCH: ${project.id}: Apache-2.0`);
  if (project.license === "BSD-3-Clause" && !texts.some((text) => text.includes("Redistribution and use") && text.includes("may not be used to endorse"))) throw new Error(`SETUP_LICENSE_MISMATCH: ${project.id}: BSD-3-Clause`);
  for (const relative of project.sourcePaths) await readFile(path.join(project.path, relative));
  if (project.id === "itoa") {
    const manifest = await readFile(path.join(project.path, "Cargo.toml"), "utf8");
    if (!/^license = "MIT OR Apache-2\.0"$/m.test(manifest)) throw new Error("SETUP_LICENSE_MISMATCH: itoa/Cargo.toml");
  }
  return { ...project, verifiedHead: head, cleanBeforeSetup: true, licenseFiles, modifications: [] };
}

/** Record the dependency tree only after the logged, literal install succeeds. */
export async function installHugrDependencies(project, run) {
  await run("hugr-install", "npm", ["ci"], { cwd: project.path });
  project.modifications.push({ phase: "setup", path: "node_modules", change: "Installed package-lock dependencies with npm ci; lifecycle output retained in setup logs." });
}

/** Strict fresh-root setup: errors leave logs and a failure manifest, never a partial success. */
export async function setupProjects(root, { repoRoot }) {
  root = path.resolve(root);
  await mkdir(root, { recursive: true });
  if ((await readdir(root)).length) throw new Error(`SETUP_ROOT_NOT_EMPTY: ${root}`);
  const env = isolatedEnv(root), projects = [], versions = {}, setup = [];
  for (const directory of ["home", "config", "cache", "data", "state", "tmp", "projects", "tooling", "setup-logs"]) await mkdir(path.join(root, directory), { recursive: true });
  for (const file of ["npmrc", "npmrc-global", "gitconfig"]) await writeFile(path.join(root, "config", file), "");
  const execute = setupRunner(root, env);
  const run = async (...args) => { const result = await execute(...args); setup.push(result); return result; };
  const manifest = (state, failure) => writeFile(path.join(root, "provision.json"), json({ schemaVersion: 1, state, root, projects, env, versions, setup,
    ...(failure ? { failure: { name: failure.message, record: failure.record } } : {}) }));
  try {
    // Resolve installed Rust toolchain read-only; bypass rustup shims thereafter.
    const rustEnvironment = { ...env, RUSTUP_HOME: process.env.RUSTUP_HOME || path.join(homedir(), ".rustup") };
    const cargo = (await run("rustup-cargo", "rustup", ["which", "cargo"], { environment: rustEnvironment })).text.trim();
    const rustc = (await run("rustup-rustc", "rustup", ["which", "rustc"], { environment: rustEnvironment })).text.trim();
    if (!path.isAbsolute(cargo) || path.dirname(cargo) !== path.dirname(rustc)) throw new Error("SETUP_RUST_TOOLCHAIN_MISMATCH");
    const pythonBin = path.join(root, "python", process.platform === "win32" ? "Scripts" : "bin");
    env.PATH = ["./node_modules/.bin", path.join(root, "tooling/node_modules/.bin"), pythonBin, path.dirname(cargo), path.dirname(process.execPath), env.PATH].filter(Boolean).join(path.delimiter);
    versions.rustToolchain = { cargo, rustc, readOnly: true };
    for (const [name, file, args] of [
      ["node", process.execPath, ["--version"]], ["npm", "npm", ["--version"]], ["cargo", "cargo", ["--version"]],
      ["rustc", "rustc", ["--version"]], ["go", "go", ["version"]], ["git", "git", ["--version"]],
      ["rg", "rg", ["--version"]], ["python", "python3", ["--version"]], ["opencode", "opencode", ["--version"]],
    ]) versions[name] = (await run(`version-${name}`, file, args)).text.trim();
    await manifest("setting-up");
    for (const pin of PINS) {
      const project = { ...pin, path: path.join(root, "projects", pin.id), cloneSource: pin.id === "hugr" ? path.resolve(repoRoot) : pin.repository };
      await run(`${pin.id}-clone`, "git", ["clone", "--no-checkout", ...(pin.id === "hugr" ? ["--no-hardlinks"] : []), project.cloneSource, project.path]);
      await run(`${pin.id}-checkout`, "git", ["checkout", "--detach", pin.commit], { cwd: project.path });
      projects.push(await verifyCheckout(project, run));
      await manifest("setting-up");
    }
    const byId = Object.fromEntries(projects.map((project) => [project.id, project]));
    await writeFile(path.join(root, "tooling/package.json"), json({ private: true, dependencies: { pnpm: TOOLING.pnpm } }));
    await run("tooling-install", "npm", ["install"], { cwd: path.join(root, "tooling") });
    versions.pnpm = (await run("version-pnpm", "pnpm", ["--version"])).text.trim();
    if (versions.pnpm !== TOOLING.pnpm) throw new Error(`SETUP_PNPM_VERSION: ${versions.pnpm}`);
    versions.packageManagers = {};
    for (const id of ["ms", "ufo"]) {
      const project = byId[id], lock = path.join(project.path, "pnpm-lock.yaml"), before = digest(await readFile(lock));
      const pkg = JSON.parse(await readFile(path.join(project.path, "package.json"), "utf8"));
      const install = await run(`${id}-install`, "pnpm", ["install", "--frozen-lockfile"], { cwd: project.path });
      const actual = (await run(`${id}-pnpm-version`, "pnpm", ["--version"], { cwd: project.path })).text.trim();
      if (actual !== TOOLING.pnpm || digest(await readFile(lock)) !== before) throw new Error(`SETUP_LOCK_OR_MANAGER_CHANGED: ${id}`);
      versions.packageManagers[id] = { declared: pkg.packageManager, actual, lockSha256: before, frozenLockVerified: true,
        lifecyclePolicy: "Upstream workspace policy and pnpm defaults; blocked dependency build scripts retain their warnings.",
        blockedBuildScriptsReported: (install.text + install.errorText).includes("Ignored build scripts:"), installLog: install.output };
      project.modifications.push({ phase: "setup", path: "node_modules", change: "Installed frozen-lockfile dependencies; upstream/pnpm lifecycle policy and all output retained in setup logs." });
      if (id === "ms") project.modifications.push({ phase: "setup", path: ".git/config, .husky/_", change: "Upstream prepare script runs husky; no hook-disabling flags or environment." });
    }
    await installHugrDependencies(byId.hugr, run);
    await run("python-venv", "python3", ["-m", "venv", path.join(root, "python")]);
    await run("python-install", path.join(pythonBin, process.platform === "win32" ? "python.exe" : "python"), ["-m", "pip", "install", `pytest==${TOOLING.pytest}`, "-e", byId.boltons.path]);
    versions.pytest = (await run("version-pytest", "pytest", ["--version"])).text.trim();
    if (versions.pytest !== `pytest ${TOOLING.pytest}`) throw new Error(`SETUP_PYTEST_VERSION: ${versions.pytest}`);
    await run("itoa-fetch", "cargo", ["fetch"], { cwd: byId.itoa.path });
    byId.itoa.modifications.push({ phase: "setup", path: "Cargo.lock", change: "Cargo fetch resolves upstream's untracked library lockfile; hash retained.", sha256: digest(await readFile(path.join(byId.itoa.path, "Cargo.lock"))) });
    await run("gjson-download", "go", ["mod", "download"], { cwd: byId.gjson.path });
    for (const [key, id, relative] of [["jest", "ms", "jest/package.json"], ["vitest", "ufo", "vitest/package.json"], ["typescript", "hugr", "typescript/package.json"], ["tsx", "hugr", "tsx/package.json"]]) {
      versions[key] = JSON.parse(await readFile(path.join(byId[id].path, "node_modules", relative), "utf8")).version;
    }
    await manifest("prepared");
    return { projects, env, versions, run };
  } catch (error) {
    await manifest("failed", error);
    throw error;
  }
}
