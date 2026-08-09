import {
  cleanText,
  getDb,
  nowIso,
} from './_db.js'

import {
  ensureDefaultEvent,
  ensureSchema,
} from './_schema.js'

const EVENT_SLUG = 'cha-da-malu'

async function currentEvent(db) {
  const result = await db.execute({
    sql: `
      SELECT *
      FROM events
      WHERE slug = ?
      LIMIT 1
    `,
    args: [EVENT_SLUG],
  })

  return result.rows[0] || null
}

async function audit(
  db,
  {
    eventId,
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
      VALUES (?, 'admin', ?, ?, ?, ?, ?)
    `,
    args: [
      eventId,
      action,
      objectType,
      objectId == null ? null : String(objectId),
      JSON.stringify(details),
      nowIso(),
    ],
  })
}

function parseBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value

  if (value === 1 || value === '1') {
    return true
  }

  if (value === 0 || value === '0') {
    return false
  }

  return fallback
}

export async function markDiaperReceived({
  participationId,
  receivedPacks,
}) {
  await ensureSchema()

  const id = Number(participationId)

  if (!Number.isInteger(id)) {
    return {
      ok: false,
      status: 400,
      error: 'Participação inválida.',
    }
  }

  const db = getDb()
  const tx = await db.transaction('write')

  try {
    const result = await tx.execute({
      sql: `
        SELECT
          p.id,
          p.event_id,
          p.method,
          p.diaper_packs,
          p.diaper_received_packs,
          p.status,
          rn.number
        FROM participations p
        JOIN raffle_numbers rn
          ON rn.id = p.raffle_number_id
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
        error: 'Participação não encontrada.',
      }
    }

    if (row.status === 'CANCELLED') {
      await tx.rollback()

      return {
        ok: false,
        status: 409,
        error: 'Participação cancelada.',
      }
    }

    if (row.method === 'pix') {
      await tx.rollback()

      return {
        ok: false,
        status: 409,
        error:
          'Esta participação não possui fraldas.',
      }
    }

    const expected =
      Number(row.diaper_packs || 0)

    const received =
      receivedPacks == null
        ? expected
        : Number(receivedPacks)

    if (
      !Number.isInteger(received) ||
      received < 0 ||
      received > expected
    ) {
      await tx.rollback()

      return {
        ok: false,
        status: 400,
        error:
          'Quantidade recebida inválida.',
      }
    }

    const timestamp = nowIso()

    await tx.execute({
      sql: `
        UPDATE participations
        SET
          diaper_received_packs = ?,
          diaper_received_at = ?,
          updated_at = ?
        WHERE id = ?
      `,
      args: [
        received,
        received >= expected
          ? timestamp
          : null,
        timestamp,
        id,
      ],
    })

    await audit(tx, {
      eventId: Number(row.event_id),
      action: 'DIAPER_RECEIPT_UPDATED',
      objectType: 'participation',
      objectId: id,
      details: {
        number: Number(row.number),
        expected,
        received,
      },
    })

    await tx.commit()

    return {
      ok: true,
      status: 200,
      received,
      expected,
    }
  } catch (error) {
    await tx.rollback().catch(() => null)
    throw error
  }
}

export async function updateEventSettings(
  settings
) {
  await ensureDefaultEvent()

  const db = getDb()
  const tx = await db.transaction('write')

  try {
    const event = await currentEvent(tx)

    if (!event) {
      await tx.rollback()

      return {
        ok: false,
        status: 404,
        error: 'Evento não encontrado.',
      }
    }

    const name =
      cleanText(settings.name, 120)

    const organizerName =
      cleanText(
        settings.organizerName,
        120
      ) ||
      cleanText(
        event.organizer_name,
        120
      ) ||
      'Organizador'

    const babyName =
      cleanText(settings.babyName, 80)

    const message =
      cleanText(settings.message, 1000)

    const prize =
      cleanText(settings.prize, 200)

    const drawDate =
      cleanText(settings.drawDate, 20)

    const drawTime =
      cleanText(settings.drawTime, 10)

    const pixKey =
      cleanText(settings.pixKey, 200)

    const pixRecipientName =
      cleanText(
        settings.pixRecipientName,
        120
      )

    const pixCity =
      cleanText(settings.pixCity, 80)

    const whatsapp =
      cleanText(settings.whatsapp, 30)

    const deliveryAddress =
      cleanText(
        settings.deliveryAddress,
        1000
      )

    const numberCount =
      Number.parseInt(
        settings.numberCount,
        10
      )

    const numberPrice =
      Number(settings.numberPrice)

    const ttl =
      Number.parseInt(
        settings.reservationTtlMinutes,
        10
      )

    const allowPix =
      parseBoolean(
        settings.allowPix,
        Boolean(event.allow_pix)
      )

    const allowDiaper =
      parseBoolean(
        settings.allowDiaper,
        Boolean(event.allow_diaper)
      )

    if (!name) {
      await tx.rollback()

      return {
        ok: false,
        status: 400,
        error:
          'Informe o nome do evento.',
      }
    }

    if (
      !Number.isInteger(numberCount) ||
      numberCount < 1 ||
      numberCount > 500
    ) {
      await tx.rollback()

      return {
        ok: false,
        status: 400,
        error:
          'Quantidade de números inválida.',
      }
    }

    if (
      !Number.isFinite(numberPrice) ||
      numberPrice < 0 ||
      numberPrice > 100000
    ) {
      await tx.rollback()

      return {
        ok: false,
        status: 400,
        error:
          'Valor por número inválido.',
      }
    }

    if (
      !Number.isInteger(ttl) ||
      ttl < 5 ||
      ttl > 10080
    ) {
      await tx.rollback()

      return {
        ok: false,
        status: 400,
        error:
          'Tempo de reserva inválido.',
      }
    }

    if (!allowPix && !allowDiaper) {
      await tx.rollback()

      return {
        ok: false,
        status: 400,
        error:
          'Ative ao menos uma modalidade de participação.',
      }
    }

    const oldCount =
      Number(event.number_count)

    if (numberCount < oldCount) {
      const blocked =
        await tx.execute({
          sql: `
            SELECT
              rn.number,
              rn.status
            FROM raffle_numbers rn
            WHERE rn.event_id = ?
              AND rn.number > ?
              AND (
                rn.status <> 'AVAILABLE'
                OR EXISTS (
                  SELECT 1
                  FROM participations p
                  WHERE p.raffle_number_id = rn.id
                )
              )
            ORDER BY rn.number
            LIMIT 1
          `,
          args: [
            event.id,
            numberCount,
          ],
        })

      if (blocked.rows.length) {
        await tx.rollback()

        return {
          ok: false,
          status: 409,
          error:
            `Não é possível reduzir para ${numberCount} números porque o número ${blocked.rows[0].number} já possui histórico.`,
        }
      }

      await tx.execute({
        sql: `
          DELETE FROM raffle_numbers
          WHERE event_id = ?
            AND number > ?
            AND status = 'AVAILABLE'
        `,
        args: [
          event.id,
          numberCount,
        ],
      })
    }

    const timestamp = nowIso()

    if (numberCount > oldCount) {
      for (
        let number = oldCount + 1;
        number <= numberCount;
        number += 1
      ) {
        await tx.execute({
          sql: `
            INSERT OR IGNORE INTO raffle_numbers (
              event_id,
              number,
              status,
              created_at,
              updated_at
            )
            VALUES (
              ?,
              ?,
              'AVAILABLE',
              ?,
              ?
            )
          `,
          args: [
            event.id,
            number,
            timestamp,
            timestamp,
          ],
        })
      }
    }

    await tx.execute({
      sql: `
        UPDATE events
        SET
          organizer_name = ?,
          name = ?,
          baby_name = ?,
          message = ?,
          prize = ?,
          draw_date = ?,
          draw_time = ?,
          number_count = ?,
          number_price = ?,
          pix_key = ?,
          pix_recipient_name = ?,
          pix_city = ?,
          whatsapp = ?,
          delivery_address = ?,
          allow_pix = ?,
          allow_diaper = ?,
          reservation_ttl_minutes = ?,
          updated_at = ?
        WHERE id = ?
      `,
      args: [
        organizerName,
        name,
        babyName,
        message,
        prize,
        drawDate,
        drawTime,
        numberCount,
        numberPrice,
        pixKey,
        pixRecipientName,
        pixCity,
        whatsapp,
        deliveryAddress,
        allowPix ? 1 : 0,
        allowDiaper ? 1 : 0,
        ttl,
        timestamp,
        event.id,
      ],
    })

    await audit(tx, {
      eventId: Number(event.id),
      action: 'EVENT_SETTINGS_UPDATED',
      objectType: 'event',
      objectId: event.id,
      details: {
        oldNumberCount: oldCount,
        newNumberCount: numberCount,
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

export async function registerDraw({
  winningNumber,
  notes = '',
}) {
  await ensureDefaultEvent()

  const number =
    Number.parseInt(
      winningNumber,
      10
    )

  if (!Number.isInteger(number)) {
    return {
      ok: false,
      status: 400,
      error: 'Número vencedor inválido.',
    }
  }

  const db = getDb()
  const tx = await db.transaction('write')

  try {
    const event = await currentEvent(tx)

    if (!event) {
      await tx.rollback()

      return {
        ok: false,
        status: 404,
        error: 'Evento não encontrado.',
      }
    }

    const existing =
      await tx.execute({
        sql: `
          SELECT id
          FROM draws
          WHERE event_id = ?
          LIMIT 1
        `,
        args: [event.id],
      })

    if (existing.rows.length) {
      await tx.rollback()

      return {
        ok: false,
        status: 409,
        error:
          'Já existe um sorteio registrado para este evento.',
      }
    }

    const eligible =
      await tx.execute({
        sql: `
          SELECT
            p.id AS participation_id,
            rn.number,
            person.name
          FROM participations p
          JOIN raffle_numbers rn
            ON rn.id = p.raffle_number_id
          JOIN participants person
            ON person.id = p.participant_id
          WHERE p.event_id = ?
            AND p.status = 'CONFIRMED'
            AND rn.status = 'CONFIRMED'
          ORDER BY rn.number
        `,
        args: [event.id],
      })

    const snapshot =
      eligible.rows.map(row => ({
        participationId:
          Number(row.participation_id),
        number:
          Number(row.number),
        name:
          String(row.name),
      }))

    const winner =
      snapshot.find(
        item => item.number === number
      )

    if (!winner) {
      await tx.rollback()

      return {
        ok: false,
        status: 409,
        error:
          'O número informado não está entre os participantes aptos ao sorteio.',
      }
    }

    const timestamp = nowIso()

    const inserted =
      await tx.execute({
        sql: `
          INSERT INTO draws (
            event_id,
            winning_number,
            winning_participation_id,
            eligible_snapshot,
            performed_at,
            notes,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          event.id,
          number,
          winner.participationId,
          JSON.stringify(snapshot),
          timestamp,
          cleanText(notes, 1000),
          timestamp,
        ],
      })

    await audit(tx, {
      eventId: Number(event.id),
      action: 'DRAW_REGISTERED',
      objectType: 'draw',
      objectId:
        Number(
          inserted.lastInsertRowid
        ),
      details: {
        winningNumber: number,
        winner: winner.name,
        eligibleCount:
          snapshot.length,
      },
    })

    await tx.commit()

    return {
      ok: true,
      status: 201,
      draw: {
        winningNumber: number,
        winnerName: winner.name,
        eligibleCount:
          snapshot.length,
        performedAt: timestamp,
      },
    }
  } catch (error) {
    await tx.rollback().catch(() => null)
    throw error
  }
}
