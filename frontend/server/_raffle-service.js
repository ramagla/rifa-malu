import {
  cleanText,
  getDb,
  normalizePhone,
  nowIso,
} from './_db.js'

import {
  ensureDefaultEvent,
  ensureSchema,
} from './_schema.js'

import {
  getEventPaymentSettings,
  serializePaymentSettings,
} from './_payment-settings.js'

import {
  createMercadoPagoPixOrder,
  getMercadoPagoOrder,
  newMercadoPagoIdempotencyKey,
} from './_mercado-pago.js'

const EVENT_SLUG = 'cha-da-malu'

function addMinutes(date, minutes) {
  return new Date(
    date.getTime() +
    Number(minutes) * 60000
  ).toISOString()
}


function roundMoney(value) {
  return Math.round(
    (
      Number(value || 0) +
      Number.EPSILON
    ) * 100
  ) / 100
}


function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    .test(
      String(value || '').trim()
    )
}

async function eventBySlug(
  db,
  slug = EVENT_SLUG
) {
  const result = await db.execute({
    sql: `
      SELECT *
      FROM events
      WHERE slug = ?
        AND active = 1
      LIMIT 1
    `,
    args: [slug],
  })

  return result.rows[0] || null
}

async function audit(
  db,
  {
    eventId,
    actor,
    action,
    objectType = null,
    objectId = null,
    details = {},
  }
) {
  await db.execute({
    sql: `
      INSERT INTO audit_logs (
        event_id,
        actor,
        action,
        object_type,
        object_id,
        details,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      eventId,
      actor,
      action,
      objectType,
      objectId == null
        ? null
        : String(objectId),
      JSON.stringify(details),
      nowIso(),
    ],
  })
}

async function expireReservations(
  db,
  eventId
) {
  const now = nowIso()

  const expired =
    await db.execute({
      sql: `
        SELECT id
        FROM raffle_numbers
        WHERE event_id = ?
          AND status = 'AWAITING_PAYMENT'
          AND expires_at IS NOT NULL
          AND expires_at <= ?
      `,
      args: [
        eventId,
        now,
      ],
    })

  if (!expired.rows.length) {
    return 0
  }

  const ids = expired.rows
    .map(row => Number(row.id))

  for (const numberId of ids) {
    await db.execute({
      sql: `
        UPDATE payments
        SET
          status = 'CANCELLED',
          updated_at = ?
        WHERE participation_id IN (
          SELECT id
          FROM participations
          WHERE raffle_number_id = ?
            AND status = 'PENDING'
        )
          AND status = 'PENDING'
      `,
      args: [
        now,
        numberId,
      ],
    })

    await db.execute({
      sql: `
        UPDATE participations
        SET
          status = 'CANCELLED',
          updated_at = ?
        WHERE raffle_number_id = ?
          AND status = 'PENDING'
      `,
      args: [
        now,
        numberId,
      ],
    })

    await db.execute({
      sql: `
        UPDATE raffle_numbers
        SET
          status = 'AVAILABLE',
          reserved_at = NULL,
          expires_at = NULL,
          updated_at = ?
        WHERE id = ?
          AND status = 'AWAITING_PAYMENT'
      `,
      args: [
        now,
        numberId,
      ],
    })
  }

  await audit(db, {
    eventId,
    actor: 'system',
    action: 'RESERVATIONS_EXPIRED',
    objectType: 'raffle_number',
    details: {
      count: ids.length,
      ids,
    },
  })

  return ids.length
}


export async function getOrganizerName(
  slug = EVENT_SLUG
) {
  await ensureDefaultEvent()

  const db = getDb()
  const event =
    await eventBySlug(db, slug)

  return String(
    event?.organizer_name ||
    'Organizador'
  )
}


export async function getPublicEvent(
  slug = EVENT_SLUG
) {
  await ensureDefaultEvent()

  const db = getDb()

  const event =
    await eventBySlug(db, slug)

  if (!event) return null

  const tx =
    await db.transaction('write')

  try {
    await expireReservations(
      tx,
      Number(event.id)
    )

    await tx.commit()
  } catch (error) {
    await tx.rollback().catch(() => null)
    throw error
  }

  const paymentSettings =
    await getEventPaymentSettings(
      db,
      event
    )

  const numbers =
    await db.execute({
      sql: `
        SELECT
          number,
          status
        FROM raffle_numbers
        WHERE event_id = ?
        ORDER BY number
      `,
      args: [
        event.id,
      ],
    })

  return {
    event: {
      id: Number(event.id),
      organizerName:
        String(
          event.organizer_name ||
          'Organizador'
        ),
      name: String(event.name),
      slug: String(event.slug),
      babyName:
        String(event.baby_name || ''),
      message:
        String(event.message || ''),
      prize:
        String(event.prize || ''),
      drawDate:
        String(event.draw_date || ''),
      drawTime:
        String(event.draw_time || ''),
      numberCount:
        Number(event.number_count),
      numberPrice:
        Number(event.number_price),
      pixKey:
        String(event.pix_key || ''),
      pixRecipientName:
        String(
          event.pix_recipient_name || ''
        ),
      pixCity:
        String(event.pix_city || ''),
      whatsapp:
        String(event.whatsapp || ''),
      deliveryAddress:
        String(
          event.delivery_address || ''
        ),
      allowPix:
        Boolean(event.allow_pix),
      allowDiaper:
        Boolean(event.allow_diaper),

      reservationTtlMinutes:
        Number(
          event.reservation_ttl_minutes ||
          1440
        ),
    },

    payment:
      serializePaymentSettings(
        paymentSettings
      ),

    numbers: numbers.rows.map(row => ({
      number: Number(row.number),
      status: String(row.status),
    })),
  }
}

export async function reserveNumber({
  slug = EVENT_SLUG,
  number,
  name,
  phone,
  email = '',
  method,
  diaperSize = '',
  diaperBrand = '',
  diaperPacks = 0,
}) {
  await ensureDefaultEvent()

  const normalizedName =
    cleanText(name, 120)

  const normalizedPhone =
    normalizePhone(phone)

  const normalizedEmail =
    cleanText(
      email,
      160
    ).toLowerCase()

  const selectedNumber =
    Number.parseInt(
      number,
      10
    )

  const selectedMethod =
    String(
      method || ''
    ).trim()

  const packs =
    Number.parseInt(
      diaperPacks,
      10
    ) || 0

  if (
    normalizedName.length < 2
  ) {
    return {
      ok: false,
      status: 400,
      error: 'Informe seu nome.',
    }
  }

  if (
    normalizedPhone.length < 10 ||
    normalizedPhone.length > 11
  ) {
    return {
      ok: false,
      status: 400,
      error:
        'Informe um WhatsApp válido.',
    }
  }

  if (
    !Number.isInteger(
      selectedNumber
    ) ||
    selectedNumber < 1
  ) {
    return {
      ok: false,
      status: 400,
      error: 'Número inválido.',
    }
  }

  if (
    ![
      'pix',
      'diaper',
      'both',
    ].includes(selectedMethod)
  ) {
    return {
      ok: false,
      status: 400,
      error: 'Modalidade inválida.',
    }
  }

  if (
    selectedMethod !== 'pix' &&
    (
      packs < 1 ||
      packs > 20
    )
  ) {
    return {
      ok: false,
      status: 400,
      error:
        'Quantidade de fraldas inválida.',
    }
  }

  const db = getDb()

  const tx =
    await db.transaction(
      'write'
    )

  let transactionCommitted =
    false

  let context = null

  try {
    const event =
      await eventBySlug(
        tx,
        slug
      )

    if (!event) {
      await tx.rollback()

      return {
        ok: false,
        status: 404,
        error:
          'Rifa não encontrada.',
      }
    }

    await expireReservations(
      tx,
      Number(event.id)
    )

    const existingDraw =
      await tx.execute({
        sql: `
          SELECT id
          FROM draws
          WHERE event_id = ?
          LIMIT 1
        `,
        args: [
          event.id,
        ],
      })

    if (
      existingDraw.rows.length
    ) {
      await tx.rollback()

      return {
        ok: false,
        status: 409,
        error:
          'O sorteio já foi realizado e esta rifa está encerrada.',
      }
    }

    if (
      selectedNumber >
      Number(
        event.number_count
      )
    ) {
      await tx.rollback()

      return {
        ok: false,
        status: 400,
        error:
          'Número fora da faixa da rifa.',
      }
    }

    if (
      selectedMethod ===
        'pix' &&
      !event.allow_pix
    ) {
      await tx.rollback()

      return {
        ok: false,
        status: 400,
        error:
          'Participação via Pix desativada.',
      }
    }

    if (
      selectedMethod ===
        'diaper' &&
      !event.allow_diaper
    ) {
      await tx.rollback()

      return {
        ok: false,
        status: 400,
        error:
          'Participação com fraldas desativada.',
      }
    }

    if (
      selectedMethod ===
        'both' &&
      (
        !event.allow_pix ||
        !event.allow_diaper
      )
    ) {
      await tx.rollback()

      return {
        ok: false,
        status: 400,
        error:
          'Modalidade combinada indisponível.',
      }
    }

    const requiresPayment =
      selectedMethod ===
        'pix' ||
      selectedMethod ===
        'both'

    const paymentSettings =
      requiresPayment
        ? await getEventPaymentSettings(
            tx,
            event
          )
        : null

    const useMercadoPago =
      requiresPayment &&
      Boolean(
        paymentSettings
          ?.mercado_pago_enabled
      ) &&
      String(
        paymentSettings
          ?.pix_provider ||
        ''
      ) === 'MERCADO_PAGO'

    if (
      useMercadoPago &&
      !validEmail(
        normalizedEmail
      )
    ) {
      await tx.rollback()

      return {
        ok: false,
        status: 400,
        error:
          'Informe um e-mail válido para gerar o Pix do Mercado Pago.',
      }
    }

    const timestamp =
      nowIso()

    const baseAmount =
      requiresPayment
        ? roundMoney(
            event.number_price
          )
        : 0

    const feeType =
      String(
        paymentSettings
          ?.fee_type ||
        'PERCENTAGE'
      )

    const feeValue =
      Number(
        paymentSettings
          ?.fee_value ||
        0
      )

    const feePayer =
      String(
        paymentSettings
          ?.fee_payer ||
        'ORGANIZER'
      )

    const feeAmount =
      useMercadoPago
        ? roundMoney(
            feeType === 'FIXED'
              ? feeValue
              : baseAmount *
                (
                  feeValue /
                  100
                )
          )
        : 0

    const chargedAmount =
      useMercadoPago &&
      feePayer ===
        'PARTICIPANT'
        ? roundMoney(
            baseAmount +
            feeAmount
          )
        : baseAmount

    const providerEnvironment =
      useMercadoPago
        ? String(
            paymentSettings
              ?.mercado_pago_environment ||
            'TEST'
          ).toUpperCase()
        : null

    const credentialProfile =
      useMercadoPago
        ? String(
            paymentSettings
              ?.credential_profile ||
            'principal'
          )
        : null

    /*
     * O sandbox Pix da API Orders usa
     * R$ 50,00 no cenário oficial APRO.
     * Em produção usamos o valor real.
     */
    const providerAmount =
      useMercadoPago &&
      providerEnvironment ===
        'TEST'
        ? 50
        : chargedAmount

    const eventTtl =
      Number(
        event
          .reservation_ttl_minutes ||
        1440
      )

    const pixTtl =
      useMercadoPago
        ? Number(
            paymentSettings
              ?.pix_expiration_minutes ||
            eventTtl
          )
        : eventTtl

    /*
     * Nunca deixa a reserva durar mais
     * que a cobrança Pix.
     */
    const reservationMinutes =
      requiresPayment
        ? Math.min(
            eventTtl,
            pixTtl
          )
        : 0

    const numberStatus =
      requiresPayment
        ? 'AWAITING_PAYMENT'
        : 'CONFIRMED'

    const participationStatus =
      requiresPayment
        ? 'PENDING'
        : 'CONFIRMED'

    const expiresAt =
      requiresPayment
        ? addMinutes(
            new Date(),
            reservationMinutes
          )
        : null

    const reserve =
      await tx.execute({
        sql: `
          UPDATE raffle_numbers
          SET
            status = ?,
            reserved_at = ?,
            expires_at = ?,
            updated_at = ?
          WHERE event_id = ?
            AND number = ?
            AND status = 'AVAILABLE'
        `,
        args: [
          numberStatus,
          timestamp,
          expiresAt,
          timestamp,
          event.id,
          selectedNumber,
        ],
      })

    if (
      reserve.rowsAffected !== 1
    ) {
      await tx.rollback()

      return {
        ok: false,
        status: 409,
        error:
          'Este número acabou de ser reservado por outra pessoa. Escolha outro número.',
      }
    }

    const numberResult =
      await tx.execute({
        sql: `
          SELECT id
          FROM raffle_numbers
          WHERE event_id = ?
            AND number = ?
          LIMIT 1
        `,
        args: [
          event.id,
          selectedNumber,
        ],
      })

    const numberRow =
      numberResult.rows[0]

    const participant =
      await tx.execute({
        sql: `
          INSERT INTO participants (
            event_id,
            name,
            phone,
            normalized_phone,
            email,
            created_at,
            updated_at
          )
          VALUES (
            ?, ?, ?, ?, ?, ?, ?
          )
        `,
        args: [
          event.id,
          normalizedName,
          String(
            phone || ''
          ).trim(),
          normalizedPhone,
          normalizedEmail || null,
          timestamp,
          timestamp,
        ],
      })

    const participantId =
      Number(
        participant
          .lastInsertRowid
      )

    const participation =
      await tx.execute({
        sql: `
          INSERT INTO participations (
            event_id,
            raffle_number_id,
            participant_id,
            method,
            diaper_size,
            diaper_brand,
            diaper_packs,
            diaper_received_packs,
            status,
            created_at,
            updated_at
          )
          VALUES (
            ?, ?, ?, ?, ?, ?,
            ?, 0, ?, ?, ?
          )
        `,
        args: [
          event.id,
          numberRow.id,
          participantId,
          selectedMethod,

          selectedMethod ===
            'pix'
            ? ''
            : cleanText(
                diaperSize,
                20
              ),

          selectedMethod ===
            'pix'
            ? ''
            : cleanText(
                diaperBrand,
                80
              ),

          selectedMethod ===
            'pix'
            ? 0
            : packs,

          participationStatus,
          timestamp,
          timestamp,
        ],
      })

    const participationId =
      Number(
        participation
          .lastInsertRowid
      )

    const externalReference =
      requiresPayment
        ? `rifa-${Number(
            event.id
          )}-participacao-${participationId}`
        : null

    const idempotencyKey =
      useMercadoPago
        ? newMercadoPagoIdempotencyKey()
        : null

    let paymentId = null

    if (requiresPayment) {
      const payment =
        await tx.execute({
          sql: `
            INSERT INTO payments (
              participation_id,
              amount,
              status,
              external_reference,

              provider,
              provider_environment,
              credential_profile,
              provider_amount,

              base_amount,
              fee_amount,
              charged_amount,

              provider_expires_at,
              idempotency_key,

              created_at,
              updated_at
            )
            VALUES (
              ?, ?, 'PENDING', ?,
              ?, ?, ?, ?,
              ?, ?, ?,
              ?, ?,
              ?, ?
            )
          `,
          args: [
            participationId,
            chargedAmount,
            externalReference,

            useMercadoPago
              ? 'MERCADO_PAGO'
              : 'MANUAL',

            providerEnvironment,
            credentialProfile,
            providerAmount,

            baseAmount,
            feeAmount,
            chargedAmount,

            expiresAt,
            idempotencyKey,

            timestamp,
            timestamp,
          ],
        })

      paymentId =
        Number(
          payment
            .lastInsertRowid
        )
    }

    await audit(tx, {
      eventId:
        Number(event.id),

      actor:
        'public',

      action:
        'NUMBER_RESERVED',

      objectType:
        'participation',

      objectId:
        participationId,

      details: {
        number:
          selectedNumber,

        method:
          selectedMethod,

        requiresPayment,

        paymentProvider:
          useMercadoPago
            ? 'MERCADO_PAGO'
            : requiresPayment
              ? 'MANUAL'
              : null,

        baseAmount,
        feeAmount,
        chargedAmount,
      },
    })

    await tx.commit()

    transactionCommitted =
      true

    context = {
      eventId:
        Number(event.id),

      raffleNumberId:
        Number(numberRow.id),

      participationId,
      paymentId,

      number:
        selectedNumber,

      name:
        normalizedName,

      method:
        selectedMethod,

      participationStatus,
      numberStatus,
      expiresAt,

      requiresPayment,
      useMercadoPago,

      baseAmount,
      feeAmount,
      chargedAmount,
      providerAmount,
      feePayer,

      showFee:
        Boolean(
          paymentSettings
            ?.show_fee
        ),

      providerEnvironment,
      credentialProfile,

      idempotencyKey,
      externalReference,

      email:
        normalizedEmail,

      expirationMinutes:
        reservationMinutes,

      manualFallback:
        Boolean(
          paymentSettings
            ?.manual_fallback
        ),
    }
  } catch (error) {
    if (
      !transactionCommitted
    ) {
      await tx
        .rollback()
        .catch(() => null)
    }

    throw error
  }

  if (
    !context
      ?.requiresPayment
  ) {
    return {
      ok: true,
      status: 201,

      reservation: {
        participationId:
          context
            .participationId,

        paymentId: null,

        number:
          context.number,

        name:
          context.name,

        method:
          context.method,

        status:
          context
            .participationStatus,

        participationStatus:
          context
            .participationStatus,

        numberStatus:
          context.numberStatus,

        expiresAt: null,

        amount: 0,

        paymentProvider: null,
      },
    }
  }

  if (
    !context
      .useMercadoPago
  ) {
    return {
      ok: true,
      status: 201,

      reservation: {
        participationId:
          context
            .participationId,

        paymentId:
          context.paymentId,

        number:
          context.number,

        name:
          context.name,

        method:
          context.method,

        status:
          context
            .participationStatus,

        participationStatus:
          context
            .participationStatus,

        numberStatus:
          context.numberStatus,

        expiresAt:
          context.expiresAt,

        amount:
          context.baseAmount,

        paymentStatus:
          'PENDING',

        paymentProvider:
          'MANUAL',

        baseAmount:
          context.baseAmount,

        feeAmount: 0,

        chargedAmount:
          context.baseAmount,

        providerAmount:
          context.baseAmount,
      },
    }
  }

  try {
    const order =
      await createMercadoPagoPixOrder({
        environment:
          context
            .providerEnvironment,

        credentialProfile:
          context
            .credentialProfile,

        amount:
          context.providerAmount,

        email:
          context.email,

        payerFirstName:
          context.name,

        externalReference:
          context
            .externalReference,

        expirationMinutes:
          context
            .expirationMinutes,

        idempotencyKey:
          context
            .idempotencyKey,
      })

    if (
      !order.orderId ||
      !order.pixCopyPaste
    ) {
      throw new Error(
        'Mercado Pago não retornou os dados do Pix.'
      )
    }

    const timestamp =
      nowIso()

    await db.execute({
      sql: `
        UPDATE payments
        SET
          provider_order_id = ?,
          provider_payment_id = ?,
          provider_status = ?,
          provider_status_detail = ?,
          pix_copy_paste = ?,
          ticket_url = ?,
          updated_at = ?
        WHERE id = ?
      `,
      args: [
        order.orderId,
        order.paymentId || null,

        order.orderStatus ||
          order.paymentStatus ||
          null,

        order.orderStatusDetail ||
          order.paymentStatusDetail ||
          null,

        order.pixCopyPaste ||
          null,

        order.ticketUrl ||
          null,

        timestamp,
        context.paymentId,
      ],
    })

    await audit(db, {
      eventId:
        context.eventId,

      actor:
        'system',

      action:
        'MERCADO_PAGO_ORDER_CREATED',

      objectType:
        'payment',

      objectId:
        context.paymentId,

      details: {
        orderId:
          order.orderId,

        paymentId:
          order.paymentId,

        status:
          order.orderStatus,

        statusDetail:
          order
            .orderStatusDetail,
      },
    })

    return {
      ok: true,
      status: 201,

      reservation: {
        participationId:
          context
            .participationId,

        paymentId:
          context.paymentId,

        number:
          context.number,

        name:
          context.name,

        method:
          context.method,

        status:
          context
            .participationStatus,

        participationStatus:
          context
            .participationStatus,

        numberStatus:
          context.numberStatus,

        expiresAt:
          context.expiresAt,

        amount:
          context.chargedAmount,

        paymentStatus:
          'PENDING',

        paymentProvider:
          'MERCADO_PAGO',

        providerOrderId:
          order.orderId,

        providerPaymentId:
          order.paymentId,

        providerStatus:
          order.orderStatus,

        providerStatusDetail:
          order
            .orderStatusDetail,

        pixCopyPaste:
          order.pixCopyPaste,

        ticketUrl:
          order.ticketUrl,

        baseAmount:
          context.baseAmount,

        feeAmount:
          context.feeAmount,

        chargedAmount:
          context
            .chargedAmount,

        providerAmount:
          context
            .providerAmount,

        feePayer:
          context.feePayer,

        showFee:
          context.showFee,
      },
    }
  } catch (error) {
    console.error(
      'mercado-pago-order:',
      error?.message
    )

    const timestamp =
      nowIso()

    if (
      context
        .manualFallback
    ) {
      await db.execute({
        sql: `
          UPDATE payments
          SET
            amount = ?,
            provider = 'MANUAL',
            provider_environment = NULL,
            credential_profile = NULL,
            provider_amount = 0,
            provider_status = 'FALLBACK',
            provider_status_detail = ?,
            base_amount = ?,
            fee_amount = 0,
            charged_amount = ?,
            pix_copy_paste = NULL,
            ticket_url = NULL,
            updated_at = ?
          WHERE id = ?
        `,
        args: [
          context.baseAmount,

          cleanText(
            error?.message,
            200
          ),

          context.baseAmount,
          context.baseAmount,

          timestamp,
          context.paymentId,
        ],
      })

      await audit(db, {
        eventId:
          context.eventId,

        actor:
          'system',

        action:
          'MERCADO_PAGO_FALLBACK_MANUAL',

        objectType:
          'payment',

        objectId:
          context.paymentId,

        details: {
          number:
            context.number,
        },
      })

      return {
        ok: true,
        status: 201,

        reservation: {
          participationId:
            context
              .participationId,

          paymentId:
            context.paymentId,

          number:
            context.number,

          name:
            context.name,

          method:
            context.method,

          status:
            context
              .participationStatus,

          participationStatus:
            context
              .participationStatus,

          numberStatus:
            context.numberStatus,

          expiresAt:
            context.expiresAt,

          amount:
            context.baseAmount,

          paymentStatus:
            'PENDING',

          paymentProvider:
            'MANUAL',

          paymentFallback:
            true,

          baseAmount:
            context.baseAmount,

          feeAmount: 0,

          chargedAmount:
            context.baseAmount,

          providerAmount:
            context.baseAmount,
        },
      }
    }

    const recovery =
      await db.transaction(
        'write'
      )

    try {
      await recovery.execute({
        sql: `
          UPDATE payments
          SET
            status = 'CANCELLED',
            provider_status = 'FAILED',
            provider_status_detail = ?,
            updated_at = ?
          WHERE id = ?
        `,
        args: [
          cleanText(
            error?.message,
            200
          ),
          timestamp,
          context.paymentId,
        ],
      })

      await recovery.execute({
        sql: `
          UPDATE participations
          SET
            status = 'CANCELLED',
            updated_at = ?
          WHERE id = ?
        `,
        args: [
          timestamp,
          context
            .participationId,
        ],
      })

      await recovery.execute({
        sql: `
          UPDATE raffle_numbers
          SET
            status = 'AVAILABLE',
            reserved_at = NULL,
            expires_at = NULL,
            updated_at = ?
          WHERE id = ?
        `,
        args: [
          timestamp,
          context
            .raffleNumberId,
        ],
      })

      await audit(
        recovery,
        {
          eventId:
            context.eventId,

          actor:
            'system',

          action:
            'MERCADO_PAGO_ORDER_FAILED',

          objectType:
            'payment',

          objectId:
            context.paymentId,

          details: {
            number:
              context.number,
          },
        }
      )

      await recovery.commit()
    } catch (recoveryError) {
      await recovery
        .rollback()
        .catch(() => null)

      throw recoveryError
    }

    return {
      ok: false,
      status: 502,
      error:
        'Não foi possível gerar o Pix pelo Mercado Pago. Tente novamente.',
    }
  }
}


export async function getAdminDashboard() {
  await ensureDefaultEvent()

  const db = getDb()

  const event =
    await eventBySlug(db)

  if (!event) return null

  const tx =
    await db.transaction('write')

  try {
    await expireReservations(
      tx,
      Number(event.id)
    )

    await tx.commit()
  } catch (error) {
    await tx.rollback().catch(() => null)
    throw error
  }

  const adminPaymentSettings =
    await getEventPaymentSettings(
      db,
      event
    )

  const statusCounts =
    await db.execute({
      sql: `
        SELECT
          status,
          COUNT(*) AS total
        FROM raffle_numbers
        WHERE event_id = ?
        GROUP BY status
      `,
      args: [
        event.id,
      ],
    })

  const participants =
    await db.execute({
      sql: `
        SELECT
          p.id AS participation_id,
          rn.id AS raffle_number_id,
          rn.number,
          rn.status AS number_status,

          person.id AS participant_id,
          person.name,
          person.phone,

          p.method,
          p.diaper_size,
          p.diaper_brand,
          p.diaper_packs,
          p.diaper_received_packs,
          p.diaper_received_at,
          p.status AS participation_status,
          p.created_at,

          pay.id AS payment_id,
          pay.amount,
          pay.status AS payment_status,
          pay.paid_at

        FROM participations p

        JOIN raffle_numbers rn
          ON rn.id = p.raffle_number_id

        JOIN participants person
          ON person.id = p.participant_id

        LEFT JOIN payments pay
          ON pay.participation_id = p.id

        WHERE p.event_id = ?

        ORDER BY
          rn.number,
          p.id DESC
      `,
      args: [
        event.id,
      ],
    })

  const draw =
    await db.execute({
      sql: `
        SELECT *
        FROM draws
        WHERE event_id = ?
        ORDER BY id DESC
        LIMIT 1
      `,
      args: [
        event.id,
      ],
    })

  const counts = {
    AVAILABLE: 0,
    RESERVED: 0,
    AWAITING_PAYMENT: 0,
    CONFIRMED: 0,
    CANCELLED: 0,
  }

  for (const row of statusCounts.rows) {
    counts[String(row.status)] =
      Number(row.total)
  }

  const rows =
    participants.rows.map(row => ({
      participationId:
        Number(row.participation_id),

      raffleNumberId:
        Number(row.raffle_number_id),

      number:
        Number(row.number),

      numberStatus:
        String(row.number_status),

      participantId:
        Number(row.participant_id),

      name:
        String(row.name),

      phone:
        String(row.phone),

      method:
        String(row.method),

      diaperSize:
        String(row.diaper_size || ''),

      diaperBrand:
        String(row.diaper_brand || ''),

      diaperPacks:
        Number(row.diaper_packs || 0),

      diaperReceivedPacks:
        Number(
          row.diaper_received_packs || 0
        ),

      diaperReceivedAt:
        row.diaper_received_at
          ? String(
              row.diaper_received_at
            )
          : null,

      participationStatus:
        String(
          row.participation_status
        ),

      paymentId:
        row.payment_id == null
          ? null
          : Number(row.payment_id),

      amount:
        Number(row.amount || 0),

      paymentStatus:
        row.payment_status
          ? String(row.payment_status)
          : null,

      paidAt:
        row.paid_at
          ? String(row.paid_at)
          : null,

      createdAt:
        String(row.created_at),
    }))

  const paidAmount =
    rows
      .filter(
        item =>
          item.paymentStatus === 'PAID'
      )
      .reduce(
        (sum, item) =>
          sum + item.amount,
        0
      )

  const pendingAmount =
    rows
      .filter(
        item =>
          item.paymentStatus === 'PENDING'
      )
      .reduce(
        (sum, item) =>
          sum + item.amount,
        0
      )

  return {
    event: {
      id: Number(event.id),
      organizerName:
        String(
          event.organizer_name ||
          'Organizador'
        ),
      name: String(event.name),
      slug: String(event.slug),
      numberCount:
        Number(event.number_count),
      numberPrice:
        Number(event.number_price),
      prize:
        String(event.prize || ''),
      drawDate:
        String(event.draw_date || ''),
    },

    payment:
      serializePaymentSettings(
        adminPaymentSettings,
        {
          includeAdmin: true,
        }
      ),

    counts,

    financial: {
      paidAmount,
      pendingAmount,
    },

    participations: rows,

    draw:
      draw.rows.length
        ? draw.rows[0]
        : null,
  }
}

export async function markPaymentPaid(
  paymentId
) {
  await ensureSchema()

  const id = Number(paymentId)

  if (!Number.isInteger(id)) {
    return {
      ok: false,
      status: 400,
      error: 'Pagamento inválido.',
    }
  }

  const db = getDb()
  const tx =
    await db.transaction('write')

  try {
    const result =
      await tx.execute({
        sql: `
          SELECT
            pay.id AS payment_id,
            pay.status AS payment_status,
            p.id AS participation_id,
            p.event_id,
            p.raffle_number_id,
            p.status AS participation_status,
            rn.number
          FROM payments pay
          JOIN participations p
            ON p.id = pay.participation_id
          JOIN raffle_numbers rn
            ON rn.id = p.raffle_number_id
          WHERE pay.id = ?
          LIMIT 1
        `,
        args: [id],
      })

    const row = result.rows[0]

    if (!row) {
      await tx.rollback()

      return {
        ok: false,
        status: 404,
        error:
          'Pagamento não encontrado.',
      }
    }

    if (row.payment_status === 'PAID') {
      await tx.rollback()

      return {
        ok: false,
        status: 409,
        error:
          'Pagamento já está confirmado.',
      }
    }

    if (
      row.payment_status !== 'PENDING'
    ) {
      await tx.rollback()

      return {
        ok: false,
        status: 409,
        error:
          'Pagamento não está pendente.',
      }
    }

    const timestamp = nowIso()

    await tx.execute({
      sql: `
        UPDATE payments
        SET
          status = 'PAID',
          paid_at = ?,
          updated_at = ?
        WHERE id = ?
          AND status = 'PENDING'
      `,
      args: [
        timestamp,
        timestamp,
        id,
      ],
    })

    await tx.execute({
      sql: `
        UPDATE participations
        SET
          status = 'CONFIRMED',
          updated_at = ?
        WHERE id = ?
      `,
      args: [
        timestamp,
        row.participation_id,
      ],
    })

    await tx.execute({
      sql: `
        UPDATE raffle_numbers
        SET
          status = 'CONFIRMED',
          expires_at = NULL,
          updated_at = ?
        WHERE id = ?
      `,
      args: [
        timestamp,
        row.raffle_number_id,
      ],
    })

    await audit(tx, {
      eventId:
        Number(row.event_id),

      actor: 'admin',
      action: 'PAYMENT_MARKED_PAID',

      objectType: 'payment',
      objectId: id,

      details: {
        number:
          Number(row.number),
      },
    })

    await tx.commit()

    return {
      ok: true,
      status: 200,
    }
  } catch (error) {
    await tx.rollback().catch(() => null)
    throw error
  }
}

export async function releaseParticipation(
  participationId
) {
  const id = Number(participationId)

  const db = getDb()
  const tx =
    await db.transaction('write')

  try {
    const result =
      await tx.execute({
        sql: `
          SELECT
            p.id,
            p.event_id,
            p.raffle_number_id,
            p.status,
            rn.number,
            pay.status AS payment_status
          FROM participations p
          JOIN raffle_numbers rn
            ON rn.id = p.raffle_number_id
          LEFT JOIN payments pay
            ON pay.participation_id = p.id
          WHERE p.id = ?
          LIMIT 1
        `,
        args: [id],
      })

    const row = result.rows[0]

    if (!row) {
      await tx.rollback()

      return {
        ok: false,
        status: 404,
        error:
          'Participação não encontrada.',
      }
    }

    if (row.status === 'CANCELLED') {
      await tx.rollback()

      return {
        ok: false,
        status: 409,
        error:
          'Participação já foi cancelada.',
      }
    }

    if (row.payment_status === 'PAID') {
      await tx.rollback()

      return {
        ok: false,
        status: 409,
        error:
          'Este número possui pagamento confirmado e não pode ser liberado. Cancele ou estorne o pagamento antes.',
      }
    }

    const winning =
      await tx.execute({
        sql: `
          SELECT id
          FROM draws
          WHERE event_id = ?
            AND winning_participation_id = ?
          LIMIT 1
        `,
        args: [
          row.event_id,
          id,
        ],
      })

    if (winning.rows.length) {
      await tx.rollback()

      return {
        ok: false,
        status: 409,
        error:
          'Não é possível liberar o número vencedor de um sorteio registrado.',
      }
    }

    const timestamp = nowIso()

    await tx.execute({
      sql: `
        UPDATE payments
        SET
          status = CASE
            WHEN status = 'PENDING'
              THEN 'CANCELLED'
            ELSE status
          END,
          updated_at = ?
        WHERE participation_id = ?
      `,
      args: [
        timestamp,
        id,
      ],
    })

    await tx.execute({
      sql: `
        UPDATE participations
        SET
          status = 'CANCELLED',
          updated_at = ?
        WHERE id = ?
      `,
      args: [
        timestamp,
        id,
      ],
    })

    await tx.execute({
      sql: `
        UPDATE raffle_numbers
        SET
          status = 'AVAILABLE',
          reserved_at = NULL,
          expires_at = NULL,
          updated_at = ?
        WHERE id = ?
      `,
      args: [
        timestamp,
        row.raffle_number_id,
      ],
    })

    await audit(tx, {
      eventId:
        Number(row.event_id),
      actor: 'admin',
      action: 'NUMBER_RELEASED',
      objectType: 'participation',
      objectId: id,
      details: {
        number:
          Number(row.number),
      },
    })

    await tx.commit()

    return {
      ok: true,
      status: 200,
    }
  } catch (error) {
    await tx.rollback().catch(() => null)
    throw error
  }
}


export async function getReservationStatus(
  participationId
) {
  await ensureDefaultEvent()

  const id =
    Number.parseInt(
      participationId,
      10
    )

  if (
    !Number.isInteger(id) ||
    id < 1
  ) {
    return {
      ok: false,
      status: 400,
      error:
        'Reserva inválida.',
    }
  }

  const db = getDb()

  async function readReservation() {
    const result =
      await db.execute({
        sql: `
          SELECT
            p.id AS participation_id,
            p.event_id,
            p.raffle_number_id,
            p.status AS participation_status,

            rn.number,
            rn.status AS number_status,
            rn.expires_at,

            pay.id AS payment_id,
            pay.status AS payment_status,
            pay.paid_at,

            pay.external_reference,
            pay.provider,
            pay.provider_environment,
            pay.credential_profile,
            pay.provider_amount,
            pay.provider_order_id,
            pay.provider_payment_id,
            pay.provider_status,
            pay.provider_status_detail,

            pay.base_amount,
            pay.fee_amount,
            pay.charged_amount,

            pay.pix_copy_paste,
            pay.ticket_url

          FROM participations p

          JOIN raffle_numbers rn
            ON rn.id =
              p.raffle_number_id

          LEFT JOIN payments pay
            ON pay.participation_id =
              p.id

          WHERE p.id = ?

          LIMIT 1
        `,
        args: [
          id,
        ],
      })

    return (
      result.rows[0] ||
      null
    )
  }

  let row =
    await readReservation()

  if (!row) {
    return {
      ok: false,
      status: 404,
      error:
        'Reserva não encontrada.',
    }
  }

  /*
   * Sincroniza Mercado Pago antes
   * de verificar vencimento local.
   * Isso evita liberar um número
   * que acabou de ser pago.
   */
  if (
    row.payment_status ===
      'PENDING' &&
    row.provider ===
      'MERCADO_PAGO' &&
    row.provider_order_id
  ) {
    try {
      const settingsResult =
        await db.execute({
          sql: `
            SELECT
              auto_confirm
            FROM event_payment_settings
            WHERE event_id = ?
            LIMIT 1
          `,
          args: [
            Number(
              row.event_id
            ),
          ],
        })

      const autoConfirm =
        Boolean(
          settingsResult
            .rows[0]
            ?.auto_confirm
        )

      const order =
        await getMercadoPagoOrder({
          orderId:
            String(
              row
                .provider_order_id
            ),

          environment:
            String(
              row
                .provider_environment ||
              'TEST'
            ),

          credentialProfile:
            String(
              row
                .credential_profile ||
              'principal'
            ),
        })

      const providerPayment =
        order
          ?.transactions
          ?.payments
          ?.[0] ||
        null

      const orderStatus =
        String(
          order?.status || ''
        )

      const orderStatusDetail =
        String(
          order
            ?.status_detail ||
          ''
        )

      const paymentStatus =
        String(
          providerPayment
            ?.status ||
          ''
        )

      const paymentStatusDetail =
        String(
          providerPayment
            ?.status_detail ||
          ''
        )

      const accredited =
        (
          orderStatus ===
            'processed' &&
          orderStatusDetail ===
            'accredited'
        ) ||
        (
          paymentStatus ===
            'processed' &&
          paymentStatusDetail ===
            'accredited'
        )

      const referenceMatches =
        String(
          order
            ?.external_reference ||
          ''
        ) ===
        String(
          row
            .external_reference ||
          ''
        )

      const expectedAmount =
        Number(
          row
            .provider_amount ||
          row
            .charged_amount ||
          0
        )

      const receivedAmount =
        Number(
          order
            ?.total_amount ||
          providerPayment
            ?.amount ||
          0
        )

      const amountMatches =
        Number.isFinite(
          expectedAmount
        ) &&
        Number.isFinite(
          receivedAmount
        ) &&
        Math.abs(
          expectedAmount -
          receivedAmount
        ) < 0.01

      const timestamp =
        nowIso()

      const syncTx =
        await db.transaction(
          'write'
        )

      try {
        await syncTx.execute({
          sql: `
            UPDATE payments
            SET
              provider_payment_id =
                COALESCE(
                  ?,
                  provider_payment_id
                ),
              provider_status = ?,
              provider_status_detail = ?,
              pix_copy_paste =
                COALESCE(
                  ?,
                  pix_copy_paste
                ),
              ticket_url =
                COALESCE(
                  ?,
                  ticket_url
                ),
              updated_at = ?
            WHERE id = ?
          `,
          args: [
            providerPayment?.id
              ? String(
                  providerPayment.id
                )
              : null,

            orderStatus ||
              paymentStatus ||
              null,

            orderStatusDetail ||
              paymentStatusDetail ||
              null,

            providerPayment
              ?.payment_method
              ?.qr_code ||
              null,

            providerPayment
              ?.payment_method
              ?.ticket_url ||
              null,

            timestamp,

            Number(
              row.payment_id
            ),
          ],
        })

        if (
          accredited &&
          autoConfirm &&
          referenceMatches &&
          amountMatches
        ) {
          await syncTx.execute({
            sql: `
              UPDATE payments
              SET
                status = 'PAID',
                paid_at = ?,
                confirmed_by =
                  'MERCADO_PAGO_POLL',
                updated_at = ?
              WHERE id = ?
                AND status = 'PENDING'
            `,
            args: [
              timestamp,
              timestamp,
              Number(
                row.payment_id
              ),
            ],
          })

          await syncTx.execute({
            sql: `
              UPDATE participations
              SET
                status = 'CONFIRMED',
                updated_at = ?
              WHERE id = ?
                AND status = 'PENDING'
            `,
            args: [
              timestamp,
              id,
            ],
          })

          await syncTx.execute({
            sql: `
              UPDATE raffle_numbers
              SET
                status = 'CONFIRMED',
                expires_at = NULL,
                updated_at = ?
              WHERE id = ?
                AND status =
                  'AWAITING_PAYMENT'
            `,
            args: [
              timestamp,
              Number(
                row
                  .raffle_number_id
              ),
            ],
          })

          await audit(
            syncTx,
            {
              eventId:
                Number(
                  row.event_id
                ),

              actor:
                'system',

              action:
                'MERCADO_PAGO_PAYMENT_CONFIRMED',

              objectType:
                'payment',

              objectId:
                Number(
                  row.payment_id
                ),

              details: {
                number:
                  Number(
                    row.number
                  ),

                orderId:
                  String(
                    row
                      .provider_order_id
                  ),

                amount:
                  receivedAmount,
              },
            }
          )
        } else if (
          accredited &&
          (
            !referenceMatches ||
            !amountMatches
          )
        ) {
          await audit(
            syncTx,
            {
              eventId:
                Number(
                  row.event_id
                ),

              actor:
                'system',

              action:
                'MERCADO_PAGO_PAYMENT_MISMATCH',

              objectType:
                'payment',

              objectId:
                Number(
                  row.payment_id
                ),

              details: {
                referenceMatches,
                amountMatches,
                expectedAmount,
                receivedAmount,
              },
            }
          )
        }

        await syncTx.commit()
      } catch (syncError) {
        await syncTx
          .rollback()
          .catch(() => null)

        throw syncError
      }
    } catch (error) {
      console.warn(
        'mercado-pago-status:',
        error?.message
      )
    }

    row =
      await readReservation()
  }

  const tx =
    await db.transaction(
      'write'
    )

  try {
    await expireReservations(
      tx,
      Number(
        row.event_id
      )
    )

    await tx.commit()
  } catch (error) {
    await tx
      .rollback()
      .catch(() => null)

    throw error
  }

  row =
    await readReservation()

  return {
    ok: true,
    status: 200,

    reservation: {
      participationId:
        Number(
          row
            .participation_id
        ),

      number:
        Number(row.number),

      numberStatus:
        String(
          row.number_status
        ),

      participationStatus:
        String(
          row
            .participation_status
        ),

      expiresAt:
        row.expires_at
          ? String(
              row.expires_at
            )
          : null,

      paymentId:
        row.payment_id == null
          ? null
          : Number(
              row.payment_id
            ),

      paymentStatus:
        row.payment_status
          ? String(
              row
                .payment_status
            )
          : null,

      paidAt:
        row.paid_at
          ? String(
              row.paid_at
            )
          : null,

      paymentProvider:
        row.provider
          ? String(
              row.provider
            )
          : null,

      providerOrderId:
        row.provider_order_id
          ? String(
              row
                .provider_order_id
            )
          : null,

      providerPaymentId:
        row.provider_payment_id
          ? String(
              row
                .provider_payment_id
            )
          : null,

      providerStatus:
        row.provider_status
          ? String(
              row
                .provider_status
            )
          : null,

      providerStatusDetail:
        row.provider_status_detail
          ? String(
              row
                .provider_status_detail
            )
          : null,

      baseAmount:
        Number(
          row.base_amount ||
          0
        ),

      feeAmount:
        Number(
          row.fee_amount ||
          0
        ),

      chargedAmount:
        Number(
          row.charged_amount ||
          0
        ),

      providerAmount:
        Number(
          row.provider_amount ||
          0
        ),

      pixCopyPaste:
        row.pix_copy_paste
          ? String(
              row
                .pix_copy_paste
            )
          : null,

      ticketUrl:
        row.ticket_url
          ? String(
              row.ticket_url
            )
          : null,
    },
  }
}


export async function getLatestPublicDraw(
  slug = 'cha-da-malu'
) {
  await ensureDefaultEvent()

  const db = getDb()

  const eventResult = await db.execute({
    sql: `
      SELECT
        id,
        slug,
        name
      FROM events
      WHERE slug = ?
      LIMIT 1
    `,
    args: [slug],
  })

  const event = eventResult.rows[0]

  if (!event) {
    return null
  }

  const drawResult = await db.execute({
    sql: `
      SELECT
        d.id,
        d.winning_number,
        d.winning_participation_id,
        d.performed_at,
        d.notes,
        person.name AS winner_name,
        person.phone AS winner_phone
      FROM draws d
      LEFT JOIN participations p
        ON p.id = d.winning_participation_id
      LEFT JOIN participants person
        ON person.id = p.participant_id
      WHERE d.event_id = ?
      ORDER BY d.id DESC
      LIMIT 1
    `,
    args: [Number(event.id)],
  })

  const draw = drawResult.rows[0]

  if (!draw) {
    return null
  }

  return {
    id: Number(draw.id),
    winningNumber: Number(draw.winning_number),
    winnerName: String(draw.winner_name || 'Participante'),
    winnerPhone: String(draw.winner_phone || ''),
    performedAt: String(draw.performed_at || ''),
    notes: String(draw.notes || ''),
  }
}
