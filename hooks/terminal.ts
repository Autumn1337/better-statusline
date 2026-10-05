/** What the session's environment says of its terminal: `TERM_PROGRAM`, `TERM`, and the marks of kitty, tmux, screen and ssh. */
export type TerminalEnv = {
  program: string | undefined
  term: string | undefined
  kitty: string | undefined
  tmux: string | undefined
  screen: string | undefined
  ssh: string | undefined
  /** `CLAUDE_CODE_FORCE_TERMINAL_IMAGES`, under which the engine draws pictures whatever the terminal. */
  forced: string | undefined
}

/** A cell of a common terminal font, for the terminals that report no size: the dot drawings find their circles by its proportions. */
export const CELL = { width: 8, height: 17 }

/**
 * The terminal as its environment tells it, read the way the engine reads it. The engine's Image is kitty's graphics
 * protocol over a file on this machine: kitty and Ghostty draw it, and tmux, screen and ssh stand in its way. kitty,
 * Ghostty and WezTerm carry the Nerd Font icons whatever font is set.
 */
export function terminalOf(env: TerminalEnv) {
  const isKitty = env.kitty !== undefined || env.term === 'xterm-kitty'
  const isGhostty = env.program === 'ghostty' || env.term === 'xterm-ghostty'
  const isRelayed = env.tmux !== undefined || env.screen !== undefined || env.ssh !== undefined
  return {
    drawsPictures: Boolean(env.forced) || ((isKitty || isGhostty) && !isRelayed),
    hasIcons: isKitty || isGhostty || env.program === 'WezTerm',
  }
}
