import type { SessionRateLimit } from 'claude-code'

import type { Tokens } from '../types'
import { amount, span } from '../ui/shared'

/** The strip in CSS pixels: its type size and a character's advance at it, its height, the text's baseline, a bar's length. */
const SIZE = 11.6
const ADVANCE = SIZE * 0.6
const HEIGHT = 22
const BASELINE = 15
const BAR = 41

/** The pills' icons, as paths on a 24 pixel grid. */
const ICONS = {
  gauge: '<path d="M3.34 19a10 10 0 1 1 17.32 0M12 14l4-4"/>',
  calendar: '<rect class="f" x="3" y="4" width="18" height="18" rx="2"/><path class="s" d="M3 10V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4z"/><path d="M8 2v4M16 2v4"/><text x="12" y="20.3">7</text>',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5M12 7v5l4 2"/>',
  upload: '<rect class="f" x="3" y="14" width="18" height="7" rx="2.5"/><path d="M12 14V3M7 8l5-5 5 5"/>',
  download: '<rect class="f" x="3" y="14" width="18" height="7" rx="2.5"/><path d="M12 3v11M7 9l5 5 5-5"/>',
  coin: '<circle class="k" cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8M12 18V6"/>',
}

const HUES: Record<string, [light: string, dark: string]> = {
  teal: ['#408b70', '#6cc0a0'],
  violet: ['#6c53bb', '#a08af0'],
  coral: ['#a45344', '#e0806e'],
  green: ['#53855d', '#7fc08a'],
  gold: ['#a47e38', '#d9b060'],
}

/** How a rate-limit window is drawn: its name, hue and icon, and how long it runs where the strip knows. */
type Look = { label: string; hue: string; icon: string; ms?: number }

const LOOKS: Record<string, Look> = {
  five_hour: { label: '5h', hue: 'teal', icon: ICONS.gauge, ms: 5 * 3_600_000 },
  seven_day: { label: '7d', hue: 'violet', icon: ICONS.calendar, ms: 7 * 86_400_000 },
  spend_limit: { label: 'spend', hue: 'gold', icon: ICONS.coin },
}

const hues = (theme: 0 | 1) => Object.entries(HUES).map(([name, colors]) => `.${name}{--c:${colors[theme]}}`).join('')

const STYLE = [
  `svg{color-scheme:light dark;--fg:rgba(0,0,0,.86);--mut:rgba(0,0,0,.5);--track:rgba(128,128,128,.27);--tick:rgba(0,0,0,.72);--sep:rgba(0,0,0,.12);--tint:.16}${hues(0)}`,
  `@media(prefers-color-scheme:dark){svg{--fg:rgba(255,255,255,.9);--mut:rgba(255,255,255,.55);--track:rgba(160,160,160,.3);--tick:rgba(255,255,255,.8);--sep:rgba(255,255,255,.16);--tint:.24}${hues(1)}}`,
  `text{font:400 ${SIZE}px "SF Mono",SFMono-Regular,Menlo,monospace;fill:var(--fg)}`,
  '.m{fill:var(--mut)}.b{font-weight:700}',
  '.bg{fill:var(--c);fill-opacity:var(--tint)}.sep{stroke:var(--sep)}',
  '.track{fill:var(--track)}.ok{fill:#97b27b}.warn{fill:#d9a03f}.crit{fill:#d9584a}.tick{fill:var(--tick)}',
  '.ico{fill:none;stroke:var(--c);stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}',
  '.ico .f{fill:var(--c);fill-opacity:.28}.ico .k{fill:var(--c);fill-opacity:.5}.ico .s{fill:var(--c)}',
  '.ico text{font:700 11px "SF Mono",Menlo,monospace;fill:var(--c);stroke:none;text-anchor:middle}',
].join('')

const round = (n: number) => Math.round(n * 10) / 10

/**
 * The session's figures as one row of pills, for the desktop app, which draws markup where the terminal draws cells:
 * each rate-limit window with its bar, its pace and its countdown, the tokens sent and received, and the spend. An
 * SVG in the app's own light or dark, with the same told in words as its `alt`.
 */
export function strip(limits: SessionRateLimit[], tokens: Tokens, usd: number, now: number) {
  const out: string[] = []
  const alt: string[] = []
  let x = 1

  const text = (words: string, kind?: string) => {
    out.push(`<text x="${round(x)}" y="${BASELINE}"${kind ? ` class="${kind}"` : ''}>${words}</text>`)
    x += words.length * ADVANCE
  }

  const icon = (paths: string, size = 15) => {
    out.push(`<g class="ico" transform="translate(${round(x)} ${11 - size / 2}) scale(${size / 24})">${paths}</g>`)
    x += size
  }

  /** A pill in `hue` round what `draw` draws, `left` and `right` its padding. */
  const pill = (hue: string, left: number, right: number, draw: () => void) => () => {
    const at = out.length
    const from = x
    x += left
    draw()
    x += right
    out.splice(at, 0, `<g class="${hue}"><rect class="bg" x="${round(from)}" y="1" width="${round(x - from)}" height="20" rx="10"/>`)
    out.push('</g>')
  }

  const bar = (used: number, pace: number | undefined, state: string) => {
    out.push(
      `<rect class="track" x="${round(x)}" y="8.5" width="${BAR}" height="5" rx="2.5"/>`,
      `<rect class="${state}" x="${round(x)}" y="8.5" width="${round(BAR * Math.min(1, used))}" height="5" rx="2.5"/>`,
    )
    if (pace !== undefined) out.push(`<rect class="tick" x="${round(x + BAR * pace - 1)}" y="6" width="2" height="10" rx="1"/>`)
    x += BAR
  }

  const windows = limits.map(limit => {
    const look = LOOKS[limit.kind] ?? { label: limit.kind, hue: 'teal', icon: ICONS.gauge }
    const left = limit.resetsAt === undefined ? undefined : Date.parse(limit.resetsAt) - now
    const pace = look.ms === undefined || left === undefined ? undefined : Math.min(1, Math.max(0, 1 - left / look.ms))
    const state = limit.percentUsed >= 90 ? 'crit' : pace !== undefined && limit.percentUsed / 100 > pace ? 'warn' : 'ok'
    const percent = `${Math.round(limit.percentUsed)}%`
    const until = left === undefined ? undefined : span(left)
    alt.push(`${look.label} ${percent} used${until ? `, resets in ${until}` : ''}`)

    return pill(look.hue, 7, 11, () => {
      icon(look.icon)
      x += 5.5
      text(look.label, 'm')
      x += 8.5
      bar(limit.percentUsed / 100, pace, state)
      x += 6.5
      text(percent, 'b')
      if (until) {
        x += 9
        const at = Math.round(x) + 0.5
        out.push(`<line class="sep" x1="${at}" x2="${at}" y1="5" y2="17"/>`)
        x += 6
        icon(ICONS.history, 12)
        x += 5.5
        text(until, 'm')
      }
    })
  })

  const counts: [label: string, hue: string, glyph: string, count: number][] =
    tokens.received > 0 ? [['in', 'coral', ICONS.upload, tokens.sent], ['out', 'green', ICONS.download, tokens.received]] : []
  const counted = counts.map(([, hue, glyph, count]) =>
    pill(hue, 6, 8.5, () => {
      icon(glyph)
      x += 6
      text(amount(count))
    }),
  )
  if (counts.length) alt.push(counts.map(([label, , , count]) => `${label} ${amount(count)}`).join(', '))

  const cost = `$${usd.toFixed(2)}`
  alt.push(cost)
  const spent = pill('gold', 6, 8.5, () => {
    icon(ICONS.coin)
    x += 6
    text(cost)
  })

  const groups = [windows, counted, [spent]].filter(group => group.length)
  groups.forEach((group, at) => {
    if (at) x += 21
    group.forEach((draw, within) => {
      if (within) x += 6
      draw()
    })
  })

  const width = Math.ceil(x + 1)
  return {
    width,
    height: HEIGHT,
    alt: alt.join('; '),
    source: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${HEIGHT}" viewBox="0 0 ${width} ${HEIGHT}"><desc>better statusline by Ewen Gao</desc><style>${STYLE}</style>${out.join('')}</svg>`,
  }
}
