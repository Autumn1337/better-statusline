export type MusicApp = 'Spotify' | 'Music'

export type MusicRepeat = 'off' | 'one' | 'all'

/** The cover's main colour as hex, lifted to read on a dark terminal. */
export type MusicTint = string

export type MusicTrack = {
  id: string
  title: string
  artist: string
  album: string
  /** Seconds. */
  duration: number
  /** Spotify's cover URL; Music hands its cover over as bytes. */
  artwork: string | null
}

export type MusicPlayer = {
  app: MusicApp
  state: 'playing' | 'paused'
  track: MusicTrack
  /** Seconds into the track at `at`. */
  position: number
  /** Epoch milliseconds of the reading. */
  at: number
  /** 0 to 100. */
  volume: number
  shuffle: boolean
  repeat: MusicRepeat
}

export type MusicLook = {
  /** The track the look was drawn for. */
  id: string
  /** The cover it was drawn from: Spotify's cover URL, or the Music track it was read out of. */
  source: string
  tint: MusicTint | null
  /** Generation of the track's pictures as drawn for this terminal; null when it has none or the terminal draws no pictures. */
  art: number | null
}

/** What the band's icons are drawn from: the Nerd Font glyphs a terminal carries, or plain Unicode. */
export type Icons = 'nerd' | 'unicode'

/** The machine and the terminal the session runs in, read once a load. */
export type Environment = {
  /** This session's folder for cover pictures on a Mac, whose osascript reaches the players; null on any other machine, where the band is the status alone. */
  folder: string | null
  /** One terminal cell in the units the terminal reports its size in; null where it reports none. */
  cell: { width: number; height: number } | null
  /** Whether the terminal draws pictures over its cells. */
  drawsPictures: boolean
  icons: Icons
  isMotionReduced: boolean
  /** Milliseconds the environment or the settings fix the prompt cache's lifetime at; null where they leave it to the engine, which goes by the subscription. */
  cacheSpan: number | null
}

/** Tokens the session's turns sent (cache writes among them) and received. */
export type Tokens = { sent: number; received: number }

/** The working copy: its branch, and how many files are staged and how many changed beside them. */
export type Git = { branch: string; staged: number; modified: number }

/** The lines the session's edits and writes added and removed, as their patches count them. */
export type Edits = { added: number; removed: number }

/** The session's figures as `$.session.usage()` reads them, the window's breakdown aside. */
export type Usage = {
  context: { window: number; tokens?: number; percent?: number }
  rateLimits: { kind: string; percentUsed: number; resetsAt?: string }[]
  cost?: { usd: number }
}

/** What the status draws from, kept current by the session's events instead of read while it draws. */
export type Status = {
  model: string
  cwd: string
  usage: Usage
  tokens: Tokens
  /** The main loop's effort on its last turn, where the model takes one. */
  effort: string | null
  edits: Edits
  /** Null outside a repository. */
  git: Git | null
  /** Subagents running now. */
  agents: number
  /** The context window's fill after each of the last turns, oldest first. */
  history: number[]
  /** What each of the last turns cost in dollars, oldest first. */
  spend: number[]
  /** The session's cost when the last turn ended, which the next turn's cost is counted from. */
  spentAt: number
}

/** What the session's turns have counted, kept in the plugin's store under the session's id: a session started again in a new process draws them at once. */
export type Counted = Pick<Status, 'tokens' | 'effort' | 'edits' | 'history' | 'spend' | 'spentAt'>

declare module 'claude-code' {
  interface PluginState {
    'better-statusline': {
      player: MusicPlayer | null
      cover: MusicLook | null
      environment: Environment | null
      /** The person folded the status line into one row. */
      isCompact: boolean
      /** Null until the session's first reading. */
      status: Status | null
      /** When the main loop last had a response, from which the prompt cache's lifetime runs; null before the session's first. */
      cachedAt: number | null
    }
  }
}
