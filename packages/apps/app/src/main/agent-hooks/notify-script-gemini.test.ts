import fs from 'fs'
import path from 'path'
import os from 'os'
import { spawnSync } from 'child_process'
import { describe, test, expect } from 'vitest'
import { installNotifyScript } from './notify-script-installer'

/**
 * Integration test: notify.sh under Gemini event names.
 * Verifies the universal stdout `{}\n` contract (required for Gemini, which
 * blocks waiting for a hook response) and that POST envelopes carry the
 * Gemini event name through unchanged.
 */
function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'slayzone-notify-gemini-'))
}

function cleanup(...dirs: string[]) {
  for (const d of dirs) {
    try { fs.rmSync(d, { recursive: true, force: true }) } catch {}
  }
}

function writeCurlStub(binDir: string, capturePath: string) {
  const stub = `#!/bin/bash\nwhile [ $# -gt 0 ]; do\n  case "$1" in\n    --data-binary) shift; printf '%s' "$1" > "${capturePath}";;\n  esac\n  shift\ndone\nexit 0\n`
  fs.writeFileSync(path.join(binDir, 'curl'), stub, { mode: 0o755 })
}

const GEMINI_EVENTS = ['SessionStart', 'SessionEnd', 'BeforeAgent', 'AfterAgent', 'AfterTool'] as const

describe('notify.sh under Gemini', () => {
  test('emits exactly "{}\\n" on stdout (Gemini hook contract)', async () => {
    if (process.platform === 'win32') return
    const dir = tmpDir()
    try {
      const target = path.join(dir, 'notify.sh')
      await installNotifyScript({ targetPath: target })

      const binDir = path.join(dir, 'bin')
      fs.mkdirSync(binDir)
      writeCurlStub(binDir, path.join(dir, 'capture.json'))

      const stdin = '{"hook_event_name":"BeforeAgent","session_id":"abc"}'
      const res = spawnSync('bash', [target], {
        input: stdin,
        env: {
          PATH: `${binDir}:${process.env.PATH ?? ''}`,
          SLAYZONE_AGENT_HOOK_URL: 'http://127.0.0.1:1/api/agent-hook',
          SLAYZONE_AGENT_ID: 'gemini',
        },
      })
      expect(res.status).toBe(0)
      expect(res.stdout.toString()).toBe('{}\n')
    } finally {
      cleanup(dir)
    }
  })

  test('still emits "{}\\n" even when curl fails (POST unreachable)', async () => {
    if (process.platform === 'win32') return
    const dir = tmpDir()
    try {
      const target = path.join(dir, 'notify.sh')
      await installNotifyScript({ targetPath: target })

      // Stub curl with one that always exits 1 — simulates POST failure
      // without removing bash from PATH (spawnSync needs bash).
      const binDir = path.join(dir, 'bin')
      fs.mkdirSync(binDir)
      fs.writeFileSync(path.join(binDir, 'curl'), '#!/bin/bash\nexit 1\n', { mode: 0o755 })

      const stdin = '{"hook_event_name":"BeforeAgent"}'
      const res = spawnSync('bash', [target], {
        input: stdin,
        env: {
          PATH: `${binDir}:${process.env.PATH ?? ''}`,
          SLAYZONE_AGENT_HOOK_URL: 'http://127.0.0.1:1/api/agent-hook',
          SLAYZONE_AGENT_ID: 'gemini',
        },
      })
      expect(res.status).toBe(0)
      expect(res.stdout.toString()).toBe('{}\n')
    } finally {
      cleanup(dir)
    }
  })

  test.each(GEMINI_EVENTS)('POSTs envelope w/ hookEvent="%s"', async (eventName) => {
    if (process.platform === 'win32') return
    const dir = tmpDir()
    try {
      const target = path.join(dir, 'notify.sh')
      await installNotifyScript({ targetPath: target })

      const binDir = path.join(dir, 'bin')
      fs.mkdirSync(binDir)
      const capture = path.join(dir, 'capture.json')
      writeCurlStub(binDir, capture)

      const stdin = `{"hook_event_name":"${eventName}","session_id":"sess-1"}`
      const res = spawnSync('bash', [target], {
        input: stdin,
        env: {
          PATH: `${binDir}:${process.env.PATH ?? ''}`,
          SLAYZONE_AGENT_HOOK_URL: 'http://127.0.0.1:1/api/agent-hook',
          SLAYZONE_AGENT_ID: 'gemini',
          SLAYZONE_TASK_ID: 'task-1',
        },
      })
      expect(res.status).toBe(0)
      const env = JSON.parse(fs.readFileSync(capture, 'utf8'))
      expect(env.agentId).toBe('gemini')
      expect(env.hookEvent).toBe(eventName)
      expect(env.taskId).toBe('task-1')
    } finally {
      cleanup(dir)
    }
  })
})
