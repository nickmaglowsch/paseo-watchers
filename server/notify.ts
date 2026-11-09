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

type Seen = { agents: Set<string>; attention: string };

/** Returns a function that compares each poll with the last one and notifies on changes. */
export function createNotifier(send: (title: string, body: string) => void = banner) {
  let previous: Map<string, Seen> | null = null;
  return (adapters: AdapterResult[], enabled: boolean) => {
    const next = new Map<string, Seen>();
    for (const adapter of adapters) {
      // A failed poll says nothing new: keep its last baseline so recovery does not replay alerts.
      if (adapter.error) {
        for (const [key, seen] of previous ?? []) if (key.startsWith(`${adapter.id}/`)) next.set(key, seen);
        continue;
      }
      for (const w of adapter.watchers) {
        const key = `${adapter.id}/${w.id}`;
        const now = { agents: new Set(w.agents.map((a) => a.id)), attention: w.attention ?? "" };
        next.set(key, now);
        const before = previous?.get(key);
        // First poll only records state, so a daemon restart does not replay old alerts.
        if (!previous || !enabled) continue;
        // Each new fixer agent id is a fixer start, even while another one is still busy.
        for (const agent of w.agents) {
          if (!before?.agents.has(agent.id)) send(w.title, `${agent.label ?? "Fixer"} started`);
        }
        if (now.attention && now.attention !== before?.attention) send(w.title, now.attention);
      }
    }
    previous = next;
  };
}
