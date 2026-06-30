import { createConsola } from 'consola'
import { colors } from 'consola/utils'

/** Title + message for a boxed log entry. */
export interface LogBox {
  title: string
  message: string
}

/**
 * Styleguide logger. Intentionally a small, fixed surface so the underlying
 * logging library (currently consola) stays an implementation detail and can
 * be swapped without touching call sites.
 *
 * The message methods are variadic pass-throughs, so a leading message can be
 * paired with an Error/unknown value — `logger.error('Build failed', err)` —
 * and consola renders the error (and its stack) below the message.
 */
export interface Logger {
  /** Informational message. */
  info: (message: unknown, ...args: unknown[]) => void
  /** Successful operation. */
  success: (message: unknown, ...args: unknown[]) => void
  /** Non-fatal warning. */
  warn: (message: unknown, ...args: unknown[]) => void
  /** Error — a message, an Error/unknown value, or a message followed by one. */
  error: (message: unknown, ...args: unknown[]) => void
  /** Boxed, highlighted message used for grouped summaries. */
  box: (box: LogBox) => void
}

/**
 * Create a {@link Logger} backed by consola. consola is wrapped rather than
 * exposed directly so consumers depend only on the {@link Logger} contract.
 *
 * Every entry leads with a blue `tag` badge — styled like consola's own
 * WARN/ERROR badges — passed as part of the message so it always sits at the
 * start of the line. (consola's built-in `tag` option is right-aligned by the
 * fancy reporter and scrolls off a wide terminal.)
 */
export function createLogger(tag = 'STYLEGUIDE'): Logger {
  const consola = createConsola({
    formatOptions: { date: true },
  })

  const badge = colors.bgBlue(colors.bold(colors.white(` ${tag} `)))

  return {
    info: (message, ...args) => consola.info(badge, message, ...args),
    success: (message, ...args) => consola.success(badge, message, ...args),
    warn: (message, ...args) => consola.warn(badge, message, ...args),
    error: (message, ...args) => consola.error(badge, message, ...args),
    box: ({ title, message }) => consola.box({ title, message }),
  }
}

/** Shared styleguide logger instance. */
export const logger = createLogger()
