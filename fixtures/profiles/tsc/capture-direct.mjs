// Native direct-launcher recorder. No fixture writes or output normalization.
import { spawnSync } from "node:child_process";
import { relative, resolve } from "node:path";

const cwd = process.env.T01_PROJECT;
if (!cwd) throw new Error("T01_PROJECT must name the disposable project");
const env = {
  ...process.env,
  PATH: `${resolve("node_modules/.bin")}:/usr/local/bin:/usr/bin:/bin`,
  npm_config_offline: "true",
  npm_config_yes: "false",
};
function capture(name, command, directory = cwd) {
  const result = spawnSync(command[0], command.slice(1), { cwd: directory, env });
  if (result.error || result.signal || result.status === null) throw result.error ?? new Error("Incomplete capture");
  if (result.stderr.length) throw new Error(`Unexpected stderr: ${result.stderr.toString("utf8")}`);
  const output = result.stdout.toString("utf8");
  if (!Buffer.from(output, "utf8").equals(result.stdout)) throw new Error("Non-UTF-8 capture");
  console.log(JSON.stringify({ name, command, cwd: directory, code: result.status, output }));
}
capture("version", ["tsc", "--version"]);
const stage = process.argv[2];
const args = ["-b", "refs", "--verbose", "--pretty", "false"];
if (stage === "initial") {
  capture("direct-build-initial", ["tsc", ...args]);
  capture("direct-build-up-to-date", ["tsc", ...args]);
} else if (stage === "incremental") {
  capture("direct-build-incremental", ["tsc", ...args]);
} else if (stage === "npx") {
  const absolute = ["-b", resolve(cwd, "refs"), "--verbose", "--pretty", "false"];
  capture("npx-build-up-to-date", ["npx", "tsc", ...absolute], resolve("."));
  capture("npx-no-install-build-up-to-date", ["npx", "--no-install", "tsc", ...absolute], resolve("."));
} else if (stage === "force") {
  capture("direct-build-force", ["tsc", ...args, "--force"]);
} else if (stage === "npx-relative") {
  const local = ["-b", relative(resolve("."), resolve(cwd, "refs")), "--verbose", "--pretty", "false"];
  capture("npx-relative-build-up-to-date", ["npx", "tsc", ...local], resolve("."));
  capture("npx-no-install-relative-build-up-to-date", ["npx", "--no-install", "tsc", ...local], resolve("."));
} else throw new Error("Unknown capture stage");
