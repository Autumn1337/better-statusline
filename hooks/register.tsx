import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderInput, ResolveInput, Timer } from 'claude-code'

import type { Counted, Environment, Icons, MusicPlayer, Status } from '../types'
import { CARD, RESERVE, SIGNATURE, SPACE, playhead, textColumns, type Message, type PlayerProps, type View } from '../ui/shared'
import { MUSIC_COVER, REPEAT, artworkOf, canvasOf, cardColumns, coverOf, viewOf } from './music'
import { UNEDITED, ZERO, counted, fixedCacheSpan, gitOf, nextMinute, statusOf } from './status'
import { strip } from './strip'
import { terminalOf } from './terminal'

const player = atom({ plugin: 'better-statusline', key: 'player' } as const, null)
const cover = atom({ plugin: 'better-statusline', key: 'cover' } as const, null)
const environment = atom({ plugin: 'better-statusline', key: 'environment' } as const, null)
const isCompact = atom({ plugin: 'better-statusline', key: 'isCompact' } as const, false)
const status = atom({ plugin: 'better-statusline', key: 'status' } as const, null)
const cachedAt = atom({ plugin: 'better-statusline', key: 'cachedAt' } as const, null)

/** The widest the one-line player grows in a folded band; the status takes the rest. */
const MINI = 64
/** The narrowest the status stands beside the card before the band folds. */
const NARROWEST = 48
/** Turns of the context window's fill, and of spend, the status keeps. */
const TURNS_KEPT = 16
/** Milliseconds between readings of the subagents while any runs. */
const AGENTS_EVERY = 3_000
/** The tools that change the files of the working copy. */
const WRITERS = new Set(['Bash', 'Edit', 'Write', 'NotebookEdit'])
/** The working copy in one reading, which neither takes git's index lock nor counts commits against the upstream. */
const GIT_STATUS = ['--no-optional-locks', 'status', '--porcelain=v2', '--branch', '--no-ahead-behind', '--untracked-files=no']
/** Milliseconds past a change the band wakes, so what it draws lands on the change's far side. */
const LATE = 20
/** What the session's events have counted before any has fired. */
const BLANK = { tokens: ZERO, effort: null, edits: UNEDITED, git: null, agents: 0, history: [], spend: [] }
/** Where a Mac keeps the scripting bridge its players are reached through. */
const OSASCRIPT = '/usr/bin/osascript'
/** Milliseconds before a cover that could not be fetched is asked for again; each failure doubles the wait. */
const RETRY = 10_000
/** Sessions whose counts the store keeps; the oldest leave first. */
const SESSIONS_KEPT = 100

/** The plugin's options as its manifest declares them. */
type Options = { icons: 'auto' | Icons; motion: 'auto' | 'full' | 'reduced' }

/** Cover work runs one job at a time: the jobs share the folder's files. */
let queue: Promise<unknown> = Promise.resolve()
const enqueue = (job: () => Promise<unknown>) => (queue = queue.then(job, job))
const scheduled = new Set<string>()

function schedule($: EngineInterface, key: string, job: () => Promise<unknown>) {
  if (scheduled.has(key)) return
  scheduled.add(key)
  $.clock.after(0, () => void enqueue(job).finally(() => scheduled.delete(key)))
}

/** Folds a change into the session's figures. One that leaves them as they stand is not written: every write draws the band again. */
async function revise($: EngineInterface, change: (now: Status) => Partial<Status>) {
  const now = await read($, status)
  if (now === null || JSON.stringify({ ...now, ...change(now) }) === JSON.stringify(now)) return
  await update($, status, now => now && { ...now, ...change(now) })
}

/**
 * The session as this load finds it. What its events have counted stays across a reload, and comes back from the
 * store when the session starts again in a new process.
 */
async function seed($: EngineInterface) {
  const [model, cwd, usage, id, sessions] = await Promise.all([$.session.model(), $.session.cwd(), $.session.usage(), $.session.id(), $.store.keys()])
  const counted = (await $.store.get(id)) as Counted | undefined
  await update($, status, now => ({ ...BLANK, spentAt: usage.cost?.usd ?? 0, ...counted, ...now, model, cwd, usage }))
  for (const stale of sessions.slice(0, -SESSIONS_KEPT)) await $.store.delete(stale)
}

/** Keeps what the session's turns have counted in the store. */
async function keep($: EngineInterface) {
  const [now, id] = await Promise.all([read($, status), $.session.id()])
  if (now === null) return
  const { tokens, effort, edits, history, spend, spentAt } = now
  await $.store.set(id, { tokens, effort, edits, history, spend, spentAt } satisfies Counted)
}

/** The status's next wake while nothing on it moves. */
let wake: Timer | undefined

/** Wakes the band at each minute on the clock: drawn again, a new minute in its props redraws the status. */
function plan($: EngineInterface) {
  wake?.cancel()
  wake = $.clock.after(nextMinute(Date.now()) + LATE, () => {
    $.ui.invalidate('ui.render')
    plan($)
  })
}

/** The subagents' reading while any runs: a subagent's start begins it, none running ends it. */
let watching: Timer | undefined

function watchAgents($: EngineInterface) {
  if (watching !== undefined) return
  void readAgents($)
  watching = $.clock.every(AGENTS_EVERY, async () => {
    if ((await readAgents($)) > 0) return
    watching?.cancel()
    watching = undefined
  })
}

async function readAgents($: EngineInterface) {
  const running = (await $.agent.list()).filter(agent => agent.status === 'running').length
  await revise($, () => ({ agents: running }))
  return running
}

async function readGit($: EngineInterface) {
  const { cwd } = (await read($, status))!
  const { exitCode, stdout } = await $.process.run(['git', '-C', cwd, ...GIT_STATUS])
  await revise($, () => ({ git: exitCode === 0 ? gitOf(stdout) : null }))
}

/** The lines an edit's or a write's patch added and removed. */
async function record($: EngineInterface, hunks: { lines: string[] }[]) {
  const { added, removed } = counted(hunks)
  await revise($, now => ({ edits: { added: now.edits.added + added, removed: now.edits.removed + removed } }))
}

/** One terminal cell as the terminal reports it: null where it reports none, and on a machine with no python3 to ask it. */
async function measure($: EngineInterface): Promise<{ width: number; height: number } | null> {
  const asked = await $.process.run(['python3', `${$.plugin.root}/bridge/measure.py`]).catch(() => null)
  return asked === null || asked.exitCode !== 0 ? null : JSON.parse(asked.stdout)
}

async function readTerminal($: EngineInterface) {
  const [program, term, kitty, tmux, screen, ssh, forced] = await Promise.all([
    $.env.get('TERM_PROGRAM'),
    $.env.get('TERM'),
    $.env.get('KITTY_WINDOW_ID'),
    $.env.get('TMUX'),
    $.env.get('STY'),
    $.env.get('SSH_CONNECTION'),
    $.env.get('CLAUDE_CODE_FORCE_TERMINAL_IMAGES'),
  ])
  return terminalOf({ program, term, kitty, tmux, screen, ssh, forced })
}

/**
 * The machine and the terminal as this load finds them, each option left on auto settled by what they are. The
 * pictures are this code's drawing, so a load forgets the last one's before anything slower, and draws them afresh.
 */
async function setUp($: EngineInterface, options: Options) {
  await update($, cover, () => null)
  const [isMac, cell, terminal, id, tmp, force5m, ttl, enable1h, settings] = await Promise.all([
    $.fs.exists(OSASCRIPT),
    measure($),
    readTerminal($),
    $.session.id(),
    $.env.get('TMPDIR'),
    $.env.get('FORCE_PROMPT_CACHING_5M'),
    $.env.get('CLAUDE_CODE_PROMPT_CACHE_TTL'),
    $.env.get('ENABLE_PROMPT_CACHING_1H'),
    $.settings.read(),
  ])
  const folder = isMac ? `${tmp}better-statusline-${id}` : null
  const [motion] = await Promise.all([
    isMac && options.motion === 'auto' ? $.process.run(['defaults', 'read', 'com.apple.universalaccess', 'reduceMotion']) : null,
    folder === null ? null : $.process.run(['mkdir', '-p', folder]),
  ])
  const machine: Environment = {
    folder,
    cell,
    drawsPictures: terminal.drawsPictures,
    icons: options.icons === 'auto' ? (terminal.hasIcons ? 'nerd' : 'unicode') : options.icons,
    isMotionReduced: options.motion === 'auto' ? motion?.stdout.trim() === '1' : options.motion === 'reduced',
    cacheSpan: fixedCacheSpan({ force5m, ttl, setting: settings.promptCacheTtl, enable1h }),
  }
  await update($, environment, () => machine)
  return machine
}

async function remeasure($: EngineInterface) {
  const [cell, before, current] = await Promise.all([measure($), read($, environment), read($, player)])
  if (cell === null || JSON.stringify(cell) === JSON.stringify(before!.cell)) return
  await update($, environment, now => ({ ...now!, cell }))
  const source = current === null ? null : artworkOf(current)
  if (source !== null) await prepareCover($, current!, source)
}

/** The viewport last drawn into: a new one (a resize, a zoom, a docked pane, a window only now laid out) may mean a new cell size for the pictures. */
let seen = ''

function watchViewport($: EngineInterface, viewport: { columns: number; rows: number } | undefined) {
  const now = `${viewport?.columns}x${viewport?.rows}`
  if (viewport === undefined || now === seen) return
  if (seen !== '') schedule($, 'measure', () => remeasure($))
  seen = now
}

/**
 * The track's accent and its pictures for both players in that accent's glow, in one pass of cover.js; once for each
 * cover a track is given while it is still the cover playing, and again for a new cell size. A cover that cannot be
 * fetched (the network down, a proxy not yet up) leaves the track coverless and is asked for again after `wait`.
 */
async function prepareCover($: EngineInterface, track: MusicPlayer, source: string, wait = RETRY) {
  const [machine, current] = await Promise.all([read($, environment), read($, player)])
  if (current === null || artworkOf(current) !== source) return
  const { folder } = machine!
  const canvas = canvasOf(machine!)
  const file = `${folder}/cover.src`
  const fetched = await $.process.run(track.app === 'Music' ? ['osascript', ...MUSIC_COVER, file] : ['curl', '-sfL', '--max-time', '10', '-o', file, source])
  if (fetched.exitCode !== 0) {
    $.clock.after(wait, () => schedule($, `cover ${source}`, () => prepareCover($, track, source, 2 * wait)))
    return update($, cover, () => ({ id: track.track.id, source, tint: null, art: null }))
  }
  const drawn = canvas === null ? [] : [JSON.stringify({ folder, mini: { width: 2 * canvas.width, height: canvas.height }, card: coverOf(canvas).paint, mark: SIGNATURE })]
  const { stdout } = await $.process.run(['osascript', '-l', 'JavaScript', `${$.plugin.root}/bridge/cover.js`, file, ...drawn])
  const { tint }: { tint: string | null } = JSON.parse(stdout)
  await update($, cover, () => ({ id: track.track.id, source, tint, art: canvas === null ? null : Date.now() }))
}

async function act(
  $: EngineInterface,
  change: (current: MusicPlayer, now: number) => Partial<MusicPlayer>,
  script: (next: MusicPlayer) => string,
) {
  const current = await read($, player)
  if (current === null) return
  const next = { ...current, ...change(current, Date.now()) }
  await update($, player, () => next)
  await $.process.run(['osascript', '-l', 'JavaScript', '-e', `Application('${next.app}').${script(next)}`])
}

function perform($: EngineInterface, message: Message) {
  switch (message.type) {
    case 'expand':
      return update($, isCompact, () => false)
    case 'toggle':
      return act(
        $,
        (current, now) =>
          current.state === 'playing'
            ? { state: 'paused', position: playhead(current, now), at: now }
            : { state: 'playing', at: now },
        () => 'playpause()',
      )
    case 'next':
      return act($, () => ({}), () => 'nextTrack()')
    case 'previous':
      return act($, () => ({}), () => 'previousTrack()')
    case 'seek':
      return act($, (_, now) => ({ position: Math.round(message.seconds * 10) / 10, at: now }), next => `playerPosition = ${next.position}`)
    case 'volume':
      return act($, () => ({ volume: message.level }), next => `soundVolume = ${next.volume}`)
    case 'shuffle':
      return act(
        $,
        current => ({ shuffle: !current.shuffle }),
        next => `${next.app === 'Spotify' ? 'shuffling' : 'shuffleEnabled'} = ${next.shuffle}`,
      )
    case 'repeat':
      return act(
        $,
        current => ({ repeat: REPEAT[current.app][current.repeat] }),
        next => (next.app === 'Spotify' ? `repeating = ${next.repeat === 'all'}` : `songRepeat = '${next.repeat}'`),
      )
  }
}

async function listen($: EngineInterface) {
  const bridge = $.process.spawn({
    argv: ['osascript', '-l', 'JavaScript', `${$.plugin.root}/bridge/now-playing.js`],
  })
  let partial = ''
  for await (const { text } of bridge) {
    const lines = (partial + text).split('\n')
    partial = lines.pop() ?? ''
    for (const line of lines) {
      const next: MusicPlayer | null = JSON.parse(line)
      await update($, player, () => next)
      const source = next === null ? null : artworkOf(next)
      if (source !== null && (await read($, cover))?.source !== source) schedule($, `cover ${source}`, () => prepareCover($, next!, source))
    }
  }
}

/** A picture in a box of its own size, so the layout holds where the terminal draws only the alt. */
function picture($: EngineInterface, e: ResolveInput, file: string, generation: number, columns: number, rows: number) {
  if (e.surface !== 'terminal') return $.ui.resolve(e).Box({ width: columns, height: rows })
  const { Box, Image } = $.ui.resolve(e)
  return (
    <Box width={columns} height={rows}>
      <Image source={{ file, format: 'png', generation }} columns={columns} rows={rows} alt=" " />
    </Box>
  )
}

/**
 * The music card at the band's left edge: the cover's picture where there is one, then the Client beside it. The
 * picture is text to the terminal, so nothing lies over it: a Client redrawing a row rewrites all of that row's cells.
 * Until the new track's cover is drawn the last one stays up, and before the first its columns wait blank.
 */
function card($: EngineInterface, e: RenderInput<'AbovePrompt', 'terminal'>, view: View, machine: Environment, columns: number, art: number | null) {
  const props: PlayerProps = { ...view, icons: machine.icons, isMotionReduced: machine.isMotionReduced }
  const { Box, Client, Image } = $.ui.resolve(e)
  return (
    <Box height={CARD.rows}>
      {columns > 0 && (
        <Box width={columns} height={CARD.rows} marginRight={CARD.gap}>
          {art !== null && (
            <Image
              source={{ file: `${machine.folder}/${view.state === 'playing' ? 'card' : 'card-dim'}.png`, format: 'png', generation: art }}
              columns={columns}
              rows={CARD.rows}
              alt=" "
            />
          )}
        </Box>
      )}
      <Client key="card" module="../ui/card.tsx" props={props} width={textColumns(view.duration)} height={CARD.rows} />
    </Box>
  )
}

function mini($: EngineInterface, e: RenderInput<'AbovePrompt', 'terminal' | 'desktop'>, view: View, machine: Environment, art: number | null) {
  const props: PlayerProps = { ...view, icons: machine.icons, isMotionReduced: machine.isMotionReduced }
  const { Box, Client } = $.ui.resolve(e)
  return (
    <Box height={1} flexGrow={1}>
      {view.hasCover && art !== null && picture($, e, `${machine.folder}/mini.png`, art, 2, 1)}
      <Client key="mini" module="../ui/mini-player.tsx" props={props} flexGrow={1} />
    </Box>
  )
}

function pills($: EngineInterface, e: RenderInput<'AbovePrompt', 'desktop'>, { usage, tokens }: Status, now: number) {
  if (usage.rateLimits.length === 0 && tokens.received === 0) return null
  const { Svg } = $.ui.resolve(e)
  const drawn = strip(usage.rateLimits, tokens, usage.cost?.usd ?? 0, now)
  return <Svg source={drawn.source} alt={drawn.alt} width={drawn.width} height={drawn.height} />
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    if (!e.isInteractive) return started
    await Promise.all([
      $.command.register({ name: 'fold', description: 'Fold the status line into one row, or open it to five', immediate: true }),
      seed($),
    ])
    void readGit($)
    plan($)
    watchAgents($)
    $.clock.every(60_000, () => void readGit($))
    void setUp($, options as Options).then(machine => (machine.folder === null ? undefined : listen($)))
    return started
  })

  on('session.measure', async ($, e, next) => {
    await revise($, now => ({
      usage: { ...now.usage, context: e.context, rateLimits: e.rateLimits, cost: e.cost },
      history: e.changed.includes('context') ? [...now.history, e.context.percent ?? 0].slice(-TURNS_KEPT) : now.history,
    }))
    if (e.changed.includes('context')) void keep($)
    return next(e)
  })

  /** A session taken up again: the engine says how long ago its last response came, and the prompt cache has run that long. */
  on('classic.SessionStart', async ($, e, next) => {
    const ago = e.seconds_since_last_response
    if (ago !== undefined) await update($, cachedAt, now => now ?? Date.now() - 1000 * ago)
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    const ended = await next(e)
    if (e.reason === 'clear') {
      const usage = await $.session.usage()
      await revise($, () => ({ usage, tokens: ZERO, edits: UNEDITED, history: [], spend: [], spentAt: usage.cost?.usd ?? 0 }))
      await Promise.all([keep($), update($, cachedAt, () => null)])
    } else {
      const machine = await read($, environment)
      if (machine?.folder != null) await $.process.run(['rm', '-rf', machine.folder])
    }
    return ended
  })

  /**
   * A turn's tokens, the subagents' too; a main turn's cost lands as one more turn of spend, and a subagent's run is
   * done. A main turn that used any had a response, and the prompt cache's lifetime runs from it.
   */
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    const isMain = e.agentId === undefined
    if (!isMain) void readGit($)
    const used = e.usage
    if (used === undefined) return done
    const usage = isMain ? await $.session.usage() : null
    await revise($, now => ({
      tokens: { sent: now.tokens.sent + used.input_tokens + used.cache_creation_input_tokens, received: now.tokens.received + used.output_tokens },
      ...(usage === null
        ? {}
        : { usage, spend: [...now.spend, Math.max(0, (usage.cost?.usd ?? 0) - now.spentAt)].slice(-TURNS_KEPT), spentAt: usage.cost?.usd ?? 0 }),
    }))
    if (isMain) {
      void keep($)
      await update($, cachedAt, () => Date.now())
    }
    return done
  })

  /**
   * Between a turn's requests: the figures so far and, on the main loop, the files its tools changed. The main loop's
   * next request follows at once and starts the prompt cache's lifetime over.
   */
  on('classic.PostToolBatch', async ($, e, next) => {
    const usage = await $.session.usage()
    await revise($, () => ({ usage }))
    if (e.agent_id === undefined) {
      if (e.tool_calls.some(call => WRITERS.has(call.tool_name))) void readGit($)
      await update($, cachedAt, () => Date.now())
    }
    return next(e)
  })

  on('classic.Stop', async ($, e, next) => {
    await revise($, () => ({ effort: e.effort?.level ?? null }))
    return next(e)
  })

  on('classic.PostModelSwitch', async ($, e, next) => {
    await revise($, () => ({ model: e.to_model }))
    return next(e)
  })

  on('classic.CwdChanged', async ($, e, next) => {
    await revise($, () => ({ cwd: e.new_cwd }))
    void readGit($)
    return next(e)
  })

  on('classic.SubagentStart', ($, e, next) => {
    watchAgents($)
    return next(e)
  })

  on('tool.call', { tool: ['Edit', 'Write'] }, async ($, e, next) => {
    const called = await next(e)
    if (called.result !== undefined && called.isError !== true) await record($, called.result.structuredPatch)
    return called
  })

  on('command.run', { command: 'fold' }, async $ => {
    await update($, isCompact, compact => !compact)
    return {}
  })

  on('ui.message', async ($, e, next) => {
    await perform($, e.data as Message)
    return next(e)
  })

  /**
   * The band: the music card at the left and the status beside it, five rows tall. It folds into one line when the
   * person asks, when the bottom slot cannot spare five rows, and when the card would leave the status too little room.
   * Everything it draws from is in the state it reads, in one round; it waits for the machine's reading and the
   * session's, so what it first draws is in the terminal's own icons and proportions.
   */
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (e.surface !== 'terminal' && e.surface !== 'desktop')) return next(e)
    const [current, trackLook, machine, folded, figures, cached] = await Promise.all([
      read($, player),
      read($, cover),
      read($, environment),
      read($, isCompact),
      read($, status),
      read($, cachedAt),
    ])
    if (machine === null || figures === null) return next(e)
    if (machine.drawsPictures) watchViewport($, e.viewport)
    const view = current === null ? null : viewOf(current, trackLook)
    const art = trackLook?.art ?? null
    const now = Date.now()
    const { Box, Client } = $.ui.resolve(e)
    if (e.surface === 'desktop') {
      const usage = pills($, e, figures, now)
      if (view === null && usage === null) return next(e)
      return (
        <Box width={e.props.bodyColumns}>
          {view !== null && mini($, e, view, machine, art)}
          {usage !== null && <Box marginLeft={view === null ? 0 : SPACE}>{usage}</Box>}
        </Box>
      )
    }
    const isCoverless = current !== null && trackLook?.id === current.track.id && art === null
    const canvas = canvasOf(machine)
    const columns = canvas === null || isCoverless ? 0 : coverOf(canvas).columns
    const music = view === null ? 0 : cardColumns(columns, view.duration) + SPACE
    const drawn = statusOf(figures, machine, cached, e.props.isWorking, now)
    const isFolded = folded || e.props.maxRows < CARD.rows || e.props.bodyColumns - music < NARROWEST + RESERVE
    if (isFolded) {
      const width = view === null ? 0 : Math.min(MINI, Math.floor(e.props.bodyColumns / 2))
      return (
        <Box width={e.props.bodyColumns} height={1}>
          {view !== null && <Box width={width}>{mini($, e, view, machine, art)}</Box>}
          <Box marginLeft={view === null ? 0 : SPACE}>
            <Client
              key="status"
              module="../ui/status.tsx"
              props={{ ...drawn, isCompact: true }}
              width={e.props.bodyColumns - (view === null ? 0 : width + SPACE)}
              height={1}
            />
          </Box>
        </Box>
      )
    }
    return (
      <Box width={e.props.bodyColumns} height={CARD.rows}>
        {view !== null && card($, e, view, machine, columns, art)}
        <Box marginLeft={view === null ? 0 : SPACE}>
          <Client key="status" module="../ui/status.tsx" props={drawn} width={e.props.bodyColumns - music} height={CARD.rows} />
        </Box>
      </Box>
    )
  })
}
