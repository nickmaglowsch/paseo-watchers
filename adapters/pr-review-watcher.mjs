#!/usr/bin/env node
// Watchers adapter for the pr-review-watcher skill.
//   status                     print adapter JSON (default)
//   start|stop <name>          install.sh / uninstall.sh
//   set-max-runs <name> <n>    edit config.json max_runs
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { join } from "node:path";

const DIR = join(homedir(), ".local/state/pr-review-watcher");
const SCRIPTS = join(homedir(), ".claude/skills/pr-review-watcher/scripts");
const SELF = new URL(import.meta.url).pathname;
const label = (name) => `com.${userInfo().username}.pr-review-watcher.${name}`;

const readJson = (path) => {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
};
const tail = (path, n) => {
  try {
    return readFileSync(path, "utf8").trimEnd().split("\n").filter(Boolean).slice(-n);
  } catch {
    return [];
  }
};
const watchName = (name) => {
  if (!/^[\w.-]+$/.test(name ?? "") || !existsSync(join(DIR, name, "config.json"))) {
    console.error(`unknown watcher: ${name}`);
    process.exit(2);
  }
  return name;
};

function status() {
  const loaded = new Set(
    execFileSync("launchctl", ["list"], { encoding: "utf8" })
      .split("\n")
      .map((line) => line.split("\t")[2]),
  );
  const names = existsSync(DIR) ? readdirSync(DIR) : [];
  const watchers = names.flatMap((name) => {
    const config = readJson(join(DIR, name, "config.json"));
    if (!config) return [];
    const state = readJson(join(DIR, name, "state.json")) ?? {};
    const log = tail(join(DIR, name, "watch.log"), 8);
    const last = log.at(-1) ?? "";
    const running = loaded.has(label(name));
    const repo = config.repo ?? "";
    return [
      {
        id: name,
        title: config.title ?? name,
        status: running ? "running" : "stopped",
        busy: Boolean(state.agent),
        detail: `${state.runs ?? 0}/${config.max_runs ?? "?"} fixer runs`,
        lastTick: last.match(/^\S+Z/)?.[0],
        attention: running && /run cap \d+ reached/.test(last) ? "Run cap reached; raise max runs to continue" : undefined,
        links: (config.prs ?? []).map((pr) => ({ label: `#${pr.number}`, url: `https://github.com/${repo}/pull/${pr.number}` })),
        agents: state.agent ? [{ id: state.agent, label: "Fixer" }] : [],
        log,
        actions: [
          running
            ? { id: "stop", label: "Stop", command: [process.execPath, SELF, "stop", name] }
            : { id: "start", label: "Start", command: [process.execPath, SELF, "start", name] },
          {
            id: "max-runs",
            label: "Set max runs",
            command: [process.execPath, SELF, "set-max-runs", name],
            input: { label: "Max fixer runs", value: String(config.max_runs ?? "") },
          },
        ],
      },
    ];
  });
  process.stdout.write(JSON.stringify({ watchers }));
}

const [command = "status", name, value] = process.argv.slice(2);
if (command === "status") status();
else if (command === "start" || command === "stop") {
  const script = join(SCRIPTS, command === "start" ? "install.sh" : "uninstall.sh");
  process.stdout.write(execFileSync("/bin/bash", [script, watchName(name)], { encoding: "utf8" }));
} else if (command === "set-max-runs") {
  const path = join(DIR, watchName(name), "config.json");
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 100) {
    console.error("max runs must be a whole number from 0 to 100");
    process.exit(2);
  }
  const config = readJson(path);
  config.max_runs = n;
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`);
  renameSync(tmp, path);
  console.log(`max_runs = ${n}`);
} else {
  console.error(`unknown command: ${command}`);
  process.exit(2);
}
