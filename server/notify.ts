import { execFile } from "node:child_process";
import type { AdapterResult } from "../shared/watchers";

// ponytail: macOS banner from the daemon host only. Plugins have no phone push API yet.
function banner(title: string, body: string) {
  execFile(
    "osascript",
    ["-e", "on run argv", "-e", "display notification (item 2 of argv) with title (item 1 of argv)", "-e", "end run", title, body],
    () => {},
  );
}

type Seen = { busy: boolean; attention: string };

/** Returns a function that compares each poll with the last one and notifies on changes. */
export function createNotifier() {
  let previous: Map<string, Seen> | null = null;
  return (adapters: AdapterResult[], enabled: boolean) => {
    const next = new Map<string, Seen>();
    for (const adapter of adapters) {
      for (const w of adapter.watchers) {
        const key = `${adapter.id}/${w.id}`;
        const now = { busy: w.busy, attention: w.attention ?? "" };
        next.set(key, now);
        const before = previous?.get(key);
        // First poll only records state, so a daemon restart does not replay old alerts.
        if (!previous || !enabled) continue;
        if (now.busy && !before?.busy) banner(w.title, "A fixer started");
        if (now.attention && now.attention !== before?.attention) banner(w.title, now.attention);
      }
    }
    previous = next;
  };
}
