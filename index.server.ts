import type { PluginServerContext } from "@getpaseo/plugin/server";
import { createNotifier } from "./server/notify";
import { loadAll, runAction, toClient } from "./server/watchers";
import { listWatchersRpc, type Registry, registry, runActionRpc } from "./shared/watchers";

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(registry);
  const current = async (): Promise<Registry> => {
    const state = await settings.read();
    if (state.status !== "ready") throw new Error("Watcher registry settings are invalid");
    return state.values;
  };

  server.handle(listWatchersRpc, async () => ({ adapters: toClient(await loadAll(await current())) }));
  server.handle(runActionRpc, async (input) => runAction(await current(), input));

  // Background poll for notifications, independent of whether the app is open.
  const notify = createNotifier();
  let polling = false;
  const poll = async () => {
    if (polling) return;
    polling = true;
    try {
      const values = await current();
      notify(toClient(await loadAll(values)), values.notify);
    } catch (error) {
      console.error("watchers poll failed", error);
    } finally {
      polling = false;
    }
  };
  void poll();
  const timer = setInterval(poll, 60_000);
  return () => clearInterval(timer);
}
