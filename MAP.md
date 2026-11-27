# Signal repository map

## Install or upgrade

Use the [installation walkthrough](docs/map/install/index.html) to install the plugin. Use the [verification guide](docs/install-verification.md) to check an install and the [troubleshooting guide](docs/install-troubleshooting.md) for failures.

| Upgrading from | Guide |
|---|---|
| A project using Curator for its planning documents | [Curator migration](docs/migrations/curator-to-signal.md) |
| An earlier release using tranche names and task IDs | [Vocabulary migration](docs/migrations/vocabulary-v0.1.0.md) |
| A legacy state-file format | [State schema migration](docs/migration-state-schema-v0.1.x.md) |

## Work on the plugin

The [marketplace manifest](.claude-plugin/marketplace.json) points to [plugin/](plugin/). The [plugin manifest](plugin/.claude-plugin/plugin.json) identifies the shipped version. Commands, hooks, skills and their runtime code live inside that package. [Tests](tests/) and [maintainer tools](tools/) run from the repo root. See the [maintainer instructions](CLAUDE.md) before changing the package and the [command map](docs/map/index.html) to browse its components.
