import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'

const COOKIE_NAME = 'rifa_malu_admin'
const SESSION_TTL = 8 * 60 * 60

function isProduction() {
  return process.env.NODE_ENV === 'production'
}

function adminPassword() {
  return String(process.env.ADMIN_PASSWORD || '')
}

function sessionSecret() {
  return String(process.env.ADMIN_SESSION_SECRET || '')
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8')
  const right = Buffer.from(String(b || ''), 'utf8')

  if (left.length !== right.length) return false

  return timingSafeEqual(left, right)
}

function sign(value) {
  const secret = sessionSecret()

  if (!secret || secret.length < 32) {
    throw new Error(
      'ADMIN_SESSION_SECRET ausente ou muito curto.'
    )
  }

  return createHmac('sha256', secret)
    .update(value)
    .digest('base64url')
}

function readCookie(request, name) {
  const header = String(
    request.headers?.cookie ||
    request.headers?.Cookie ||
    ''
  )

  for (const item of header.split(';')) {
    const [rawKey, ...rawValue] = item.split('=')

    if (rawKey?.trim() !== name) continue

    try {
      return decodeURIComponent(
        rawValue.join('=').trim()
      )
    } catch {
      return ''
    }
  }

  return ''
}

export function verifyAdminPassword(password) {
  const expected = adminPassword()

  if (!expected) {
    return {
      ok: false,
      configError: true,
    }
  }

  return {
    ok: safeEqual(password, expected),
    configError: false,
  }
}

export function createSessionCookie() {
  const expiresAt =
    Math.floor(Date.now() / 1000) +
    SESSION_TTL

  const nonce = randomBytes(24)
    .toString('base64url')

  const unsigned =
    `v1.${expiresAt}.${nonce}`

  const signature = sign(unsigned)

  const token =
    `${unsigned}.${signature}`

  const attributes = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${SESSION_TTL}`,
  ]

  if (isProduction()) {
    attributes.push('Secure')
  }

  return attributes.join('; ')
}

export function clearSessionCookie() {
  const attributes = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ]

  if (isProduction()) {
    attributes.push('Secure')
  }

  return attributes.join('; ')
}

export function verifyAdminRequest(request) {
  const token = readCookie(
    request,
    COOKIE_NAME
  )

  if (!token) {
    return { ok: false }
  }

  const parts = token.split('.')

  if (parts.length !== 4) {
    return { ok: false }
  }

  const [
    version,
    expiresRaw,
    nonce,
    receivedSignature,
  ] = parts

  if (
    version !== 'v1' ||
    !nonce ||
    !receivedSignature
  ) {
    return { ok: false }
  }

  const expiresAt =
    Number(expiresRaw)

  if (
    !Number.isFinite(expiresAt) ||
    expiresAt <
      Math.floor(Date.now() / 1000)
  ) {
    return { ok: false }
  }

  const unsigned =
    `${version}.${expiresRaw}.${nonce}`

  let expected

  try {
    expected = sign(unsigned)
  } catch {
    return {
      ok: false,
      configError: true,
    }
  }

  return {
    ok: safeEqual(
      receivedSignature,
      expected
    ),
  }
}
