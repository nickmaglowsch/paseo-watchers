import assert from "node:assert/strict";
import { test } from "node:test";
import type { AdapterResult } from "../shared/watchers";
import { createNotifier } from "./notify.ts";

const watcher = (agents: string[], attention?: string) => ({
  id: "w", title: "W", status: "running" as const, busy: agents.length > 0, attention,
  links: [], log: [], actions: [], agents: agents.map((id) => ({ id })),
});
const poll = (w: ReturnType<typeof watcher> | null): AdapterResult[] => [
  { id: "a", name: "A", error: w ? null : "boom", watchers: w ? [w] : [] },
];

test("notifies on new fixers and new attention, never replays", () => {
  const sent: string[] = [];
  const notify = createNotifier((_, body) => sent.push(body));
  notify(poll(watcher(["x"], "cap")), true); // baseline: silent
  notify(poll(watcher(["x", "y"], "cap")), true); // second fixer while busy
  notify(poll(null), true); // adapter failed
  notify(poll(watcher(["x", "y"], "cap")), true); // recovered: nothing new
  notify(poll(watcher(["x", "y"], "stuck")), true);
  assert.deepEqual(sent, ["Fixer started", "stuck"]);
});
