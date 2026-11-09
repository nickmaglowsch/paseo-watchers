import type { PluginScreenProps, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import { ScrollView, SidebarRow, useToast } from "@getpaseo/plugin/client/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { listWatchersRpc, runActionRpc, type Watcher } from "../shared/watchers";
import { openExternal } from "./web";

type Theme = PluginScreenProps["theme"];
type Styles = ReturnType<typeof makeStyles>;

function useWatchers() {
  const list = useRpc(listWatchersRpc);
  return useQuery({ queryKey: ["watchers"], queryFn: () => list({}), refetchInterval: 30_000 });
}

function ago(iso: string | undefined): string {
  if (!iso) return "no activity logged";
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (Number.isNaN(minutes)) return iso;
  if (minutes < 1) return "active just now";
  if (minutes < 60) return `active ${minutes}m ago`;
  if (minutes < 48 * 60) return `active ${Math.round(minutes / 60)}h ago`;
  return `active ${Math.round(minutes / 1440)}d ago`;
}

function makeStyles(theme: Theme, compact: boolean) {
  const c = theme.colors;
  return {
    screen: { flex: 1, backgroundColor: c.surface0 },
    content: { padding: compact ? 12 : 24, gap: 12 },
    section: { color: c.foregroundMuted, fontSize: 12, fontWeight: "600" as const, marginTop: 8 },
    card: { padding: 14, gap: 8, borderRadius: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface1 },
    header: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
    title: { flex: 1, color: c.foreground, fontSize: 16, fontWeight: "600" as const },
    muted: { color: c.foregroundMuted, fontSize: 13 },
    attention: { color: c.statusDanger, fontSize: 13 },
    row: { flexDirection: "row" as const, alignItems: "center" as const, gap: 10, flexWrap: "wrap" as const },
    link: { color: c.accent, fontSize: 13 },
    button: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: c.border },
    buttonText: { color: c.foreground, fontSize: 13 },
    input: {
      flex: 1,
      minWidth: 80,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.border,
      color: c.foreground,
      fontSize: 13,
    },
    log: { padding: 8, borderRadius: 6, backgroundColor: c.surface0, color: c.foregroundMuted, fontFamily: "Menlo", fontSize: 11 },
    empty: { color: c.foregroundMuted, padding: 24, textAlign: "center" as const },
  };
}

function Button({ styles, label, onPress, disabled }: { styles: Styles; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable style={styles.button} accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

function Badge({ watcher, theme }: { watcher: Watcher; theme: Theme }) {
  const c = theme.colors;
  const [label, color] =
    watcher.status === "error"
      ? ["Error", c.statusDanger]
      : watcher.status === "stopped"
        ? ["Stopped", c.foregroundMuted]
        : watcher.busy
          ? ["Fixing", c.accent]
          : ["Watching", c.foreground];
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1, borderColor: color }}>
      <Text style={{ color, fontSize: 12, fontWeight: "600" }}>{label}</Text>
    </View>
  );
}

function WatcherCard({
  adapterId,
  watcher,
  styles,
  theme,
  openAgent,
}: {
  adapterId: string;
  watcher: Watcher;
  styles: Styles;
  theme: Theme;
  openAgent?: (agentId: string) => void;
}) {
  const [showLog, setShowLog] = useState(false);
  const [editing, setEditing] = useState<{ id: string; label: string; value: string } | null>(null);
  const client = useQueryClient();
  const toast = useToast();
  const runActionCall = useRpc(runActionRpc);
  const action = useMutation({
    mutationFn: (input: { actionId: string; value?: string }) =>
      runActionCall({ adapterId, watcherId: watcher.id, ...input }),
    onSuccess: (result) => {
      if (result.ok) {
        toast.show(result.message, { variant: "success" });
        setEditing(null);
      } else toast.error(result.message);
    },
    onError: (error) => toast.error(String(error)),
    onSettled: () => client.invalidateQueries({ queryKey: ["watchers"] }),
  });

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>
          {watcher.title}
        </Text>
        <Badge watcher={watcher} theme={theme} />
      </View>
      <Text style={styles.muted}>{[watcher.detail, ago(watcher.lastTick)].filter(Boolean).join(" · ")}</Text>
      {watcher.attention ? <Text style={styles.attention}>{watcher.attention}</Text> : null}

      {watcher.links.map((link) => (
        <View key={link.url} style={styles.row}>
          <Pressable accessibilityRole="link" onPress={() => openExternal(link.url)}>
            <Text style={styles.link}>{link.label}</Text>
          </Pressable>
          {link.note ? <Text style={styles.muted}>{link.note}</Text> : null}
        </View>
      ))}

      <View style={styles.row}>
        {openAgent
          ? watcher.agents.map((agent) => (
              <Button key={agent.id} styles={styles} label={`Open ${agent.label ?? "agent"}`} onPress={() => openAgent(agent.id)} />
            ))
          : null}
        <Button styles={styles} label={showLog ? "Hide log" : "Log"} onPress={() => setShowLog((v) => !v)} />
        {watcher.actions.map((a) => (
          <Button
            key={a.id}
            styles={styles}
            label={a.label}
            disabled={action.isPending}
            onPress={() =>
              a.input ? setEditing({ id: a.id, label: a.input.label, value: a.input.value ?? "" }) : action.mutate({ actionId: a.id })
            }
          />
        ))}
      </View>

      {editing ? (
        <View style={styles.row}>
          <Text style={styles.muted}>{editing.label}</Text>
          <TextInput
            style={styles.input}
            value={editing.value}
            autoFocus
            accessibilityLabel={editing.label}
            onChangeText={(value) => setEditing({ ...editing, value })}
            onSubmitEditing={() => action.mutate({ actionId: editing.id, value: editing.value })}
          />
          <Button styles={styles} label="Save" disabled={action.isPending} onPress={() => action.mutate({ actionId: editing.id, value: editing.value })} />
          <Button styles={styles} label="Cancel" onPress={() => setEditing(null)} />
        </View>
      ) : null}

      {showLog ? <Text style={styles.log}>{watcher.log.join("\n") || "(empty)"}</Text> : null}
    </View>
  );
}

export function WatchersScreen({ theme, layout, navigation }: PluginScreenProps) {
  const styles = useMemo(() => makeStyles(theme, layout.compact), [theme, layout.compact]);
  const query = useWatchers();
  const [showStopped, setShowStopped] = useState(false);
  const openAgent = navigation ? (agentId: string) => navigation.openAgent({ agentId }) : undefined;
  const adapters = query.data?.adapters ?? [];
  const stopped = adapters.flatMap((a) => a.watchers).filter((w) => w.status === "stopped").length;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {query.isError ? <Text style={styles.empty}>{String(query.error)}</Text> : null}
      {query.isPending ? <Text style={styles.empty}>Loading…</Text> : null}
      {query.isSuccess && adapters.length === 0 ? (
        <Text style={styles.empty}>No adapters yet. Add one in Settings → Plugins → paseo-watchers.</Text>
      ) : null}
      {adapters.map((adapter) => {
        const visible = adapter.watchers.filter((w) => showStopped || w.status !== "stopped");
        return (
          <View key={adapter.id} style={{ gap: 12 }}>
            <Text style={styles.section}>{adapter.name.toUpperCase()}</Text>
            {adapter.error ? <Text style={styles.attention}>{adapter.error}</Text> : null}
            {!adapter.error && visible.length === 0 ? <Text style={styles.muted}>Nothing running.</Text> : null}
            {visible.map((watcher) => (
              <WatcherCard key={watcher.id} adapterId={adapter.id} watcher={watcher} styles={styles} theme={theme} openAgent={openAgent} />
            ))}
          </View>
        );
      })}
      {stopped > 0 ? (
        <Pressable accessibilityRole="button" onPress={() => setShowStopped((v) => !v)}>
          <Text style={[styles.muted, { textAlign: "center", padding: 8 }]}>
            {showStopped ? "Hide stopped watchers" : `Show ${stopped} stopped`}
          </Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

export function WatchersSidebarItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  const query = useWatchers();
  const watchers = (query.data?.adapters ?? []).flatMap((a) => a.watchers);
  const running = watchers.filter((w) => w.status !== "stopped").length;
  const needsYou = watchers.some((w) => w.attention || w.status === "error");
  return (
    <SidebarRow
      icon={needsYou ? "TriangleAlert" : watchers.some((w) => w.busy) ? "Wrench" : "Radar"}
      label={query.data ? `Watchers (${running})` : "Watchers"}
      active={currentScreen?.screenId === "watchers"}
      onPress={() => openScreen({ screenId: "watchers" })}
    />
  );
}
