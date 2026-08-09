import {
  randomUUID,
} from 'node:crypto'


const API_URL =
  'https://api.mercadopago.com'


function normalizeProfile(value) {
  return String(
    value || 'principal'
  )
    .trim()
    .toUpperCase()
    .replace(
      /[^A-Z0-9_]/g,
      '_'
    )
}


function credentialVariable(
  environment,
  profile
) {
  const env =
    String(
      environment || 'TEST'
    ).toUpperCase()

  const normalizedProfile =
    normalizeProfile(profile)

  if (
    normalizedProfile ===
    'PRINCIPAL'
  ) {
    return env === 'PRODUCTION'
      ? 'MERCADO_PAGO_PROD_ACCESS_TOKEN'
      : 'MERCADO_PAGO_TEST_ACCESS_TOKEN'
  }

  return env === 'PRODUCTION'
    ? `MERCADO_PAGO_${normalizedProfile}_PROD_ACCESS_TOKEN`
    : `MERCADO_PAGO_${normalizedProfile}_TEST_ACCESS_TOKEN`
}


export function getMercadoPagoAccessToken({
  environment,
  credentialProfile,
}) {
  const variable =
    credentialVariable(
      environment,
      credentialProfile
    )

  const token =
    String(
      process.env[variable] || ''
    ).trim()

  if (!token) {
    throw new Error(
      `Credencial Mercado Pago não configurada: ${variable}`
    )
  }

  return {
    token,
    variable,
  }
}


export function newMercadoPagoIdempotencyKey() {
  return randomUUID()
}


export function mercadoPagoExpirationDuration(
  minutes
) {
  let remaining =
    Math.max(
      30,
      Number.parseInt(
        minutes,
        10
      ) || 1440
    )

  const days =
    Math.floor(
      remaining / 1440
    )

  remaining -=
    days * 1440

  const hours =
    Math.floor(
      remaining / 60
    )

  const mins =
    remaining -
    hours * 60

  let value = 'P'

  if (days) {
    value += `${days}D`
  }

  if (
    hours ||
    mins ||
    !days
  ) {
    value += 'T'

    if (hours) {
      value += `${hours}H`
    }

    if (mins) {
      value += `${mins}M`
    }

    if (
      !hours &&
      !mins
    ) {
      value += '0M'
    }
  }

  return value
}


async function mercadoPagoRequest(
  path,
  {
    method = 'GET',
    body,
    accessToken,
    idempotencyKey,
  } = {}
) {
  const response =
    await fetch(
      `${API_URL}${path}`,
      {
        method,

        headers: {
          Accept:
            'application/json',

          Authorization:
            `Bearer ${accessToken}`,

          ...(body
            ? {
                'Content-Type':
                  'application/json',
              }
            : {}),

          ...(idempotencyKey
            ? {
                'X-Idempotency-Key':
                  idempotencyKey,
              }
            : {}),
        },

        ...(body
          ? {
              body:
                JSON.stringify(body),
            }
          : {}),
      }
    )

  const data =
    await response
      .json()
      .catch(() => ({}))

  if (!response.ok) {
    const error =
      new Error(
        data?.message ||
        data?.error ||
        `Mercado Pago HTTP ${response.status}`
      )

    error.status =
      response.status

    error.providerData =
      data

    error.retryAfter =
      response.headers.get(
        'retry-after'
      )

    throw error
  }

  return data
}


export async function createMercadoPagoPixOrder({
  environment = 'TEST',
  credentialProfile = 'principal',

  amount,
  email,
  externalReference,
  expirationMinutes = 1440,
  idempotencyKey,
}) {
  const {
    token,
  } =
    getMercadoPagoAccessToken({
      environment,
      credentialProfile,
    })

  const normalizedAmount =
    Number(amount)

  if (
    !Number.isFinite(
      normalizedAmount
    ) ||
    normalizedAmount <= 0
  ) {
    throw new Error(
      'Valor da cobrança Mercado Pago inválido.'
    )
  }

  const normalizedEmail =
    String(email || '')
      .trim()
      .toLowerCase()

  if (
    !normalizedEmail.includes('@')
  ) {
    throw new Error(
      'E-mail do pagador inválido.'
    )
  }

  const data =
    await mercadoPagoRequest(
      '/v1/orders',
      {
        method: 'POST',

        accessToken:
          token,

        idempotencyKey,

        body: {
          type: 'online',

          total_amount:
            normalizedAmount
              .toFixed(2),

          external_reference:
            String(
              externalReference
            ),

          processing_mode:
            'automatic',

          transactions: {
            payments: [
              {
                amount:
                  normalizedAmount
                    .toFixed(2),

                payment_method: {
                  id: 'pix',
                  type:
                    'bank_transfer',
                },

                expiration_time:
                  mercadoPagoExpirationDuration(
                    expirationMinutes
                  ),
              },
            ],
          },

          payer: {
            email:
              normalizedEmail,
          },
        },
      }
    )

  const payment =
    data?.transactions
      ?.payments?.[0] ||
    null

  return {
    orderId:
      String(
        data?.id || ''
      ),

    orderStatus:
      String(
        data?.status || ''
      ),

    orderStatusDetail:
      String(
        data?.status_detail ||
        ''
      ),

    paymentId:
      String(
        payment?.id || ''
      ),

    paymentStatus:
      String(
        payment?.status || ''
      ),

    paymentStatusDetail:
      String(
        payment?.status_detail ||
        ''
      ),

    ticketUrl:
      String(
        payment
          ?.payment_method
          ?.ticket_url ||
        ''
      ),

    pixCopyPaste:
      String(
        payment
          ?.payment_method
          ?.qr_code ||
        ''
      ),

    qrCodeBase64:
      String(
        payment
          ?.payment_method
          ?.qr_code_base64 ||
        ''
      ),

    externalReference:
      String(
        data
          ?.external_reference ||
        externalReference
      ),

    raw:
      data,
  }
}


export async function getMercadoPagoOrder({
  orderId,
  environment = 'TEST',
  credentialProfile = 'principal',
}) {
  const {
    token,
  } =
    getMercadoPagoAccessToken({
      environment,
      credentialProfile,
    })

  return mercadoPagoRequest(
    `/v1/orders/${encodeURIComponent(
      orderId
    )}`,
    {
      accessToken:
        token,
    }
  )
}
