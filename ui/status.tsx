import type { ClientModule, ClientSurface } from 'claude-code'

import { bars, lane, ring, trend } from './dots'
import { ICON, RESERVE, TONE, amount, cells, ease, span, ticker, type Run, type StatusProps } from './shared'

/** Claude Code's own spinner, swung there and back while the model works; at rest the mark holds still. */
const FRAMES = ['·', '✢', '✳', '✶', '✻', '✽']
const MARK = '✻'
/** The subagents' spinner. */
const TURNS = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
/** Milliseconds a frame stays up. */
const BEAT = 80
/** Milliseconds a figure takes to glide to a new value. */
const GLIDE = 700
/** Cells the shimmer runs past the model's name before it comes round again. */
const SWEEP = 8
/** The context's hue, the prompt cache's, and the spend's. */
const CONTEXT = 'permission'
const CACHE = 'rainbow_orange'
const SPEND = 'rainbow_yellow'
/** Rows of cells a ring stands. */
const RING = 3
/** Turns of spend the bars show at most, and the fewest they are drawn for. */
const BARS = 12
const FEWEST = 4

/** An item of the header, which leaves first when the row runs short (the highest rank), and the spaces before it. */
type Item = { rank: number; gap: number; runs: Run[] }
type Glide = { from: number; to: number; at: number }
/** A frame of the status: the props and the width it was laid out for, its rows, and those rows as JSON. */
type Frame = { props: StatusProps; columns: number; rows: Run[][]; key: string }

/** Each instance's latest frame, drawn or asked for by its clock, and its figures in flight. */
const frames = new WeakMap<object, Frame>()
const glides = new WeakMap<object, Map<string, Glide>>()

const muted = (text: string): Run => ({ text, color: TONE.muted })
const breadth = (runs: Run[]) => runs.reduce((sum, run) => sum + cells(run.text), 0)
const flown = (flight: Glide, now: number) => flight.from + (flight.to - flight.from) * ease((now - flight.at) / GLIDE)

/** The figure `key` shows at `now`: easing from where it stood toward `target` since `target` arrived. */
function glide(surface: object, key: string, target: number, now: number, isMotionReduced: boolean) {
  const flights = glides.get(surface) ?? new Map<string, Glide>()
  glides.set(surface, flights)
  const last = flights.get(key)
  if (last === undefined || isMotionReduced) flights.set(key, { from: target, to: target, at: now })
  else if (last.to !== target) flights.set(key, { from: flown(last, now), to: target, at: now })
  return flown(flights.get(key)!, now)
}

/**
 * What changes with the clock: the mark, the shimmer, the spinner, the figures in flight, and the countdowns, the
 * prompt cache's as the milliseconds it has left (null before the first response).
 */
function scene(surface: object, props: StatusProps, now: number) {
  const beat = Math.floor(now / BEAT)
  const swing = beat % (2 * FRAMES.length - 2)
  const isMoving = props.isWorking && !props.isMotionReduced
  return {
    mark: isMoving ? FRAMES[swing < FRAMES.length ? swing : 2 * FRAMES.length - 2 - swing]! : MARK,
    shine: isMoving ? (beat % (cells(props.model) + SWEEP)) - 1 : null,
    turn: TURNS[props.isMotionReduced ? 0 : beat % TURNS.length]!,
    context: glide(surface, 'context', props.context.percent, now, props.isMotionReduced),
    limits: props.limits.map(limit => ({
      percent: glide(surface, limit.label, limit.percent, now, props.isMotionReduced),
      left: limit.resetsAt === null ? null : span(limit.resetsAt - now),
      pace: limit.resetsAt === null ? undefined : 1 - (limit.resetsAt - now) / limit.span,
    })),
    cache: props.cache.at === null ? null : props.cache.at + props.cache.span - now,
    cost: glide(surface, 'cost', props.cost ?? 0, now, props.isMotionReduced),
  }
}

type Scene = ReturnType<typeof scene>

/** The model's name, a band of light running across it in Claude's colour while the model works. */
function shimmer(name: string, shine: number | null): Run[] {
  if (shine === null) return [{ text: name, bold: true }]
  const chars = [...name]
  const [from, to] = [Math.max(0, shine), Math.max(0, shine + 2)]
  return [
    { text: chars.slice(0, from).join(''), color: TONE.brand },
    { text: chars.slice(from, to).join(''), color: 'claudeShimmer' },
    { text: chars.slice(to).join(''), color: TONE.brand },
  ].flatMap(run => (run.text === '' ? [] : [{ ...run, bold: true }]))
}

const limitColor = (percent: number, pace: number | undefined) =>
  percent >= 90 ? TONE.alarm : pace !== undefined && percent / 100 > pace ? TONE.warn : undefined

/** A percentage: the figure bold, in `color` when it warns, the sign muted. */
const figure = (percent: number, color?: string): Run[] => [
  { text: String(Math.round(percent)), bold: true, ...(color === undefined ? {} : { color }) },
  muted('%'),
]

const money = (cost: number): Run[] => [{ text: '$', color: SPEND }, { text: cost.toFixed(2), bold: true }]

const spread = (left: Run[], right: Run[], room: number): Run[] => [...left, { text: ' '.repeat(Math.max(1, room - breadth(left) - breadth(right))) }, ...right]

const pad = (runs: Run[], room: number): Run[] => (breadth(runs) < room ? [...runs, { text: ' '.repeat(room - breadth(runs)) }] : runs)

/** The cells `from` to `to` of a row of one-cell glyphs. */
function cut(runs: Run[], from: number, to: number): Run[] {
  const out: Run[] = []
  let at = 0
  for (const run of runs) {
    const piece = [...run.text].slice(Math.max(0, from - at), Math.max(0, to - at)).join('')
    if (piece !== '') out.push({ ...run, text: piece })
    at += cells(run.text)
  }
  return out
}

const joined = (items: Item[]): Run[] => items.flatMap((item, i) => (i === 0 ? item.runs : [{ text: ' '.repeat(item.gap) }, ...item.runs]))

/** The left items and the right ones that fit `room` with three cells at least between the two, the highest ranks leaving first. */
function within(left: Item[], right: Item[], room: number) {
  const kept = [...left, ...right]
  const keep = (items: Item[]) => items.filter(item => kept.includes(item))
  const total = () => breadth(joined(keep(left))) + breadth(joined(keep(right))) + 3
  while (kept.length > 0 && total() > room) kept.splice(kept.indexOf(kept.reduce((a, b) => (b.rank > a.rank ? b : a))), 1)
  return [keep(left), keep(right)] as const
}

/** Who works, where and on what, and the subagents at it; at the far end, the spend when the row beneath has no room for its bars. */
function header(props: StatusProps, at: Scene, room: number, hasSpend: boolean): Run[] {
  const { git, effort, edits } = props
  const left: Item[] = [
    {
      rank: 0,
      gap: 0,
      runs: [
        { text: `${at.mark} `, color: TONE.brand },
        ...shimmer(props.model, at.shine),
        ...(effort === null ? [] : [{ text: `  ${effort}`, color: effort === 'max' || effort === 'xhigh' ? 'effortUltra' : TONE.muted }]),
      ],
    },
    { rank: 4, gap: 4, runs: [muted(`${ICON[props.icons].folder} `), { text: props.place }] },
    ...(git === null
      ? []
      : [
          {
            rank: 3,
            gap: 3,
            runs: [
              muted(`${ICON[props.icons].branch} `),
              { text: git.branch },
              ...(git.staged > 0 ? [{ text: ` +${git.staged}`, color: 'diffAddedWord' }] : []),
              ...(git.modified > 0 ? [{ text: ` ~${git.modified}`, color: TONE.warn }] : []),
            ],
          },
        ]),
    ...(props.agents === 0
      ? []
      : [{ rank: 1, gap: 3, runs: [{ text: `${at.turn} `, color: CONTEXT }, { text: String(props.agents) }, muted(props.agents === 1 ? ' agent' : ' agents')] }]),
    ...(edits.added + edits.removed === 0
      ? []
      : [{ rank: 5, gap: 2, runs: [{ text: `+${edits.added}`, color: 'diffAddedWord' }, { text: ` −${edits.removed}`, color: 'diffRemovedWord' }] }]),
  ]
  const right: Item[] = !hasSpend && props.cost !== null ? [{ rank: 2, gap: 3, runs: money(at.cost) }] : []
  const [front, back] = within(left, right, room)
  return spread(joined(front), joined(back), room)
}

/** A ring lit as far as `used`, `heart` at its centre and, beside it, its name on the heart's own line and the detail beneath. */
function ringPanel(label: string, hue: string, used: number, pace: number | undefined, heart: Run[], detail: string | null, aspect: number): Run[][] {
  const face = ring(used, RING, aspect, hue, pace)
  const across = breadth(face[1]!)
  const mid = Math.floor((across - breadth(heart)) / 2)
  return [
    face[0]!,
    [...cut(face[1]!, 0, mid), ...heart, ...cut(face[1]!, mid + breadth(heart), across), { text: `  ${label}` }],
    [...face[2]!, ...(detail === null ? [] : [muted(`  ${detail}`)])],
  ]
}

/**
 * The prompt cache as a ring that runs down: lit for the life it has left of `life`, the minutes at its heart, warning
 * in its last tenth, and cold once it is spent.
 */
function cachePanel(left: number | null, life: number, aspect: number) {
  const minutes: Run[] = [{ text: String(Math.ceil((left ?? 0) / 60_000)), bold: true, ...((left ?? 0) <= life / 10 ? { color: TONE.warn } : {}) }, muted('m')]
  const heart = left === null ? [muted('–')] : left <= 0 ? [muted('cold')] : minutes
  return ringPanel('cache', CACHE, Math.max(0, left ?? 0) / life, undefined, heart, `of ${span(life)}`, aspect)
}

/** A drawing of the row, and when it leaves a row too short for them all: the highest rank first. */
type Panel = { rank: number; block: Run[][] }

/**
 * The drawings side by side under a row of air, each with its words beside it: the rings of the context, the prompt
 * cache and each limit, and the spend of the last turns as bars. A row too short loses the cache's ring, then its
 * less spent limits; the bars take what room is left, and none where it is less than a few turns' worth.
 */
function panels(props: StatusProps, at: Scene, room: number) {
  const gutter = room >= 110 ? 6 : 4
  const { context, cache, limits, aspect } = props
  const filled = context.tokens === null ? `of ${amount(context.window)}` : `${amount(context.tokens)}/${amount(context.window)}`
  const mostSpent = limits.reduce((most, limit, i) => (limit.percent > limits[most]!.percent ? i : most), 0)
  const rings: Panel[] = [
    { rank: 0, block: ringPanel('context', CONTEXT, at.context / 100, undefined, figure(at.context), filled, aspect) },
    { rank: 3, block: cachePanel(at.cache, cache.span, aspect) },
    ...limits.map((limit, i) => {
      const now = at.limits[i]!
      const heart = figure(now.percent, limitColor(limit.percent, now.pace))
      return { rank: i === mostSpent ? 1 : 2, block: ringPanel(limit.label, limit.hue, now.percent / 100, now.pace, heart, now.left, aspect) }
    }),
  ]
  const width = (block: Run[][]) => Math.max(...block.map(breadth))
  const across = (shown: Panel[]) => shown.reduce((sum, panel) => sum + width(panel.block) + gutter, -gutter)
  let shown = rings
  while (shown.length > 1 && across(shown) > room) {
    const last = shown.reduce((a, b) => (b.rank >= a.rank ? b : a))
    shown = shown.filter(panel => panel !== last)
  }
  const blocks = shown.map(panel => panel.block)
  const words = [money(at.cost), [muted('spent')]]
  const tokens = [muted(' · '), { text: amount(props.tokens.sent) }, muted(' in · '), { text: amount(props.tokens.received) }, muted(' out')]
  const spare = room - across(shown) - gutter - 2 - width(words)
  const hasSpend = props.cost !== null && spare >= FEWEST
  if (hasSpend) {
    const turns = Math.min(BARS, spare)
    const drawn = bars(props.spend.slice(-turns), turns, RING, SPEND)
    if (spare - turns >= breadth(tokens)) words[1]!.push(...tokens)
    blocks.push([drawn[0]!, [...drawn[1]!, { text: '  ' }, ...words[0]!], [...drawn[2]!, { text: '  ' }, ...words[1]!]])
  }
  const row = (r: number) => blocks.flatMap((block, i) => [...(i === 0 ? [] : [{ text: ' '.repeat(gutter) }]), ...pad(block[r]!, width(block))])
  return { rows: [[{ text: ' ' }], ...Array.from({ length: RING }, (_, r) => row(r))], hasSpend }
}

/** The figures on one line, for the folded band: the context's turns and each limit as a lane of dots, the spend. */
function line(props: StatusProps, at: Scene, room: number): Run[] {
  const out: Run[] = [{ text: `${at.mark} `, color: TONE.brand }, ...trend(props.context.history, 5, 1, CONTEXT)[0]!, { text: ' ' }, ...figure(at.context)]
  props.limits.forEach((limit, i) => {
    const now = at.limits[i]!
    out.push({ text: '    ' }, ...lane(now.percent / 100, 6, limit.hue, now.pace), { text: ' ' }, ...figure(now.percent, limitColor(limit.percent, now.pace)))
  })
  return props.cost === null ? out : spread(out, money(at.cost), room)
}

/** What the status shows at `now`: one line when folded, else the header over the drawings and their words. */
function rowsOf(surface: ClientSurface<number>, props: StatusProps, now: number): Run[][] {
  const at = scene(surface, props, now)
  const room = surface.columns - RESERVE
  if (props.isCompact) return [line(props, at, room)]
  const drawn = panels(props, at, room)
  return [header(props, at, room, drawn.hasSpend), ...drawn.rows]
}

/** Whether the status moves between frames: the mark and the shimmer while the model works, the agents' spinner, a figure gliding. */
function isMoving(surface: object, props: StatusProps, now: number) {
  if (props.isMotionReduced) return false
  const flights = [...(glides.get(surface)?.values() ?? [])]
  return props.isWorking || (props.agents > 0 && !props.isCompact) || flights.some(flight => flight.from !== flight.to && now - flight.at < GLIDE)
}

function draw(surface: ClientSurface<number>, rows: Run[][]) {
  const { Box, Text } = surface.elements
  const row = (runs: Run[]) => (
    <Text wrap="truncate">
      {runs.map(run => (
        <Text {...(run.color === undefined ? {} : { color: run.color })} {...(run.bold ? { bold: true } : {})} {...(run.dim ? { dimColor: true } : {})}>
          {run.text}
        </Text>
      ))}
    </Text>
  )
  return rows.length === 1 ? row(rows[0]!) : <Box flexDirection="column">{rows.map(row)}</Box>
}

function frameOf(surface: ClientSurface<number>, props: StatusProps, now: number): Frame {
  const rows = rowsOf(surface, props, now)
  return { props, columns: surface.columns, rows, key: JSON.stringify(rows) }
}

/** A tick of the clock: the status is drawn again only when what it shows has changed, and the clock stops once nothing moves. */
function tick(surface: ClientSurface<number>) {
  const last = frames.get(surface)!
  const now = Date.now()
  const next = frameOf(surface, last.props, now)
  if (next.key !== last.key) {
    frames.set(surface, next)
    surface.setState(now)
  }
  ticker(surface, isMoving(surface, last.props, now) ? BEAT : null, () => tick(surface))
}

/**
 * The status, drawn on new props, on a new width, and on the frames its own clock asks for. That clock runs only while
 * something on it moves; at rest the hooks module wakes it, each new minute in its props drawing it again.
 */
const Status: ClientModule<StatusProps, number> = (props, surface) => {
  if (surface.columns === 0) return surface.elements.Text({ children: [''] })
  const now = Date.now()
  const last = frames.get(surface)
  const frame = last?.props === props && last.columns === surface.columns ? last : frameOf(surface, props, now)
  frames.set(surface, frame)
  ticker(surface, isMoving(surface, props, now) ? BEAT : null, () => tick(surface))
  return draw(surface, frame.rows)
}

export default Status
