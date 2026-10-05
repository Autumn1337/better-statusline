# better-statusline

A status line for [Claude Code](https://claude.com/claude-code), drawn above the prompt: the session's figures as dot-matrix rings, and the music you are playing beside them.

## What it shows

- **Header**: the model and its effort, the folder, the git branch with its staged and modified files, the lines the session added and removed, and the subagents at work.
- **Rings**: the context window, the prompt cache (the minutes left before it goes cold), and the 5-hour and weekly limits. A limit's arc turns yellow once you spend faster than its window passes.
- **Bars**: what each recent turn cost, beside the session's total.
- **Music card** (macOS): the cover, title, artist and album of what Spotify or Apple Music is playing. Click to play, pause, skip, seek, shuffle, repeat or change the volume.

`/fold` folds the whole band into one row, and opens it again.

## Requirements

| For | You need |
| --- | --- |
| The status | Claude Code 2.1.289 or later, and `git` |
| The music card | macOS with Spotify or Apple Music |
| Cover pictures | kitty 0.28 or later, or Ghostty; not through tmux, screen or ssh |
| Rings that are round at your font size | `python3`, and a terminal that reports its pixel size |
| Nerd Font icons | Ghostty, kitty or WezTerm, or your own Nerd Font |

Everything degrades by design: no player means the status alone, no pictures means the card without its cover, no Nerd Font means plain Unicode icons.

The plugin is built on Claude Code's function hooks, an early-access API that still changes between releases. It is developed on macOS in Ghostty; the other terminals follow from how each is read, and are untested.

## Install

From the marketplace this repository carries:

```sh
claude plugin marketplace add Autumn1337/better-statusline
claude plugin install better-statusline@better-statusline
```

Or from a clone, for one session:

```sh
git clone https://github.com/Autumn1337/better-statusline
claude --plugin-dir ./better-statusline
```

To load a clone in every session, name its parent folder in `CLAUDE_CODE_PLUGIN_DIRS`, in the `env` block of `~/.claude/settings.json`.

## Options

Both are rows in `/config`.

| Option | Values | `auto` means |
| --- | --- | --- |
| `icons` | `auto`, `nerd`, `unicode` | Nerd Font icons in the terminals that carry them, Unicode in the rest |
| `motion` | `auto`, `full`, `reduced` | Follow macOS's Reduce Motion; move in full elsewhere |

## What it costs

At rest the band costs nothing you can measure. Each frame it draws is a redraw of the terminal's, so while music plays the meter's sway takes 3 to 4% of one core in every open session. `motion: reduced` holds it still.

## How it is built

```
hooks/register.tsx   every hook, and all that reaches the engine
hooks/*.ts           what the hooks compute: the status, the music, the terminal
ui/*.tsx             the three surface modules: the status, the card, the one-line player
ui/dots.ts           the dot drawings: rings, bars, lanes
bridge/              the scripts that reach the Mac: the players, the cover, the cell size
types/index.d.ts     the state the plugin keeps
```

The players reach the plugin through one contract: `bridge/now-playing.js` prints a line of JSON, a `MusicPlayer` as `types/index.d.ts` declares it, each time what plays changes. A bridge for another system, MPRIS on Linux say, needs only to print the same lines.

## Development

`claude --plugin-dir .` loads the plugin from its folder, reloads it on every save, and lays the engine's types under `.claude-plugin/types/`. Then:

```sh
claude plugin validate .
tsc -p .
```

## License

MIT © Ewen Gao
