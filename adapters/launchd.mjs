#!/usr/bin/env node
// Generic watchers adapter for any launchd job in ~/Library/LaunchAgents.
//   status <label>...          print adapter JSON for these jobs (default)
//   start|stop <label>         load / unload the job (plist is kept)
// Running = loaded; busy = has a live PID; attention = last exit status was not 0.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { join } from "node:path";

const AGENTS = join(homedir(), "Library/LaunchAgents");
const DOMAIN = `gui/${userInfo().uid}`;
const SELF = new URL(import.meta.url).pathname;

const plistPath = (label) => {
  const path = join(AGENTS, `${label}.plist`);
  if (!/^[\w.-]+$/.test(label ?? "") || !existsSync(path)) {
    console.error(`no launch agent: ${label}`);
    process.exit(2);
  }
  return path;
};
const plist = (label) => JSON.parse(execFileSync("plutil", ["-convert", "json", "-o", "-", plistPath(label)], { encoding: "utf8" }));
const tail = (path, n) => {
  try {
    return readFileSync(path, "utf8").trimEnd().split("\n").filter(Boolean).slice(-n);
  } catch {
    return [];
  }
};
const schedule = (p) =>
  p.StartInterval
    ? `every ${p.StartInterval >= 3600 ? `${p.StartInterval / 3600}h` : `${Math.round(p.StartInterval / 60)}m`}`
    : p.StartCalendarInterval
      ? `daily at ${String(p.StartCalendarInterval.Hour ?? 0).padStart(2, "0")}:${String(p.StartCalendarInterval.Minute ?? 0).padStart(2, "0")}`
      : "on demand";

function status(labels) {
  const jobs = new Map(
    execFileSync("launchctl", ["list"], { encoding: "utf8" })
      .split("\n")
      .slice(1)
      .map((line) => line.split("\t"))
      .map(([pid, exit, label]) => [label, { pid, exit }]),
  );
  const watchers = labels.map((label) => {
    const p = plist(label);
    const job = jobs.get(label);
    const out = p.StandardOutPath;
    const err = p.StandardErrorPath && p.StandardErrorPath !== out ? p.StandardErrorPath : null;
    const log = [...tail(out, 8), ...tail(err, 4).map((line) => `stderr: ${line}`)].slice(-10);
    const mtime = [out, err].filter((f) => f && existsSync(f)).map((f) => statSync(f).mtime.getTime());
    const exit = job && job.exit !== "0" && job.exit !== "-" ? job.exit : null;
    return {
      id: label,
      title: label.replace(/^com\./, "").replace(`${userInfo().username}.`, ""),
      status: job ? "running" : "stopped",
      busy: Boolean(job && job.pid !== "-"),
      detail: schedule(p),
      lastTick: mtime.length ? new Date(Math.max(...mtime)).toISOString() : undefined,
      attention: exit ? `Last run exited with status ${exit}` : undefined,
      log,
      actions: [
        job
          ? { id: "stop", label: "Stop", command: [process.execPath, SELF, "stop", label] }
          : { id: "start", label: "Start", command: [process.execPath, SELF, "start", label] },
      ],
    };
  });
  process.stdout.write(JSON.stringify({ watchers }));
}

const [command = "status", ...labels] = process.argv.slice(2);
if (command === "status") status(labels);
else if (command === "start") execFileSync("launchctl", ["bootstrap", DOMAIN, plistPath(labels[0])]), console.log(`${labels[0]} started`);
else if (command === "stop") plistPath(labels[0]), execFileSync("launchctl", ["bootout", `${DOMAIN}/${labels[0]}`]), console.log(`${labels[0]} stopped`);
else {
  console.error(`unknown command: ${command}`);
  process.exit(2);
}
