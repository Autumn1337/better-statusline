import type { Environment, MusicApp, MusicLook, MusicPlayer, MusicRepeat } from '../types'
import { CARD, textColumns, type View } from '../ui/shared'

export const REPEAT: Record<MusicApp, Record<MusicRepeat, MusicRepeat>> = {
  Spotify: { off: 'all', all: 'off', one: 'off' },
  Music: { off: 'all', all: 'one', one: 'off' },
}
/** The halo's blur, and how far it falls below the cover, as fractions of the cover's side. */
const GLOW = 0.05
const DROP = 0.02
const FEATURE = /\s*[([](?:feat\.?|ft\.?|featuring|with)\s+([^)\]]+)[)\]]/i
const REMASTER =
  /\s*(?:-\s*(?:\d{4}\s+)?remaster(?:ed)?(?:\s+\d{4})?(?:\s+version)?|[([](?:\d{4}\s+)?remaster(?:ed)?(?:\s+\d{4})?(?:\s+version)?[)\]])\s*$/i
export const MUSIC_COVER = [
  'on run argv',
  'tell application "Music" to set art to raw data of artwork 1 of current track',
  'set out to open for access POSIX file (item 1 of argv) with write permission',
  'set eof out to 0',
  'write art to out',
  'close access out',
  'end run',
].flatMap(line => ['-e', line])

/** The cell the cover's pictures are sized by: null where the terminal draws none, or reports no cell to size them by. */
export const canvasOf = (machine: Environment) => (machine.drawsPictures ? machine.cell : null)

/** The card's cover under its halo, as large as the halo leaves room for: what cover.js draws, in points, and its columns. */
export function coverOf(cell: { width: number; height: number }) {
  const height = CARD.rows * cell.height
  const side = height / (1 + 6 * GLOW + DROP)
  const columns = Math.ceil((side * (1 + 6 * GLOW)) / cell.width)
  return { columns, paint: { width: columns * cell.width, height, side, top: 3 * GLOW * side, glow: GLOW, drop: DROP } }
}

/** Where the track's cover comes from: Spotify's URL for it, null while Spotify gives none, or the Music track it is read out of. */
export const artworkOf = (player: MusicPlayer) => (player.app === 'Music' ? `music:${player.track.id}` : player.track.artwork || null)

/** Columns the card takes: the cover and the gap after it, where there is one, then the text. */
export const cardColumns = (cover: number, duration: number) => (cover === 0 ? 0 : cover + CARD.gap) + textColumns(duration)

export function viewOf(current: MusicPlayer, trackLook: MusicLook | null): View {
  const isDressed = trackLook !== null && trackLook.id === current.track.id
  return {
    app: current.app,
    title: current.track.title.replace(FEATURE, '').replace(REMASTER, '').trim(),
    features: FEATURE.exec(current.track.title)?.[1]?.trim() ?? '',
    artist: current.track.artist,
    album: current.track.album,
    state: current.state,
    position: current.position,
    at: current.at,
    duration: current.track.duration,
    volume: current.volume,
    shuffle: current.shuffle,
    repeat: current.repeat,
    tint: isDressed ? trackLook.tint : null,
    hasCover: isDressed && trackLook.art !== null,
  }
}
