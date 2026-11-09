import { defineRpc, defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

// What an adapter command prints on stdout. Owned by each watcher type, not by this plugin.
export const adapterOutput = z.object({
  watchers: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      status: z.enum(["running", "stopped", "error"]),
      busy: z.boolean().default(false),
      detail: z.string().optional(),
      lastTick: z.string().optional(),
      // Non-empty = needs you. A new value raises a notification.
      attention: z.string().optional(),
      links: z.array(z.object({ label: z.string(), url: z.string(), note: z.string().optional() })).default([]),
      agents: z.array(z.object({ id: z.string(), label: z.string().optional() })).default([]),
      log: z.array(z.string()).default([]),
      actions: z
        .array(
          z.object({
            id: z.string(),
            label: z.string(),
            command: z.array(z.string()).min(1),
            // When set, the panel asks for a value and appends it as the last argument.
            input: z.object({ label: z.string(), value: z.string().optional() }).optional(),
          }),
        )
        .default([]),
    }),
  ),
});
export type AdapterOutput = z.infer<typeof adapterOutput>;

// Sent to the app. Actions lose their commands: the daemon looks them up again before running one.
const watcher = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(["running", "stopped", "error"]),
  busy: z.boolean(),
  detail: z.string().optional(),
  lastTick: z.string().optional(),
  attention: z.string().optional(),
  links: z.array(z.object({ label: z.string(), url: z.string(), note: z.string().optional() })),
  agents: z.array(z.object({ id: z.string(), label: z.string().optional() })),
  log: z.array(z.string()),
  actions: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      input: z.object({ label: z.string(), value: z.string().optional() }).optional(),
    }),
  ),
});
export type Watcher = z.infer<typeof watcher>;

const adapterResult = z.object({
  id: z.string(),
  name: z.string(),
  error: z.string().nullable(),
  watchers: z.array(watcher),
});
export type AdapterResult = z.infer<typeof adapterResult>;

export const listWatchersRpc = defineRpc({
  name: "watchers.list",
  input: z.object({}),
  output: z.object({ adapters: z.array(adapterResult) }),
});

export const runActionRpc = defineRpc({
  name: "watchers.run_action",
  input: z.object({
    adapterId: z.string(),
    watcherId: z.string(),
    actionId: z.string(),
    value: z.string().optional(),
  }),
  output: z.object({ ok: z.boolean(), message: z.string() }),
});

export const registry = defineSettings({
  id: "registry",
  scope: "host",
  version: 1,
  schema: z.object({
    adapters: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          // Run with /bin/sh -c on the daemon host; must print adapterOutput JSON.
          command: z.string(),
          enabled: z.boolean().default(true),
        }),
      )
      .default([]),
    notify: z.boolean().default(true),
  }),
});
export type Registry = z.infer<typeof registry.schema>;
