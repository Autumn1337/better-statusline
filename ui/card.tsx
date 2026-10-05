import type { ClientPointerEvent, ClientSurface } from 'claude-code'

import { CARD, ICON, TONE, clock, fit, meter, playerModule, playhead, pointed, rail, textColumns, type Control, type Local, type PlayerProps, type Run } from './shared'

const CONTROLS: Control[] = ['shuffle', 'previous', 'toggle', 'next', 'repeat']
/** Columns from one control to the next. */
const STRIDE = 4
/** The card's rows. */
const ROW = { title: 0, artist: 1, album: 2, line: 3, controls: 4 }

type Zone = 'line' | 'quieter' | 'louder' | Control

/** A tenth step from the nearest tenth, so a player that stores one less than it is told never drifts. */
const notched = (volume: number, step: number) => Math.min(100, Math.max(0, Math.round(volume / 10) * 10 + step))

/** Where the line starts: past the time played and a space. */
const lineStart = (props: PlayerProps) => clock(props.duration).length + 1

/** The line seeks; the last row holds the transport and, at its end, the volume. */
function zoneAt(props: PlayerProps, x: number, y: number): Zone | null {
  const width = textColumns(props.duration)
  const from = lineStart(props)
  if (x < 0 || y < 0 || y >= CARD.rows || x >= width) return null
  if (y === ROW.line && x >= from && x < from + CARD.line) return 'line'
  if (y !== ROW.controls) return null
  if (x >= width - 4) return x < width - 2 ? 'quieter' : 'louder'
  const i = Math.floor((x + 1) / STRIDE)
  return i < CONTROLS.length ? CONTROLS[i]! : null
}

/** What changes with the clock, as the card shows it: the line to the half cell it draws, the times, the meter. */
function scene(props: PlayerProps, since: number, local: Local<Zone>, now: number) {
  const seek = local.seek !== null && props.at < local.seek.at ? local.seek.seconds : null
  const seconds = Math.min(props.duration, local.scrub ?? seek ?? playhead(props, now))
  const total = clock(props.duration)
  return {
    played: props.duration > 0 ? Math.round((seconds / props.duration) * CARD.line * 2) / (CARD.line * 2) : 0,
    hasKnob: local.zone === 'line' || local.scrub !== null,
    elapsed: clock(seconds).padStart(total.length),
    total,
    meter: meter(props.state === 'playing', props.isMotionReduced, since, now),
    zone: local.zone,
  }
}

type Scene = ReturnType<typeof scene>

function draw(surface: ClientSurface<Local<Zone>>, props: PlayerProps, at: Scene) {
  const { Box, Text } = surface.elements
  const width = textColumns(props.duration)
  const isPlaying = props.state === 'playing'
  const accent = props.tint ?? TONE.fill
  const artist = props.features === '' ? props.artist : `${props.artist}, ${props.features}`
  const isLit = (zone: Zone) => (zone === 'shuffle' && props.shuffle) || (zone === 'repeat' && props.repeat !== 'off')
  /** Controls at rest are muted, the ones switched on wear the accent, and the one under the pointer is bold. */
  const tone = (zone: Zone) => ({
    ...(isLit(zone) ? { color: accent } : zone === 'toggle' || at.zone === zone ? {} : { color: TONE.muted }),
    ...(at.zone === zone ? { bold: true } : {}),
  })
  const icon = ICON[props.icons]
  const glyph = (control: Control) =>
    control === 'toggle' ? (isPlaying ? icon.pause : icon.play) : control === 'repeat' && props.repeat === 'one' ? icon.repeatOnce : icon[control]
  const runs = (row: Run[]) => row.map(run => <Text {...(run.color === undefined ? {} : { color: run.color })}>{run.text}</Text>)
  return (
    <Box flexDirection="column" width={width} height={CARD.rows}>
      <Text wrap="truncate">
        <Text bold>{fit(props.title, width - 4)}</Text>
        {'  '}
        <Text color={isPlaying ? accent : TONE.muted}>{at.meter}</Text>
      </Text>
      <Text color={TONE.muted} wrap="truncate">
        {fit(artist, width)}
      </Text>
      <Text color={TONE.muted} italic wrap="truncate">
        {fit(props.album, width)}
      </Text>
      <Text wrap="truncate">
        <Text color={TONE.muted}>{`${at.elapsed} `}</Text>
        {runs(rail(CARD.line, at.played, isPlaying ? accent : TONE.muted, at.hasKnob))}
        <Text color={TONE.muted}>{` ${at.total}`}</Text>
      </Text>
      <Box justifyContent="space-between">
        <Text>
          {CONTROLS.map((control, i) => (
            <Text {...tone(control)}>
              {glyph(control)}
              {i < CONTROLS.length - 1 ? ' '.repeat(STRIDE - 1) : ''}
            </Text>
          ))}
        </Text>
        {at.zone !== null && (
          <Text>
            <Text {...tone('quieter')}>{icon.quieter}</Text> <Text {...tone('louder')}>{icon.louder}</Text>
          </Text>
        )}
      </Box>
    </Box>
  )
}

/** The line seeks, the volume's ends step it a tenth, and a control asks for itself. */
function point(surface: ClientSurface<Local<Zone>>, props: PlayerProps, event: ClientPointerEvent) {
  const x = event.fine?.x ?? event.x + 0.5
  const seconds = Math.min(1, Math.max(0, (x - lineStart(props)) / CARD.line)) * props.duration
  pointed(surface, event, { zone: zoneAt(props, event.x, event.y), seconds }, zone =>
    zone === 'quieter' || zone === 'louder' ? { type: 'volume', level: notched(props.volume, zone === 'louder' ? 10 : -10) } : { type: zone },
  )
}

export default playerModule({ scene, draw, point })
