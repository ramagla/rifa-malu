import { createClient } from '@libsql/client'

let client = null

function getDatabaseConfig() {
  const configuredUrl = String(
    process.env.TURSO_DATABASE_URL || ''
  ).trim()

  const url =
    configuredUrl ||
    (process.env.NODE_ENV === 'production'
      ? ''
      : 'file:./rifa-local.db')

  const authToken = String(
    process.env.TURSO_AUTH_TOKEN || ''
  ).trim()

  if (!url) {
    throw new Error(
      'Banco não configurado. Defina TURSO_DATABASE_URL.'
    )
  }

  const isLocal =
    url.startsWith('file:') ||
    url === ':memory:'

  if (!isLocal && !authToken) {
    throw new Error(
      'TURSO_AUTH_TOKEN não configurado para banco remoto.'
    )
  }

  return isLocal
    ? { url }
    : { url, authToken }
}

export function getDb() {
  if (!client) {
    client = createClient(getDatabaseConfig())
  }

  return client
}

export function nowIso() {
  return new Date().toISOString()
}

export function cleanText(value, maxLength = 255) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, maxLength)
}

export function normalizePhone(value) {
  let digits = String(value || '')
    .replace(/\D/g, '')

  if (
    digits.startsWith('55') &&
    digits.length > 11
  ) {
    digits = digits.slice(2)
  }

  return digits.slice(0, 11)
}

export function toNumber(value, fallback = 0) {
  const parsed = Number(value)

  return Number.isFinite(parsed)
    ? parsed
    : fallback
}
