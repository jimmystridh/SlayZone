import { mkdirSync } from 'node:fs'
import { getStateDir } from './dirs'

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1'])
let warnedHost: string | null = null

/**
 * Root for all SlayZone state (DB, artifacts, project-icons, backups,
 * Electron internal data). Honors SLAYZONE_STORE_DIR override; otherwise
 * falls back to the platform default from getStateDir().
 *
 * mkdir's the dir before returning so better-sqlite3 + Electron both find it.
 * The `ensure` prefix flags this side-effect — pure read is `getStateDir()`.
 */
export function ensureDataRoot(): string {
  const dir = process.env.SLAYZONE_STORE_DIR || getStateDir()
  mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Returns the local server port from SLAYZONE_SERVER_PORT, or undefined if
 * unset/invalid. The local server hosts MCP, REST API, and (slice 2+) tRPC
 * on a single port. Callers should fall back to a stored or auto-assigned
 * port when undefined.
 */
export function getServerPort(): number | undefined {
  const raw = process.env.SLAYZONE_SERVER_PORT
  if (!raw) return undefined
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 0 || n > 65535) return undefined
  return n
}

/**
 * Returns the host the local server should bind to. Defaults to 127.0.0.1.
 * Warns once on stderr when bound to a non-loopback address.
 */
export function getServerHost(): string {
  const host = process.env.SLAYZONE_HOST || '127.0.0.1'
  if (!LOOPBACK_HOSTS.has(host) && warnedHost !== host) {
    warnedHost = host
    console.warn(
      `[slayzone] SLAYZONE_HOST=${host} binds the local server to a non-loopback address. ` +
        `Anyone on the network can reach it. Use 127.0.0.1 unless you have a reason.`,
    )
  }
  return host
}
