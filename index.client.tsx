import type { PluginClientContext } from "@getpaseo/plugin/client";
import { RegistrySettings } from "./client/settings";
import { WatchersScreen, WatchersSidebarItem } from "./client/watchers";

export default function contribute(client: PluginClientContext) {
  client.addScreen({ id: "watchers", title: "Watchers", Component: WatchersScreen });
  client.addSidebarHeaderItem({ id: "watchers", title: "Watchers", Component: WatchersSidebarItem });
  client.addSettingsScreen({ id: "registry", title: "Adapters", icon: "Radar", Component: RegistrySettings });
  client.addCommandCenterItem({
    id: "open-watchers",
    title: "Open watchers",
    icon: "Radar",
    context: "global",
    onSelect({ openScreen }) {
      openScreen({ screenId: "watchers" });
    },
  });
  return () => {};
}
