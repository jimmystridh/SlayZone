import type { Database } from 'better-sqlite3'
import type { OpDeps } from './shared.js'

interface StoredTab {
  id: string
  locked?: boolean
  [k: string]: unknown
}
interface StoredState {
  tabs?: StoredTab[]
  activeTabId?: string | null
}

/**
 * Dedicated write path for `browser_tabs[].locked`. Generic updateTask strips
 * incoming `locked` to prevent stale renderer writebacks from clobbering it —
 * this op is the only place renderers/server are allowed to mutate the flag.
 */
export function setBrowserTabLockedOp(
  db: Database,
  taskId: string,
  tabId: string,
  locked: boolean,
  deps: OpDeps
): boolean {
  const row = db.prepare('SELECT browser_tabs FROM tasks WHERE id = ?').get(taskId) as
    | { browser_tabs: string | null }
    | undefined
  if (!row?.browser_tabs) return false

  let state: StoredState
  try {
    state = JSON.parse(row.browser_tabs) as StoredState
  } catch {
    return false
  }
  const tabs = state.tabs
  if (!Array.isArray(tabs)) return false

  const tab = tabs.find((t) => t?.id === tabId)
  if (!tab) return false
  if (!!tab.locked === locked) return true

  tab.locked = locked
  db.prepare('UPDATE tasks SET browser_tabs = ? WHERE id = ?').run(JSON.stringify(state), taskId)
  deps.onMutation?.()
  return true
}
