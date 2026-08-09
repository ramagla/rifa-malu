import {
  cleanText,
  nowIso,
} from './_db.js'


function parseBoolean(
  value,
  fallback = false
) {
  if (typeof value === 'boolean') {
    return value
  }

  if (
    value === 1 ||
    value === '1'
  ) {
    return true
  }

  if (
    value === 0 ||
    value === '0'
  ) {
    return false
  }

  return fallback
}


export async function getEventPaymentSettings(
  db,
  event
) {
  const timestamp = nowIso()

  await db.execute({
    sql: `
      INSERT OR IGNORE INTO event_payment_settings (
        event_id,
        pix_provider,
        mercado_pago_enabled,
        mercado_pago_environment,
        credential_profile,
        fee_type,
        fee_value,
        fee_payer,
        show_fee,
        auto_confirm,
        manual_fallback,
        pix_expiration_minutes,
        created_at,
        updated_at
      )
      VALUES (
        ?,
        'MANUAL',
        0,
        'TEST',
        'principal',
        'PERCENTAGE',
        0.99,
        'ORGANIZER',
        1,
        1,
        1,
        ?,
        ?,
        ?
      )
    `,
    args: [
      Number(event.id),
      Number(
        event.reservation_ttl_minutes ||
        1440
      ),
      timestamp,
      timestamp,
    ],
  })

  const result =
    await db.execute({
      sql: `
        SELECT *
        FROM event_payment_settings
        WHERE event_id = ?
        LIMIT 1
      `,
      args: [
        Number(event.id),
      ],
    })

  return result.rows[0] || null
}


export function serializePaymentSettings(
  row,
  {
    includeAdmin = false,
  } = {}
) {
  const payment = {
    pixProvider:
      String(
        row?.pix_provider ||
        'MANUAL'
      ),

    mercadoPagoEnabled:
      Boolean(
        row?.mercado_pago_enabled
      ),

    feeType:
      String(
        row?.fee_type ||
        'PERCENTAGE'
      ),

    feeValue:
      Number(
        row?.fee_value ?? 0.99
      ),

    feePayer:
      String(
        row?.fee_payer ||
        'ORGANIZER'
      ),

    showFee:
      Boolean(
        row?.show_fee
      ),

    autoConfirm:
      Boolean(
        row?.auto_confirm
      ),

    manualFallback:
      Boolean(
        row?.manual_fallback
      ),

    pixExpirationMinutes:
      Number(
        row?.pix_expiration_minutes ||
        1440
      ),
  }

  if (includeAdmin) {
    payment.environment =
      String(
        row?.mercado_pago_environment ||
        'TEST'
      )

    payment.credentialProfile =
      String(
        row?.credential_profile ||
        'principal'
      )
  }

  return payment
}


export function normalizePaymentSettings(
  settings,
  {
    allowPix,
  }
) {
  const mercadoPagoEnabled =
    parseBoolean(
      settings.mercadoPagoEnabled,
      false
    )

  const environment =
    cleanText(
      settings.mercadoPagoEnvironment,
      20
    ).toUpperCase() ||
    'TEST'

  const credentialProfile =
    cleanText(
      settings.credentialProfile,
      50
    ).toLowerCase() ||
    'principal'

  const feeType =
    cleanText(
      settings.feeType,
      20
    ).toUpperCase() ||
    'PERCENTAGE'

  const feeValue =
    Number(settings.feeValue)

  const feePayer =
    cleanText(
      settings.feePayer,
      20
    ).toUpperCase() ||
    'ORGANIZER'

  const showFee =
    parseBoolean(
      settings.showFee,
      true
    )

  const autoConfirm =
    parseBoolean(
      settings.autoConfirm,
      true
    )

  const manualFallback =
    parseBoolean(
      settings.manualFallback,
      true
    )

  const pixExpirationMinutes =
    Number.parseInt(
      settings.pixExpirationMinutes,
      10
    )

  if (
    ![
      'TEST',
      'PRODUCTION',
    ].includes(environment)
  ) {
    return {
      ok: false,
      status: 400,
      error:
        'Ambiente do Mercado Pago inválido.',
    }
  }

  if (
    !/^[a-z0-9_-]{1,50}$/
      .test(credentialProfile)
  ) {
    return {
      ok: false,
      status: 400,
      error:
        'Perfil de credencial inválido.',
    }
  }

  if (
    ![
      'PERCENTAGE',
      'FIXED',
    ].includes(feeType)
  ) {
    return {
      ok: false,
      status: 400,
      error:
        'Tipo de taxa inválido.',
    }
  }

  if (
    !Number.isFinite(feeValue) ||
    feeValue < 0 ||
    (
      feeType === 'PERCENTAGE' &&
      feeValue > 100
    ) ||
    (
      feeType === 'FIXED' &&
      feeValue > 100000
    )
  ) {
    return {
      ok: false,
      status: 400,
      error:
        'Valor da taxa inválido.',
    }
  }

  if (
    ![
      'ORGANIZER',
      'PARTICIPANT',
    ].includes(feePayer)
  ) {
    return {
      ok: false,
      status: 400,
      error:
        'Responsável pela taxa inválido.',
    }
  }

  if (
    !Number.isInteger(
      pixExpirationMinutes
    ) ||
    pixExpirationMinutes < 30 ||
    pixExpirationMinutes > 43200
  ) {
    return {
      ok: false,
      status: 400,
      error:
        'Validade do Pix deve ficar entre 30 minutos e 30 dias.',
    }
  }

  if (
    mercadoPagoEnabled &&
    !allowPix
  ) {
    return {
      ok: false,
      status: 400,
      error:
        'Ative Pix antes de habilitar o Mercado Pago.',
    }
  }

  return {
    ok: true,
    status: 200,

    value: {
      pixProvider:
        mercadoPagoEnabled
          ? 'MERCADO_PAGO'
          : 'MANUAL',

      mercadoPagoEnabled,
      environment,
      credentialProfile,
      feeType,
      feeValue,
      feePayer,
      showFee,
      autoConfirm,
      manualFallback,
      pixExpirationMinutes,
    },
  }
}


export async function saveEventPaymentSettings(
  db,
  eventId,
  settings
) {
  const timestamp = nowIso()

  await db.execute({
    sql: `
      INSERT INTO event_payment_settings (
        event_id,
        pix_provider,
        mercado_pago_enabled,
        mercado_pago_environment,
        credential_profile,
        fee_type,
        fee_value,
        fee_payer,
        show_fee,
        auto_confirm,
        manual_fallback,
        pix_expiration_minutes,
        created_at,
        updated_at
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
      ON CONFLICT(event_id)
      DO UPDATE SET
        pix_provider = excluded.pix_provider,
        mercado_pago_enabled =
          excluded.mercado_pago_enabled,
        mercado_pago_environment =
          excluded.mercado_pago_environment,
        credential_profile =
          excluded.credential_profile,
        fee_type = excluded.fee_type,
        fee_value = excluded.fee_value,
        fee_payer = excluded.fee_payer,
        show_fee = excluded.show_fee,
        auto_confirm = excluded.auto_confirm,
        manual_fallback =
          excluded.manual_fallback,
        pix_expiration_minutes =
          excluded.pix_expiration_minutes,
        updated_at = excluded.updated_at
    `,
    args: [
      Number(eventId),
      settings.pixProvider,
      settings.mercadoPagoEnabled
        ? 1
        : 0,
      settings.environment,
      settings.credentialProfile,
      settings.feeType,
      settings.feeValue,
      settings.feePayer,
      settings.showFee
        ? 1
        : 0,
      settings.autoConfirm
        ? 1
        : 0,
      settings.manualFallback
        ? 1
        : 0,
      settings.pixExpirationMinutes,
      timestamp,
      timestamp,
    ],
  })
}
