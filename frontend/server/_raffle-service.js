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

const EVENT_SLUG = 'cha-da-malu'

function addMinutes(date, minutes) {
  return new Date(
    date.getTime() +
    Number(minutes) * 60000
  ).toISOString()
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
          120
        ),
    },

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

  const selectedNumber =
    Number.parseInt(number, 10)

  const selectedMethod =
    String(method || '').trim()

  const packs =
    Number.parseInt(diaperPacks, 10) || 0

  if (normalizedName.length < 2) {
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
      error: 'Informe um WhatsApp válido.',
    }
  }

  if (
    !Number.isInteger(selectedNumber) ||
    selectedNumber < 1
  ) {
    return {
      ok: false,
      status: 400,
      error: 'Número inválido.',
    }
  }

  if (
    !['pix', 'diaper', 'both']
      .includes(selectedMethod)
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
    await db.transaction('write')

  try {
    const event =
      await eventBySlug(tx, slug)

    if (!event) {
      await tx.rollback()

      return {
        ok: false,
        status: 404,
        error: 'Rifa não encontrada.',
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
      Number(event.number_count)
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
      selectedMethod === 'pix' &&
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
      selectedMethod === 'diaper' &&
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
      selectedMethod === 'both' &&
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

    const timestamp = nowIso()

    const requiresPayment =
      selectedMethod === 'pix' ||
      selectedMethod === 'both'

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
            Number(
              event.reservation_ttl_minutes ||
              120
            )
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

    if (reserve.rowsAffected !== 1) {
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
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        args: [
          event.id,
          normalizedName,
          String(phone || '').trim(),
          normalizedPhone,
          timestamp,
          timestamp,
        ],
      })

    const participantId =
      Number(participant.lastInsertRowid)

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
          selectedMethod === 'pix'
            ? ''
            : cleanText(diaperSize, 20),
          selectedMethod === 'pix'
            ? ''
            : cleanText(
                diaperBrand,
                80
              ),
          selectedMethod === 'pix'
            ? 0
            : packs,
          participationStatus,
          timestamp,
          timestamp,
        ],
      })

    const participationId =
      Number(
        participation.lastInsertRowid
      )

    let paymentId = null

    if (requiresPayment) {
      const payment =
        await tx.execute({
          sql: `
            INSERT INTO payments (
              participation_id,
              amount,
              status,
              created_at,
              updated_at
            )
            VALUES (
              ?,
              ?,
              'PENDING',
              ?,
              ?
            )
          `,
          args: [
            participationId,
            Number(event.number_price),
            timestamp,
            timestamp,
          ],
        })

      paymentId =
        Number(payment.lastInsertRowid)
    }

    await audit(tx, {
      eventId: Number(event.id),
      actor: 'public',
      action: 'NUMBER_RESERVED',
      objectType: 'participation',
      objectId: participationId,
      details: {
        number: selectedNumber,
        method: selectedMethod,
        requiresPayment,
      },
    })

    await tx.commit()

    return {
      ok: true,
      status: 201,

      reservation: {
        participationId,
        paymentId,
        number: selectedNumber,
        name: normalizedName,
        method: selectedMethod,
        status:
          participationStatus,
        numberStatus,
        expiresAt,
        amount:
          requiresPayment
            ? Number(event.number_price)
            : 0,
      },
    }
  } catch (error) {
    await tx.rollback().catch(() => null)
    throw error
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

  let result =
    await db.execute({
      sql: `
        SELECT
          p.id AS participation_id,
          p.event_id,
          p.status AS participation_status,

          rn.number,
          rn.status AS number_status,
          rn.expires_at,

          pay.id AS payment_id,
          pay.status AS payment_status,
          pay.paid_at

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

  let row = result.rows[0]

  if (!row) {
    return {
      ok: false,
      status: 404,
      error:
        'Reserva não encontrada.',
    }
  }

  const tx =
    await db.transaction('write')

  try {
    await expireReservations(
      tx,
      Number(row.event_id)
    )

    await tx.commit()
  } catch (error) {
    await tx
      .rollback()
      .catch(() => null)

    throw error
  }

  result =
    await db.execute({
      sql: `
        SELECT
          p.id AS participation_id,
          p.status AS participation_status,

          rn.number,
          rn.status AS number_status,
          rn.expires_at,

          pay.id AS payment_id,
          pay.status AS payment_status,
          pay.paid_at

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

  row = result.rows[0]

  return {
    ok: true,
    status: 200,

    reservation: {
      participationId:
        Number(
          row.participation_id
        ),

      number:
        Number(row.number),

      numberStatus:
        String(
          row.number_status
        ),

      participationStatus:
        String(
          row.participation_status
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
              row.payment_status
            )
          : null,

      paidAt:
        row.paid_at
          ? String(
              row.paid_at
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
