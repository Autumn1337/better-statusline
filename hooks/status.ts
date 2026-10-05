import type { Edits, Environment, Git, Status, Tokens } from '../types'
import type { Limit, StatusProps } from '../ui/shared'
import { CELL } from './terminal'

export const ZERO: Tokens = { sent: 0, received: 0 }
export const UNEDITED: Edits = { added: 0, removed: 0 }

/** The windows the status draws, by the kind the engine reports them under, each in a hue of Claude Code's rainbow. */
const LIMITS: Record<string, Omit<Limit, 'percent' | 'resetsAt'>> = {
  five_hour: { label: '5-hour', hue: 'rainbow_green', span: 5 * 3_600_000 },
  seven_day: { label: 'weekly', hue: 'rainbow_indigo', span: 7 * 86_400_000 },
}

/** The prompt cache's two lifetimes in milliseconds, by the names the engine and the API know them by. */
const CACHE_SPAN: Record<string, number> = { '5m': 300_000, '1h': 3_600_000 }

/**
 * What fixes the prompt cache's lifetime ahead of the engine's own choice, in the engine's order: the variable that
 * forces five minutes, the variable or the setting that names a lifetime, the variable that asks for an hour.
 */
export function fixedCacheSpan(fixed: { force5m: string | undefined; ttl: string | undefined; setting: unknown; enable1h: string | undefined }) {
  const named = fixed.force5m ? '5m' : (fixed.ttl ?? fixed.setting ?? (fixed.enable1h ? '1h' : null))
  return CACHE_SPAN[String(named)] ?? null
}

/** `claude-opus-5-5` as Claude Code names it, `Opus 5.5`; a name spelled otherwise stays as given. */
function modelName(id: string) {
  const parts = /^claude-([a-z]+)-(\d+)-(\d+)/.exec(id)
  return parts === null ? id : `${parts[1]![0]!.toUpperCase()}${parts[1]!.slice(1)} ${parts[2]}.${parts[3]}`
}

/** A patch's hunks counted: the lines they add and the lines they remove. */
export function counted(hunks: { lines: string[] }[]) {
  const lines = hunks.flatMap(hunk => hunk.lines)
  return { added: lines.filter(text => text.startsWith('+')).length, removed: lines.filter(text => text.startsWith('-')).length }
}

/** `git status --porcelain=v2 --branch` as the status keeps it: the branch, the files staged, and the files changed beside them. */
export function gitOf(porcelain: string): Git {
  const head = /^# branch\.head (.+)$/m.exec(porcelain)?.[1]
  const entries = porcelain
    .split('\n')
    .filter(line => /^[12u] /.test(line))
    .map(line => line.slice(2, 4))
  return {
    branch: head === undefined || head === '(detached)' ? 'detached' : head,
    staged: entries.filter(xy => xy[0] !== '.').length,
    modified: entries.filter(xy => xy[1] !== '.').length,
  }
}

/** Milliseconds from `now` to the next minute on the clock: the smallest step of anything the status shows at rest. */
export const nextMinute = (now: number) => 60_000 - (now % 60_000)

/**
 * The session as the status draws it at `now`, in the terminal's own icons and proportions. Left to the engine, the
 * prompt cache lives an hour on a subscription inside its limits and five minutes anywhere else.
 */
export function statusOf(status: Status, machine: Environment, cachedAt: number | null, isWorking: boolean, now: number): StatusProps {
  const { usage, cwd } = status
  const cell = machine.cell ?? CELL
  const isWithinPlan = usage.rateLimits.some(limit => limit.kind in LIMITS) && usage.rateLimits.every(limit => limit.percentUsed < 100)
  return {
    model: modelName(status.model),
    effort: status.effort,
    place: cwd.slice(cwd.lastIndexOf('/') + 1),
    git: status.git,
    agents: status.agents,
    edits: status.edits,
    context: {
      percent: usage.context.percent ?? 0,
      tokens: usage.context.tokens ?? null,
      window: usage.context.window,
      history: status.history,
    },
    limits: usage.rateLimits.flatMap(limit => {
      const known = LIMITS[limit.kind]
      return known === undefined
        ? []
        : [{ ...known, percent: limit.percentUsed, resetsAt: limit.resetsAt === undefined ? null : Date.parse(limit.resetsAt) }]
    }),
    cache: { at: cachedAt, span: machine.cacheSpan ?? CACHE_SPAN[isWithinPlan ? '1h' : '5m']! },
    cost: usage.cost?.usd ?? null,
    spend: status.spend,
    tokens: status.tokens,
    minute: Math.floor(now / 60_000),
    icons: machine.icons,
    aspect: cell.height / cell.width,
    isWorking,
    isMotionReduced: machine.isMotionReduced,
    isCompact: false,
  }
}
