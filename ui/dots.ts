import { TONE, type Run } from './shared'

/** How bright a dot is drawn: the empty track, the hue made faint, the hue, and warning past a limit's pace. */
const FAINT = 1
const DIM = 2
const LIT = 3
const WARN = 4

/** The braille bit of each dot in a cell, by row then column. */
const BITS = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
]

/** How far apart a cell's four rows of dots stand, as a fraction of its height. Terminals draw them closer than the
 * quarter that would space them evenly down the screen, so the gap between two rows of cells is the wider one. */
const PITCH = 0.218

/** A field of braille dots `cols` cells wide and `rows` tall; a cell takes the brightest ink of its dots, as a
 * terminal cell has one foreground. */
function field(cols: number, rows: number) {
  const w = cols * 2
  const h = rows * 4
  const ink = new Uint8Array(w * h)
  const put = (x: number, y: number, level: number) => {
    if (x >= 0 && x < w && y >= 0 && y < h && level > ink[y * w + x]!) ink[y * w + x] = level
  }
  const runs = (hue: string): Run[][] =>
    Array.from({ length: rows }, (_, r) => {
      const row: Run[] = []
      for (let c = 0; c < cols; c++) {
        let bits = 0
        let top = 0
        for (let dy = 0; dy < 4; dy++)
          for (let dx = 0; dx < 2; dx++) {
            const level = ink[(4 * r + dy) * w + 2 * c + dx]!
            if (level === 0) continue
            bits |= BITS[dy]![dx]!
            top = Math.max(top, level)
          }
        const run: Run =
          top === 0
            ? { text: ' ' }
            : { text: String.fromCodePoint(0x2800 + bits), ...[{}, { color: TONE.track }, { color: hue, dim: true }, { color: hue }, { color: TONE.warn }][top] }
        const last = row.at(-1)
        if (last !== undefined && last.color === run.color && last.dim === run.dim) last.text += run.text
        else row.push(run)
      }
      return row
    })
  return { w, h, put, runs }
}

function line(put: (x: number, y: number, level: number) => void, x0: number, y0: number, x1: number, y1: number, level: number) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1)
  for (let i = 0; i <= n; i++) put(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), level)
}

/** The context window's fill turn by turn, oldest first: a bright line over dim dots, its peak at four fifths. */
export function trend(values: number[], cols: number, rows: number, hue: string) {
  const f = field(cols, rows)
  const points = values.length === 1 ? [values[0]!, values[0]!] : values
  if (points.length === 0) {
    for (let x = 0; x < f.w; x += 2) f.put(x, f.h - 1, FAINT)
    return f.runs(hue)
  }
  const top = Math.max(...points) * 1.25 || 1
  let previous = -1
  for (let x = 0; x < f.w; x++) {
    const t = (x / (f.w - 1)) * (points.length - 1)
    const a = Math.floor(t)
    const value = points[a]! + ((points[Math.min(points.length - 1, a + 1)] ?? points[a]!) - points[a]!) * (t - a)
    const y = Math.round((1 - value / top) * (f.h - 1))
    line(f.put, Math.max(0, x - 1), previous < 0 ? y : previous, x, y, LIT)
    for (let below = y + 1; below < f.h; below++) f.put(x, below, DIM)
    previous = y
  }
  return f.runs(hue)
}

/** Points taken round a ring for its track, and how thick its spent part is drawn, in cell widths. */
const STEPS = 40
const WEIGHT = 0.5

type Dot = { x: number; y: number; at: number }
const circles = new Map<string, { cols: number; track: Dot[]; band: Dot[] }>()

/**
 * The dots of a ring as tall as `rows` rows of cells on the terminal's uneven dot grid, each with how far round the
 * ring it lies, clockwise from the top. The track is `STEPS` points of the circle, found on the screen in cell widths
 * and snapped to the nearest dot: the right half's, and their mirror for the left, so both sides match. The band is
 * every dot within half `WEIGHT` of the circle. `aspect` is a cell's height over its width, which sets how many
 * columns the circle spans.
 */
function circle(rows: number, aspect: number) {
  const key = `${rows}@${aspect}`
  const kept = circles.get(key)
  if (kept !== undefined) return kept
  const centre = (x: number, y: number) => [(x >> 1) + 0.25 + 0.5 * (x & 1), aspect * ((y >> 2) + PITCH * (y & 3))] as const
  const h = rows * 4
  const [top, bottom] = [centre(0, 0)[1], centre(0, h - 1)[1]]
  const r = (bottom - top) / 2
  const cols = Math.ceil(2 * r)
  const [cx, cy] = [cols / 2, (top + bottom) / 2]
  const dots = Array.from({ length: cols * 2 * h }, (_, i) => {
    const [x, y] = [i % (cols * 2), Math.floor(i / (cols * 2))]
    const [px, py] = centre(x, y)
    return { x, y, at: (1.25 - Math.atan2(cy - py, px - cx) / (2 * Math.PI)) % 1, off: Math.hypot(px - cx, py - cy) - r, px, py }
  })
  const nearest = (px: number, py: number) => dots.reduce((best, dot) => ((dot.px - px) ** 2 + (dot.py - py) ** 2 < (best.px - px) ** 2 + (best.py - py) ** 2 ? dot : best))
  const right = Array.from({ length: STEPS / 2 + 1 }, (_, i) => nearest(cx + r * Math.sin((2 * Math.PI * i) / STEPS), cy - r * Math.cos((2 * Math.PI * i) / STEPS)))
  const track = [...new Set(right.flatMap(dot => [dot, dots[dot.y * cols * 2 + cols * 2 - 1 - dot.x]!]))]
  const made = { cols, track, band: dots.filter(dot => Math.abs(dot.off) <= WEIGHT / 2) }
  circles.set(key, made)
  return made
}

/**
 * A ring of dots lit clockwise from its top to `used` (warning past `pace`), the empty track beyond; the spent part is
 * the heavier, a band over the track's single line. Any use at all lights its first dot. Round on a terminal whose
 * cells are `aspect` times as tall as wide.
 */
export function ring(used: number, rows: number, aspect: number, hue: string, pace?: number) {
  const { cols, track, band } = circle(rows, aspect)
  const f = field(cols, rows)
  const reach = used > 0 ? Math.max(used, Math.min(...track.map(dot => dot.at))) + 1e-9 : -1
  for (const { x, y, at } of track) f.put(x, y, at <= reach ? (pace !== undefined && at > pace ? WARN : LIT) : FAINT)
  for (const { x, y, at } of band) if (at <= reach) f.put(x, y, pace !== undefined && at > pace ? WARN : LIT)
  return f.runs(hue)
}

/** One dot-wide bars a dot apart across `cols` cells, the newest at the right edge, as tall as the square root of their
 * values against the tallest, so one dear turn leaves the rest standing: the newest lit, the ones before it dim, and a
 * cell no turn has reached yet the empty track's one dot. */
export function bars(values: number[], cols: number, rows: number, hue: string) {
  const f = field(cols, rows)
  const top = Math.max(...values, 0) || 1
  const empty = cols - values.length
  for (let i = 0; i < empty; i++) f.put(2 * i, f.h - 1, FAINT)
  values.forEach((value, i) => {
    const level = i === values.length - 1 ? LIT : DIM
    for (let k = 0; k < Math.max(1, Math.round(Math.sqrt(value / top) * f.h)); k++) f.put(2 * (empty + i), f.h - 1 - k, level)
  })
  return f.runs(hue)
}

/** One row of dots lit column by column from the left to `used`, warning past `pace`, the empty track beyond. */
export function lane(used: number, cols: number, hue: string, pace?: number) {
  const f = field(cols, 1)
  const lit = Math.round(used * f.w * 4)
  for (let i = 0; i < f.w * 4; i++) {
    const x = Math.floor(i / 4)
    f.put(x, 3 - (i % 4), i < lit ? (pace !== undefined && x / f.w > pace ? WARN : LIT) : FAINT)
  }
  return f.runs(hue)[0]!
}
