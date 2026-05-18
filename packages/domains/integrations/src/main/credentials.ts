import electron from 'electron'
import type { Database } from 'better-sqlite3'

type SafeStorageApi = {
  isEncryptionAvailable: () => boolean
  encryptString: (secret: string) => Buffer
  decryptString: (encrypted: Buffer) => string
}

const safeStorage = (electron as unknown as { safeStorage?: SafeStorageApi }).safeStorage
const PLAINTEXT_PREFIX = 'plain:'

function allowPlaintextFallback(): boolean {
  return process.env.SLAYZONE_ALLOW_PLAINTEXT_CREDENTIALS === '1' || process.env.NODE_ENV === 'test'
}

function toSettingKey(ref: string): string {
  return `integration:credential:${ref}`
}

export function storeCredential(db: Database, ref: string, secret: string): void {
  if (!safeStorage) {
    if (!allowPlaintextFallback()) {
      throw new Error('OS secure credential storage is unavailable on this machine')
    }
    // Node-only test runtime fallback (no Electron safeStorage export).
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
      toSettingKey(ref),
      `${PLAINTEXT_PREFIX}${secret}`
    )
    return
  }

  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS secure credential storage is unavailable on this machine')
  }
  const encrypted = safeStorage.encryptString(secret)
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
    toSettingKey(ref),
    encrypted.toString('base64')
  )
}

export function readCredential(db: Database, ref: string): string {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(toSettingKey(ref)) as
    | { value: string }
    | undefined
  if (!row?.value) {
    throw new Error('Credential not found')
  }

  if (row.value.startsWith(PLAINTEXT_PREFIX)) {
    if (!allowPlaintextFallback()) {
      throw new Error('Plaintext credential fallback is disabled')
    }
    return row.value.slice(PLAINTEXT_PREFIX.length)
  }

  if (!safeStorage || !safeStorage.isEncryptionAvailable()) {
    throw new Error('OS secure credential storage is unavailable on this machine')
  }

  const encrypted = Buffer.from(row.value, 'base64')
  return safeStorage.decryptString(encrypted)
}

export function deleteCredential(db: Database, ref: string): void {
  db.prepare('DELETE FROM settings WHERE key = ?').run(toSettingKey(ref))
}
