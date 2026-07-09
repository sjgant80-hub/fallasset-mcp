# @ai-native-solutions/fallasset-mcp

Model Context Protocol server wrapping [`@ai-native-solutions/fallasset-sdk`](https://github.com/sjgant80-hub/fallasset-sdk). Lets Claude Desktop / Claude Code drive a headless asset library — add files, rate, tag, label, collect, filter, sort, and route natural-language intents.

## Install

```bash
npm install -g @ai-native-solutions/fallasset-mcp
```

## Wire it up

```bash
claude mcp add fallasset -- fallasset-mcp
```

Or manually add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "fallasset": {
      "command": "npx",
      "args": ["@ai-native-solutions/fallasset-mcp"]
    }
  }
}
```

Restart Claude Desktop / Code. The `fallasset_*` tools appear in the tool picker.

## Tools

| Tool | Purpose |
|---|---|
| `fallasset_add_files` | Register files: `{id, name, size, lastModified, type}` |
| `fallasset_route` | Run NL intent through T0 router (`show 5 star`, `rate 4`, `tag sunset`, `sort by date desc`, `view compare`, `rotate 90`, `export png`) |
| `fallasset_exec` | Execute strict-JSON intent `{action, args}` |
| `fallasset_list` | Return the current visible (filtered + sorted) list with metadata |
| `fallasset_meta` | Read or write metadata for one file |
| `fallasset_collection` | `new` / `toggle` / `list` collections |

## Resources

- `fallasset://state` — live state snapshot
- `fallasset://metadata` — full metadata JSON export
- `fallasset://tags` — every tag currently used

## Example (via Claude)

> "Add three files: sunset.jpg, meeting.png, mountain.jpg — then rate them 5, 3, 4 and tag the sunset one 'landscape'."

Claude will call `fallasset_add_files`, then `fallasset_route` with `rate 5` after selecting each, and finally `fallasset_route` with `tag landscape`.

## Companion packages

- [`@ai-native-solutions/fallasset-sdk`](https://github.com/sjgant80-hub/fallasset-sdk) — headless engine
- [`@ai-native-solutions/fallasset-api`](https://github.com/sjgant80-hub/fallasset-api) — HTTP wrapper

MIT · AI-Native Solutions
