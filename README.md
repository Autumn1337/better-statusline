<p align="center">
  <img src="https://raw.githubusercontent.com/Autumn1337/better-statusline/main/docs/poster.jpg" width="100%" alt="better-statusline, by Ewen Gao: the band above the prompt, a music card beside the rings of context, cache and the limits">
</p>

<h1 align="center">better-statusline</h1>

<p align="center">
  A status line for <a href="https://claude.com/claude-code">Claude Code</a>, drawn above the prompt:<br>
  the session's figures as dot-matrix rings, and the music you are playing beside them.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Claude_Code-2.1.289+-d97757?style=flat-square&labelColor=242137" alt="Claude Code 2.1.289 or later">
  <img src="https://img.shields.io/badge/version-0.7.1-b1b9f9?style=flat-square&labelColor=242137" alt="Version 0.7.1">
  <img src="https://img.shields.io/badge/license-MIT-91c882?style=flat-square&labelColor=242137" alt="MIT license">
</p>

<p align="center">
  <a href="#the-film">The film</a> ·
  <a href="#what-it-shows">What it shows</a> ·
  <a href="#install">Install</a> ·
  <a href="#options">Options</a>
</p>

## The film

<p align="center">
  <img src="https://raw.githubusercontent.com/Autumn1337/better-statusline/main/docs/film.webp" width="100%" alt="The film: a dot becomes a braille cell, a circle is snapped to dots, the rings fill, the music card takes its colour from its cover, and the whole band folds and turns from dark to light">
</p>

<p align="center">
  <sub>
    Fifty-two seconds. All of it is drawn in code: the picture, the two covers and the score.<br>
    With sound:
    <a href="https://github.com/Autumn1337/better-statusline/releases/download/v0.7.1/better-statusline-1080p.mp4">1080p</a> ·
    <a href="https://github.com/Autumn1337/better-statusline/releases/download/v0.7.1/better-statusline-4k.mp4">4K</a>
  </sub>
</p>

## What it shows

![The band as it stands: the music card, then the header over the rings of context, cache, 5-hour and weekly, and the bars of spend](https://raw.githubusercontent.com/Autumn1337/better-statusline/main/docs/band.png)

### Drawn in dots

<p align="center">
  <img src="https://raw.githubusercontent.com/Autumn1337/better-statusline/main/docs/stills/01-eight-dots.jpg" width="49%" alt="A braille cell: eight dots, two across and four down">
  <img src="https://raw.githubusercontent.com/Autumn1337/better-statusline/main/docs/stills/02-true-circle.jpg" width="49%" alt="A circle laid over the terminal's grid of dots, each point of it snapped to the nearest dot">
</p>

A braille cell is eight dots. Every drawing here is made of them: a ring is a true circle, found on the screen and snapped dot by dot to the terminal's grid.

### Rings

<p align="center">
  <img src="https://raw.githubusercontent.com/Autumn1337/better-statusline/main/docs/stills/03-context.jpg" width="49%" alt="The context ring: 26%, 259k of 1M">
  <img src="https://raw.githubusercontent.com/Autumn1337/better-statusline/main/docs/stills/04-cache.jpg" width="49%" alt="The cache ring: four minutes left of an hour">
</p>
<p align="center">
  <img src="https://raw.githubusercontent.com/Autumn1337/better-statusline/main/docs/stills/05-limits.jpg" width="49%" alt="The 5-hour and weekly rings, the weekly one yellow past its pace">
  <img src="https://raw.githubusercontent.com/Autumn1337/better-statusline/main/docs/stills/06-rings.jpg" width="49%" alt="The four rings in a row: context, cache, 5-hour, weekly">
</p>

Each ring is lit clockwise from its top, with its figure at its heart.

- **Context**: how full the window is.
- **Cache**: the minutes left before the prompt cache goes cold, counted from the last response. An hour on a subscription inside its limits, five minutes otherwise.
- **5-hour and weekly**: how much of each limit is spent, and when it starts over. The arc turns yellow once you spend faster than the window passes.

Above them, a header names the model and its effort, the folder, the git branch with its staged and modified files, the lines the session added and removed, and the subagents at work.

### Spend

<p align="center">
  <img src="https://raw.githubusercontent.com/Autumn1337/better-statusline/main/docs/stills/07-spend.jpg" width="49%" alt="Bars of dots, one for each turn, beside the session's total and its tokens in and out">
</p>

One bar for each recent turn, beside the session's total. The bars grow by the square root of the cost, so one dear turn leaves the rest standing.

### Music

<p align="center">
  <img src="https://raw.githubusercontent.com/Autumn1337/better-statusline/main/docs/stills/08-colour.jpg" width="49%" alt="The cover's pixels sorted by hue round a wheel, the fullest slice chosen as the card's accent">
  <img src="https://raw.githubusercontent.com/Autumn1337/better-statusline/main/docs/stills/09-card.jpg" width="49%" alt="The music card: the cover in its glow, the title, artist and album, the line and the controls, in the cover's own colour">
</p>

On macOS a card shows what Spotify or Apple Music is playing, in an accent read out of the cover. It takes the mouse: play, pause, skip, seek along the line, shuffle, repeat, and the volume at the right end of the controls.

### The band

<p align="center">
  <img src="https://raw.githubusercontent.com/Autumn1337/better-statusline/main/docs/stills/10-terminal.jpg" width="49%" alt="The whole band in a terminal window, above the prompt">
  <img src="https://raw.githubusercontent.com/Autumn1337/better-statusline/main/docs/stills/11-themes.jpg" width="49%" alt="The band turning from dark to light">
</p>

`/fold` folds the whole band into one row, and opens it again. The colours are Claude Code's own theme, so the band follows it from dark to light.

## Requirements

| For | You need |
| --- | --- |
| The status | Claude Code 2.1.289 or later, and `git` |
| The music card | macOS with Spotify or Apple Music |
| Cover pictures | kitty 0.28 or later, or Ghostty; not through tmux, screen or ssh |
| Rings that are round at your font size | `python3`, and a terminal that reports its pixel size |
| Nerd Font icons | Ghostty, kitty or WezTerm, or your own Nerd Font |

Each missing piece takes only its own part away: without a player the band is the status alone, without pictures the card has no cover, without a Nerd Font the icons are plain Unicode.

The plugin is built on Claude Code's function hooks, an early-access API that still changes between releases. It is developed on macOS in Ghostty. The other terminals are handled by what each one reports, and are untested.

## Install

From the marketplace this repository carries:

```sh
claude plugin marketplace add Autumn1337/better-statusline
claude plugin install better-statusline@better-statusline
```

To take a new version later:

```sh
claude plugin marketplace update better-statusline
claude plugin update better-statusline@better-statusline
```

Or install from npm and load it for one session:

```sh
npm install -g better-statusline
claude --plugin-dir "$(npm root -g)/better-statusline"
```

To update the npm installation, run `npm install -g better-statusline@latest`.

To load from a clone for one session:

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

<p align="center">
  <img src="https://raw.githubusercontent.com/Autumn1337/better-statusline/main/docs/stills/12-name.jpg" width="49%" alt="better-statusline, Ewen Gao">
</p>
