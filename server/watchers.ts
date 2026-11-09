import type { RpcInput } from "@getpaseo/plugin";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  type AdapterOutput,
  type AdapterResult,
  adapterOutput,
  type Registry,
  type runActionRpc,
} from "../shared/watchers";

const run = promisify(execFile);
type Adapter = Registry["adapters"][number];
type Loaded = { adapter: Adapter; error: string | null; output: AdapterOutput };

async function runAdapter(adapter: Adapter): Promise<Loaded> {
  try {
    const { stdout } = await run("/bin/sh", ["-c", adapter.command], {
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    return { adapter, error: null, output: adapterOutput.parse(JSON.parse(stdout)) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { adapter, error: message.slice(0, 500), output: { watchers: [] } };
  }
}

export async function loadAll(registry: Registry): Promise<Loaded[]> {
  return Promise.all(registry.adapters.filter((a) => a.enabled).map(runAdapter));
}

export function toClient(loaded: Loaded[]): AdapterResult[] {
  return loaded.map(({ adapter, error, output }) => ({
    id: adapter.id,
    name: adapter.name,
    error,
    watchers: output.watchers.map(({ actions, ...watcher }) => ({
      ...watcher,
      actions: actions.map(({ command: _command, ...action }) => action),
    })),
  }));
}

export async function runAction(registry: Registry, input: RpcInput<typeof runActionRpc>) {
  const adapter = registry.adapters.find((a) => a.id === input.adapterId && a.enabled);
  if (!adapter) return { ok: false, message: `Unknown adapter ${input.adapterId}` };
  // Re-read the adapter instead of trusting a command from the app.
  const { error, output } = await runAdapter(adapter);
  if (error) return { ok: false, message: error };
  const action = output.watchers
    .find((w) => w.id === input.watcherId)
    ?.actions.find((a) => a.id === input.actionId);
  if (!action) return { ok: false, message: `Unknown action ${input.actionId}` };
  if (action.input && input.value === undefined) return { ok: false, message: "This action needs a value" };
  const [file, ...args] = action.command;
  try {
    const { stdout, stderr } = await run(file, action.input ? [...args, input.value!] : args, {
      timeout: 120_000,
    });
    return { ok: true, message: (stdout || stderr).trim().slice(0, 500) || "Done" };
  } catch (error) {
    const err = error as { stderr?: string; message?: string };
    return { ok: false, message: (err.stderr || err.message || String(error)).trim().slice(0, 500) };
  }
}
