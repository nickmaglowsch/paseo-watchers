import { type PluginSurfaceProps, useSettings } from "@getpaseo/plugin/client";
import {
  SettingsAction,
  SettingsCard,
  SettingsInput,
  type SettingsInputHandle,
  SettingsRow,
  SettingsSection,
  SettingsSwitch,
} from "@getpaseo/plugin/client/ui";
import { useRef, useState } from "react";
import { Text } from "react-native";
import { type Registry, registry } from "../shared/watchers";

export function RegistrySettings({ theme }: PluginSurfaceProps) {
  const settings = useSettings(registry);
  const nameRef = useRef<SettingsInputHandle>(null);
  const commandRef = useRef<SettingsInputHandle>(null);
  const [addError, setAddError] = useState<string | null>(null);

  if (settings.status !== "ready") {
    const message = settings.status === "loading" ? "Loading…" : String(settings.error);
    return <Text style={{ color: theme.colors.foregroundMuted }}>{message}</Text>;
  }
  const { values, revision } = settings;
  const save = (next: Registry) => settings.save(next, revision);
  const setAdapters = (adapters: Registry["adapters"]) => save({ ...values, adapters });

  const add = async () => {
    const name = nameRef.current?.getText().trim() ?? "";
    const command = commandRef.current?.getText().trim() ?? "";
    if (!name || !command) return setAddError("Name and command are both required.");
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    if (values.adapters.some((a) => a.id === id)) return setAddError(`An adapter called ${name} already exists.`);
    if (await setAdapters([...values.adapters, { id, name, command, enabled: true }])) {
      setAddError(null);
      nameRef.current?.replaceText("");
      commandRef.current?.replaceText("");
    }
  };

  return (
    <>
      <SettingsSection title="Adapters" info="Each adapter is a command the daemon runs. It prints its watchers as JSON and declares the actions the panel offers.">
        <SettingsCard>
          {values.adapters.length === 0 ? <SettingsRow label="No adapters yet" /> : null}
          {values.adapters.map((adapter) => [
            <SettingsSwitch
              key={`${adapter.id}-on`}
              label={adapter.name}
              hint={adapter.command}
              value={adapter.enabled}
              onValueChange={(enabled) =>
                setAdapters(values.adapters.map((a) => (a.id === adapter.id ? { ...a, enabled } : a)))
              }
            />,
            <SettingsAction
              key={`${adapter.id}-remove`}
              label={`Remove ${adapter.name}`}
              actionLabel="Remove"
              onPress={() => setAdapters(values.adapters.filter((a) => a.id !== adapter.id))}
            />,
          ])}
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Add adapter">
        <SettingsCard>
          <SettingsInput ref={nameRef} label="Name" placeholder="pr-review-watcher" onChangeText={() => setAddError(null)} />
          <SettingsInput
            ref={commandRef}
            label="Command"
            hint="Runs with /bin/sh -c on the daemon host and must print the watcher JSON"
            placeholder="node /path/to/adapter.mjs status"
            onChangeText={() => setAddError(null)}
          />
          <SettingsAction label="Add" error={addError ?? settings.saveError} actionLabel="Add" disabled={settings.saving} onPress={add} />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Notifications">
        <SettingsCard>
          <SettingsSwitch
            label="macOS notifications"
            hint="When a fixer starts or a watcher needs you. Sent on the daemon's Mac."
            value={values.notify}
            onValueChange={(notify) => save({ ...values, notify })}
          />
        </SettingsCard>
      </SettingsSection>
    </>
  );
}
