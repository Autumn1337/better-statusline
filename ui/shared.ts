import type { ClientModule, ClientPointerEvent, ClientSurface, RenderElement } from 'claude-code'

import type { Git, Icons, MusicRepeat, MusicTint } from '../types'

export const SIGNATURE = 'Ewen Gao'

/** The engine's [-] mark covers the last three columns of the band's first row. */
export const RESERVE = 4

/** Claude Code's theme keys the band draws in, so it wears the session's own palette in light and dark alike. */
export const TONE = {
  /** Labels, footnotes, the controls at rest. */
  muted: 'inactive',
  /** A rail ahead of its fill. */
  track: 'rate_limit_empty',
  /** A rail's fill, and the budget a limit has earned so far. */
  fill: 'rate_limit_fill',
  brand: 'claude',
  warn: 'warning',
  alarm: 'error',
} as const

/** The band's rows, and the music card in cells: the gap after the cover and the line's length between its times. */
export const CARD = { rows: 5, gap: 2, line: 18 }

/** Cells between the music card and the status. */
export const SPACE = 4

/** The band's icons, one cell each: Material Design icons from a Nerd Font, drawn to the text's own metrics, and the
 * plain Unicode nearest each for a terminal whose font has none. */
export const ICON = {
  nerd: {
    play: '\u{F040A}',
    pause: '\u{F03E4}',
    next: '\u{F04AD}',
    previous: '\u{F04AE}',
    quieter: '\u{F075E}',
    louder: '\u{F075D}',
    note: '\u{F075A}',
    shuffle: '\u{F049D}',
    repeat: '\u{F0456}',
    repeatOnce: '\u{F0458}',
    branch: '\u{F062C}',
    folder: '\u{F0256}',
  },
  unicode: {
    play: '►',
    pause: '‖',
    next: '»',
    previous: '«',
    quieter: '−',
    louder: '+',
    note: '♪',
    shuffle: '⇄',
    repeat: '↻',
    repeatOnce: '①',
    branch: '⎇',
    folder: '⌂',
  },
} satisfies Record<Icons, Record<string, string>>

/** What both players draw from: the track, tidied, and the playhead's last reading. */
export type View = {
  app: string
  title: string
  features: string
  artist: string
  album: string
  state: 'playing' | 'paused'
  position: number
  at: number
  duration: number
  volume: number
  shuffle: boolean
  repeat: MusicRepeat
  tint: MusicTint | null
  hasCover: boolean
}

/** What a player's surface module is handed: the view, in the terminal's own icons. */
export type PlayerProps = View & { icons: Icons; isMotionReduced: boolean }

export type Control = 'shuffle' | 'previous' | 'toggle' | 'next' | 'repeat'

/** What a player asks of the hooks module. */
export type Message = { type: Control | 'expand' } | { type: 'seek'; seconds: number } | { type: 'volume'; level: number }

/**
 * What a player keeps between frames: the zone under the pointer, the seconds under it while its line is held, and a
 * seek sent and not yet in the props.
 */
export type Local<Zone> = { zone: Zone | null; scrub: number | null; seek: { seconds: number; at: number } | null }

/** A rate-limit window: how much of it is spent, when it starts over, how long it runs, and the hue it wears. */
export type Limit = { label: string; hue: string; percent: number; resetsAt: number | null; span: number }

export type StatusProps = {
  model: string
  effort: string | null
  place: string
  git: Git | null
  agents: number
  edits: { added: number; removed: number }
  context: { percent: number; tokens: number | null; window: number; history: number[] }
  limits: Limit[]
  /** The prompt cache: when its lifetime last started over (null before the session's first response) and how long it runs, in milliseconds. */
  cache: { at: number | null; span: number }
  cost: number | null
  /** What each of the last turns cost, oldest first. */
  spend: number[]
  tokens: { sent: number; received: number }
  /** The minute the band was drawn in: each new one draws the status again, which keeps its countdowns current while nothing on it moves. */
  minute: number
  icons: Icons
  /** A terminal cell's height over its width: what the rings are drawn round by. */
  aspect: number
  isWorking: boolean
  isMotionReduced: boolean
  /** The band folded into one line. */
  isCompact: boolean
}

/** A stretch of text in one style; `dim` draws it faint. */
export type Run = { text: string; color?: string; bold?: boolean; dim?: boolean }

const unit = (x: number) => Math.min(1, Math.max(0, x))

/** A rail `length` cells long, filled to `used` (0 to 1) in half cells: heavy as far as it is filled, light beyond; `knob` marks the fill's leading cell. */
export function rail(length: number, used: number, fill: string, knob = false) {
  const halves = Math.round(unit(used) * length * 2)
  const end = knob ? Math.max(0, Math.ceil(halves / 2) - 1) : -1
  const runs: Run[] = []
  for (let i = 0; i < length; i++) {
    const glyph: Run =
      i === end ? { text: '●' } : 2 * i + 1 < halves ? { text: '━', color: fill } : 2 * i < halves ? { text: '╾', color: fill } : { text: '─', color: TONE.track }
    const last = runs.at(-1)
    if (last !== undefined && last.color === glyph.color) last.text += glyph.text
    else runs.push(glyph)
  }
  return runs
}

export function clock(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(whole / 60) % 60
  const rest = String(whole % 60).padStart(2, '0')
  const hours = Math.floor(whole / 3600)
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`
}

/** A count as the band prints it: 950, 9.5k, 24k, 1.2M. */
export function amount(n: number) {
  const trim = (text: string) => text.replace(/\.0$/, '')
  if (n < 1_000) return String(Math.round(n))
  if (n < 10_000) return `${trim((n / 1_000).toFixed(1))}k`
  if (n < 1_000_000) return `${Math.round(n / 1_000)}k`
  return `${trim((n / 1_000_000).toFixed(1))}M`
}

/** A stretch of time as the band prints it, to the minute and rounded up, a nought left off: 35m, 2h 40m, 3h, 1d 7h. */
export function span(ms: number) {
  const minutes = Math.max(0, Math.ceil(ms / 60_000))
  const [days, hours] = [Math.floor(minutes / 1440), Math.floor((minutes % 1440) / 60)]
  const [major, minor] = days > 0 ? [`${days}d`, `${hours}h`] : hours > 0 ? [`${hours}h`, `${minutes % 60}m`] : [`${minutes}m`, '']
  return minor === '' || minor.startsWith('0') ? major : `${major} ${minor}`
}

/** Columns of the card's text beside the cover: the line between the time played and the track's length. */
export const textColumns = (duration: number) => CARD.line + 2 + clock(duration).length * 2

/** Seconds into the track at `now`, as the last reading implies. */
export function playhead(view: { state: 'playing' | 'paused'; position: number; at: number }, now: number) {
  return view.position + (view.state === 'playing' ? (now - view.at) / 1000 : 0)
}

function isWide(code: number) {
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f300 && code <= 0x1faff) ||
    (code >= 0x20000 && code <= 0x3fffd)
  )
}

/** Terminal cells the text takes: CJK and emoji take two. */
export function cells(text: string) {
  let count = 0
  for (const char of text) count += isWide(char.codePointAt(0)!) ? 2 : 1
  return count
}

/** The text cut to `room` cells, an ellipsis marking the cut. */
export function fit(text: string, room: number) {
  if (cells(text) <= room) return text
  let kept = ''
  let used = 0
  for (const char of text) {
    const size = isWide(char.codePointAt(0)!) ? 2 : 1
    if (used + size > room - 1) break
    kept += char
    used += size
  }
  return `${kept.trimEnd()}…`
}

/** Braille dots of the left and right columns, bottom up: each cell draws two bars. */
const LEFT = [0x40, 0x04, 0x02, 0x01]
const RIGHT = [0x80, 0x20, 0x10, 0x08]
/** Seconds per sway of each bar: unequal, so the four never fall into step. */
const PERIODS = [1.3, 1.9, 1.1, 2.4]
const STILL = [2, 4, 3, 2]

export const ease = (x: number) => 1 - (1 - unit(x)) ** 3

/** Milliseconds the meter takes to settle into one row once the music stops. */
const SETTLE = 600
/** Milliseconds between the meter's frames while it sways. Each frame is a redraw of the terminal's, and those are what
 * the band costs while music plays. */
const SWAY = 200

function dots(levels: number[]) {
  const column = (bits: number[], level = 0) => bits.slice(0, level).reduce((sum, bit) => sum | bit, 0)
  let drawn = ''
  for (let i = 0; i < levels.length; i += 2) drawn += String.fromCodePoint(0x2800 + column(LEFT, levels[i]) + column(RIGHT, levels[i + 1]))
  return drawn
}

/**
 * Four bars in two cells that sway while the music plays and settle into one row when it stops, easing between
 * the two from `since`, the moment playback last started or stopped.
 */
export function meter(isPlaying: boolean, isMotionReduced: boolean, since: number, now: number) {
  const strength = isPlaying ? ease((now - since) / 450) : 1 - ease((now - since) / SETTLE)
  const t = now / 1000
  const levels = isMotionReduced
    ? STILL.map(level => (isPlaying ? level : 1))
    : PERIODS.map((period, i) => {
        const sway = 0.6 * Math.sin((2 * Math.PI * t) / period + i * 2.1) + 0.4 * Math.sin((2 * Math.PI * t) / (period * 0.43) + i)
        return 1 + Math.round((0.5 + 0.5 * sway) * 3 * strength)
      })
  return dots(levels)
}

/**
 * Milliseconds between a player's frames while anything on it moves, else null: the meter sways while the music plays
 * and settles once it stops; with motion reduced only the playhead moves, a second at a time.
 */
export function playerBeat(view: { state: 'playing' | 'paused'; isMotionReduced: boolean }, since: number, now: number) {
  if (view.isMotionReduced) return view.state === 'playing' ? 1000 : null
  return view.state === 'playing' || now - since < SETTLE ? SWAY : null
}

const timers = new WeakMap<object, { ms: number; stop: () => void }>()

/**
 * Keeps `tick` running every `ms` on the surface's frame clock, or none while `ms` is null. Any timer of a Client keeps
 * that clock running sixty times a second, so a Client holds one only while what it draws moves.
 */
export function ticker(surface: Pick<ClientSurface, 'every'>, ms: number | null, tick: () => void) {
  const running = timers.get(surface)
  if (running?.ms === ms) return
  running?.stop()
  if (ms === null) timers.delete(surface)
  else timers.set(surface, { ms, stop: surface.every(ms, tick) })
}

const IDLE = { zone: null, scrub: null, seek: null }

/**
 * A pointer event on a player, `under` being the zone and the seconds beneath the pointer. A press on the line holds
 * it, a move while it is held scrubs, and the release seeks; a press anywhere else sends what `press` makes of its zone.
 */
export function pointed<Zone extends string>(
  surface: ClientSurface<Local<Zone>>,
  event: ClientPointerEvent,
  under: { zone: Zone | null; seconds: number },
  press: (zone: Exclude<Zone, 'line'>) => Message | null,
) {
  const local = surface.state ?? IDLE
  if (local.scrub !== null) {
    if (event.type === 'move') surface.setState({ ...local, scrub: under.seconds })
    if (event.type === 'up') {
      surface.post({ type: 'seek', seconds: local.scrub })
      surface.setState({ ...local, zone: under.zone, scrub: null, seek: { seconds: local.scrub, at: Date.now() } })
    }
    return
  }
  const zone = event.type === 'leave' ? null : under.zone
  if (event.type === 'down' && event.button === 'left' && zone !== null) {
    if (zone === 'line') return surface.setState({ ...local, zone, scrub: under.seconds })
    const message = press(zone as Exclude<Zone, 'line'>)
    if (message !== null) surface.post(message)
  }
  if (zone !== local.zone) surface.setState({ ...local, zone })
}

/**
 * A player's surface module from its parts: `scene`, what it shows at a moment; `draw`, the tree for a scene; and
 * `point`, what a pointer event does. It is drawn on new props and new state, and on the frames of its own clock,
 * then only when the scene has changed; the clock runs while the player moves.
 */
export function playerModule<Zone extends string, Scene>(parts: {
  scene: (props: PlayerProps, since: number, local: Local<Zone>, now: number, columns: number) => Scene
  draw: (surface: ClientSurface<Local<Zone>>, props: PlayerProps, at: Scene) => RenderElement
  point: (surface: ClientSurface<Local<Zone>>, props: PlayerProps, event: ClientPointerEvent) => void
}): ClientModule<PlayerProps, Local<Zone>> {
  /** Each instance's latest props, when playback last started or stopped, and the scene it last drew. */
  const held = new WeakMap<object, { props: PlayerProps; since: number; drawn: string }>()
  const tick = (surface: ClientSurface<Local<Zone>>) => {
    const { props, since, drawn } = held.get(surface)!
    const local = surface.state ?? IDLE
    const now = Date.now()
    if (JSON.stringify(parts.scene(props, since, local, now, surface.columns)) !== drawn) surface.setState(local)
    ticker(surface, playerBeat(props, since, now), () => tick(surface))
  }
  return (props, surface) => {
    const now = Date.now()
    const last = held.get(surface)
    const since = last === undefined ? (props.state === 'playing' ? now : 0) : last.props.state === props.state ? last.since : now
    const at = parts.scene(props, since, surface.state ?? IDLE, now, surface.columns)
    held.set(surface, { props, since, drawn: JSON.stringify(at) })
    if (last === undefined) surface.onPointer(event => parts.point(surface, held.get(surface)!.props, event))
    ticker(surface, playerBeat(props, since, now), () => tick(surface))
    return surface.columns === 0 ? surface.elements.Text({ children: [''] }) : parts.draw(surface, props, at)
  }
}
