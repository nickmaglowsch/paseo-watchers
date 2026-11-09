One screen for every background watcher on the daemon host, such as PR review watchers and pr-keeper.

Each watcher type is an adapter: a command you register under Settings, which prints its watchers as JSON and declares the actions the panel offers (start, stop, edit a limit). To add a new kind of watcher, register its adapter. The plugin needs no code change. The two adapters in `adapters/` cover the pr-review-watcher skill and pr-keeper.

The daemon polls adapters every minute and shows a macOS notification when a fixer starts or a watcher reports something that needs you. Adapter commands run unsandboxed as the daemon user.
