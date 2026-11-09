#!/usr/bin/env node
// Watchers adapter for pr-keeper.
//   status                print adapter JSON (default)
//   start|stop            load / unload the launchd job (plist is kept)
//   set <KEY> <value>     edit one whitelisted key in ~/.pr-keeper/config
import { execFileSync } from "node:child_process";
import { closeSync, existsSync, fstatSync, openSync, readFileSync, readSync, renameSync, writeFileSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { join } from "node:path";

const HOME = process.env.PR_KEEPER_HOME ?? join(homedir(), ".pr-keeper");
const LABEL = "com.pr-keeper";
const PLIST = join(homedir(), "Library/LaunchAgents", `${LABEL}.plist`);
const DOMAIN = `gui/${userInfo().uid}`;
const SELF = new URL(import.meta.url).pathname;
const EDITABLE = {
  MAX_ROUNDS_PER_AGENT: "Max rounds per agent",
  MAX_AGENT_RUNS_PER_DAY: "Max agent runs per day (0 = no limit)",
  DRY_RUN: "Dry run (1 = only log)",
};

// ponytail: last 64 KB only; the log is over 1 MB.
function tail(path, n) {
  if (!existsSync(path)) return [];
  const fd = openSync(path, "r");
  const { size } = fstatSync(fd);
  const length = Math.min(size, 64 * 1024);
  const buffer = Buffer.alloc(length);
  readSync(fd, buffer, 0, length, size - length);
  closeSync(fd);
  return buffer.toString("utf8").trimEnd().split("\n").filter(Boolean).slice(-n);
}

const readConfig = () => (existsSync(join(HOME, "config")) ? readFileSync(join(HOME, "config"), "utf8") : "");
const configValue = (text, key) => text.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]?.trim() ?? "";

function status() {
  if (!existsSync(HOME)) return process.stdout.write(JSON.stringify({ watchers: [] }));
  const config = readConfig();
  const running = execFileSync("launchctl", ["list"], { encoding: "utf8" }).split("\n").some((l) => l.split("\t")[2] === LABEL);
  let state = {};
  try {
    state = JSON.parse(readFileSync(join(HOME, "state.json"), "utf8"));
  } catch {}
  let slug = null;
  try {
    const remote = execFileSync("git", ["-C", configValue(config, "REPO_DIR"), "remote", "get-url", "origin"], { encoding: "utf8" });
    slug = remote.trim().match(/github\.com[:/](.+?)(\.git)?$/)?.[1] ?? null;
  } catch {}

  const log = tail(join(HOME, "log"), 60);
  const stamp = (line) => line.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)?.[0];
  const last = stamp(log.at(-1) ?? "");
  const tick = log.filter((line) => stamp(line) === last);
  const notes = new Map();
  for (const line of tick) {
    const m = line.match(/ #(\d+) (.*)$/);
    if (m) notes.set(Number(m[1]), m[2]);
  }
  const stuck = [...notes].filter(([, note]) => note.startsWith("skip: already tried")).map(([n]) => `#${n}`);
  // Strip the timestamp so a repeating error keeps the same text and notifies once.
  const error = tick.find((line) => line.includes("ERROR"))?.replace(/^.*?ERROR /, "");
  const busy = [...notes.values()].some((note) => /agent (started|is running)/.test(note));

  const numbers = [...new Set([...Object.keys(state).map(Number), ...notes.keys()])].sort((a, b) => b - a);
  const watcher = {
    id: "pr-keeper",
    title: "pr-keeper",
    status: error ? "error" : running ? "running" : "stopped",
    busy,
    detail: `${numbers.length} PRs · ${configValue(config, "DRY_RUN") === "1" ? "dry run" : "live"}`,
    lastTick: last ? new Date(last.replace(" ", "T")).toISOString() : undefined,
    attention: error ?? (stuck.length ? `Already tried, needs you: ${stuck.join(", ")}` : undefined),
    links: numbers.map((n) => ({
      label: `#${n}`,
      url: slug ? `https://github.com/${slug}/pull/${n}` : "",
      note: notes.get(n),
    })).filter((link) => link.url),
    agents: numbers.flatMap((n) => (state[n]?.agent?.id ? [{ id: state[n].agent.id, label: `#${n} fixer` }] : [])),
    log: log.slice(-8),
    actions: [
      running
        ? { id: "stop", label: "Pause", command: [process.execPath, SELF, "stop"] }
        : { id: "start", label: "Start", command: [process.execPath, SELF, "start"] },
      ...Object.entries(EDITABLE).map(([key, label]) => ({
        id: `set-${key}`,
        label: `Set ${key}`,
        command: [process.execPath, SELF, "set", key],
        input: { label, value: configValue(config, key) },
      })),
    ],
  };
  process.stdout.write(JSON.stringify({ watchers: [watcher] }));
}

const [command = "status", key, value] = process.argv.slice(2);
if (command === "status") status();
else if (command === "start") execFileSync("launchctl", ["bootstrap", DOMAIN, PLIST]), console.log("pr-keeper started");
else if (command === "stop") execFileSync("launchctl", ["bootout", `${DOMAIN}/${LABEL}`]), console.log("pr-keeper paused");
else if (command === "set") {
  if (!(key in EDITABLE) || !/^\d{1,4}$/.test(value ?? "")) {
    console.error(`usage: set <${Object.keys(EDITABLE).join("|")}> <number>`);
    process.exit(2);
  }
  const path = join(HOME, "config");
  const text = readConfig();
  const line = `${key}=${value}`;
  const next = new RegExp(`^${key}=.*$`, "m").test(text) ? text.replace(new RegExp(`^${key}=.*$`, "m"), line) : `${text.trimEnd()}\n${line}\n`;
  writeFileSync(`${path}.tmp`, next);
  renameSync(`${path}.tmp`, path);
  console.log(line);
} else {
  console.error(`unknown command: ${command}`);
  process.exit(2);
}
