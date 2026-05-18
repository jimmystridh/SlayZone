import type { AgentAdapter } from './types'
import { claudeCodeAdapter } from './claude-code-adapter'
import { CHAT_SUPPORTED_MODES, type ChatSupportedMode } from '../../shared/types'

/**
 * TerminalMode → AgentAdapter mapping. Keys must match
 * `CHAT_SUPPORTED_MODES` exactly — TS enforces it.
 * `'claude-code'` is intentionally absent: PTY-only mode after the split;
 * chat lives in `'claude-chat'` which reuses the same adapter object.
 */
const REGISTRY: Record<ChatSupportedMode, AgentAdapter> = {
  'claude-chat': claudeCodeAdapter
}

// Defense-in-depth: catch drift between CHAT_SUPPORTED_MODES and REGISTRY at boot.
for (const mode of CHAT_SUPPORTED_MODES) {
  if (!REGISTRY[mode]) throw new Error(`Missing adapter for chat-capable mode '${mode}'`)
}

export function getAdapter(mode: string): AgentAdapter | null {
  return (REGISTRY as Record<string, AgentAdapter>)[mode] ?? null
}

export function supportsChatMode(mode: string): boolean {
  return mode in REGISTRY
}
