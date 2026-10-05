import type { ClientPointerEvent, ClientSurface } from 'claude-code'

import { ICON, RESERVE, TONE, cells, clock, fit, meter, playerModule, playhead, pointed, rail, type Local, type PlayerProps } from './shared'

const LINE = 28
const SHORTEST_LINE = 12
const CONTROLS = ['previous', 'toggle', 'next'] as const

type Zone = 'expand' | 'line' | 'rest' | (typeof CONTROLS)[number]

/**
 * Title, artist and line kept together after the cover, or after a note where there is none, room left for the reveal.
 * The cover lies beside the region, not in it; the note takes the region's first two columns.
 */
function arrange(props: PlayerProps, columns: number) {
  const lead = props.hasCover ? 0 : 2
  const total = clock(props.duration)
  const time = total.length * 2 + 3
  const tail = 2 + time + 3 + 7
  const space = columns - RESERVE - lead - 3 - tail
  const line = Math.max(SHORTEST_LINE, Math.min(LINE, space - 20))
  const room = space - line
  const title = fit(props.title, room)
  const left = room - cells(title) - 2
  const artist = left >= 6 ? fit(props.artist, left) : ''
  const lineStart = lead + cells(title) + (artist === '' ? 0 : 2 + cells(artist)) + 3
  const tailStart = lineStart + line + 2
  return { title, artist, total, lineStart, lineEnd: lineStart + line, tailStart, controls: tailStart + time + 3 }
}

type Layout = ReturnType<typeof arrange>

function zoneAt(x: number, y: number, layout: Layout): Zone | null {
  if (y !== 0 || x < 0 || x >= layout.controls + 8) return null
  if (x < layout.lineStart - 3) return 'expand'
  if (x >= layout.lineStart && x < layout.lineEnd) return 'line'
  const offset = x - layout.controls
  if (offset >= -1 && offset <= 1) return 'previous'
  if (offset >= 2 && offset <= 4) return 'toggle'
  if (offset >= 5 && offset <= 7) return 'next'
  return 'rest'
}

/** What changes with the clock, as the line shows it: the rail to the half cell, the meter at rest, the times while open. */
function scene(props: PlayerProps, since: number, local: Local<Zone>, now: number, columns: number) {
  const layout = arrange(props, columns)
  const seek = local.seek !== null && props.at < local.seek.at ? local.seek.seconds : null
  const seconds = Math.min(props.duration, local.scrub ?? seek ?? playhead(props, now))
  const isOpen = local.zone !== null || local.scrub !== null
  const halves = 2 * (layout.lineEnd - layout.lineStart)
  return {
    layout,
    played: props.duration > 0 ? Math.round((seconds / props.duration) * halves) / halves : 0,
    isOpen,
    hasKnob: local.zone === 'line' || local.scrub !== null,
    time: isOpen ? `${clock(seconds).padStart(layout.total.length)} / ${layout.total}` : '',
    meter: isOpen ? '' : meter(props.state === 'playing', props.isMotionReduced, since, now),
    zone: local.zone,
  }
}

type Scene = ReturnType<typeof scene>

function draw(surface: ClientSurface<Local<Zone>>, props: PlayerProps, at: Scene) {
  const { Text } = surface.elements
  const isPlaying = props.state === 'playing'
  const accent = props.tint ?? TONE.fill
  const icon = ICON[props.icons]
  const reveal = at.isOpen
    ? [
        <Text color={TONE.muted}>{`${at.time}   `}</Text>,
        ...CONTROLS.map(zone => (
          <Text {...(at.zone === zone ? { color: accent, bold: true } : {})}>
            {zone === 'toggle' ? (isPlaying ? icon.pause : icon.play) : icon[zone]}
            {zone === 'next' ? '' : '  '}
          </Text>
        )),
      ]
    : [<Text color={isPlaying ? accent : TONE.muted}>{at.meter}</Text>]
  return (
    <Text wrap="truncate">
      {props.hasCover ? '' : <Text color={TONE.muted}>{`${icon.note} `}</Text>}
      <Text bold underline={at.zone === 'expand'}>
        {at.layout.title}
      </Text>
      {at.layout.artist === '' ? '' : '  '}
      <Text color={TONE.muted}>{at.layout.artist}</Text>
      {'   '}
      {rail(at.layout.lineEnd - at.layout.lineStart, at.played, isPlaying ? accent : TONE.muted, at.hasKnob).map(run => (
        <Text {...(run.color === undefined ? {} : { color: run.color })}>{run.text}</Text>
      ))}
      {'  '}
      {reveal}
    </Text>
  )
}

/** The line seeks, the title opens the band, and a control asks for itself. */
function point(surface: ClientSurface<Local<Zone>>, props: PlayerProps, event: ClientPointerEvent) {
  const layout = arrange(props, surface.columns)
  const x = event.fine?.x ?? event.x + 0.5
  const seconds = Math.min(1, Math.max(0, (x - layout.lineStart) / (layout.lineEnd - layout.lineStart))) * props.duration
  pointed(surface, event, { zone: zoneAt(event.x, event.y, layout), seconds }, zone => (zone === 'rest' ? null : { type: zone }))
}

export default playerModule({ scene, draw, point })
