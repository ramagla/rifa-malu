import { getDb, nowIso } from './_db.js'

let schemaReady = null

const statements = [
  `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  )
  `,

  `
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organizer_identifier TEXT NOT NULL DEFAULT 'rafael',
    organizer_name TEXT NOT NULL DEFAULT 'Rafael Almeida',
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    baby_name TEXT,
    message TEXT,
    prize TEXT,
    draw_date TEXT,
    draw_time TEXT,
    number_count INTEGER NOT NULL DEFAULT 30,
    number_price REAL NOT NULL DEFAULT 15,
    pix_key TEXT,
    pix_recipient_name TEXT,
    pix_city TEXT,
    whatsapp TEXT,
    delivery_address TEXT,
    allow_pix INTEGER NOT NULL DEFAULT 1,
    allow_diaper INTEGER NOT NULL DEFAULT 1,
    reservation_ttl_minutes INTEGER NOT NULL DEFAULT 1440,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
  `,

  `
  CREATE TABLE IF NOT EXISTS raffle_numbers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    number INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'AVAILABLE',
    reserved_at TEXT,
    expires_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    UNIQUE(event_id, number),

    FOREIGN KEY(event_id)
      REFERENCES events(id)
      ON DELETE CASCADE
  )
  `,

  `
  CREATE TABLE IF NOT EXISTS participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    normalized_phone TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    FOREIGN KEY(event_id)
      REFERENCES events(id)
      ON DELETE CASCADE
  )
  `,

  `
  CREATE TABLE IF NOT EXISTS participations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    raffle_number_id INTEGER NOT NULL,
    participant_id INTEGER NOT NULL,
    method TEXT NOT NULL,
    diaper_size TEXT,
    diaper_brand TEXT,
    diaper_packs INTEGER NOT NULL DEFAULT 0,
    diaper_received_packs INTEGER NOT NULL DEFAULT 0,
    diaper_received_at TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    FOREIGN KEY(event_id)
      REFERENCES events(id),

    FOREIGN KEY(raffle_number_id)
      REFERENCES raffle_numbers(id),

    FOREIGN KEY(participant_id)
      REFERENCES participants(id)
  )
  `,

  `
  CREATE TABLE IF NOT EXISTS event_payment_settings (
    event_id INTEGER PRIMARY KEY,

    pix_provider TEXT NOT NULL DEFAULT 'MANUAL',

    mercado_pago_enabled INTEGER NOT NULL DEFAULT 0,
    mercado_pago_environment TEXT NOT NULL DEFAULT 'TEST',
    credential_profile TEXT NOT NULL DEFAULT 'principal',

    fee_type TEXT NOT NULL DEFAULT 'PERCENTAGE',
    fee_value REAL NOT NULL DEFAULT 0.99,
    fee_payer TEXT NOT NULL DEFAULT 'ORGANIZER',
    show_fee INTEGER NOT NULL DEFAULT 1,

    auto_confirm INTEGER NOT NULL DEFAULT 1,
    manual_fallback INTEGER NOT NULL DEFAULT 1,

    pix_expiration_minutes INTEGER NOT NULL DEFAULT 1440,

    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    FOREIGN KEY(event_id)
      REFERENCES events(id)
      ON DELETE CASCADE
  )
  `,

  `
  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    participation_id INTEGER NOT NULL UNIQUE,
    amount REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'PENDING',
    paid_at TEXT,
    external_reference TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    FOREIGN KEY(participation_id)
      REFERENCES participations(id)
  )
  `,

  `
  CREATE TABLE IF NOT EXISTS draws (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    winning_number INTEGER NOT NULL,
    winning_participation_id INTEGER,
    eligible_snapshot TEXT NOT NULL,
    performed_at TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL,

    FOREIGN KEY(event_id)
      REFERENCES events(id)
  )
  `,

  `
  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    object_type TEXT,
    object_id TEXT,
    details TEXT,
    created_at TEXT NOT NULL,

    FOREIGN KEY(event_id)
      REFERENCES events(id)
  )
  `,

  `
  CREATE INDEX IF NOT EXISTS raffle_numbers_event_status_idx
  ON raffle_numbers (event_id, status)
  `,

  `
  CREATE INDEX IF NOT EXISTS participations_event_status_idx
  ON participations (event_id, status)
  `,

  `
  CREATE INDEX IF NOT EXISTS payments_status_idx
  ON payments (status)
  `,
]

export async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      const db = getDb()

      await db.execute(
        'PRAGMA foreign_keys = ON'
      ).catch(() => null)

      for (const statement of statements) {
        await db.execute(statement)
      }

      await db.execute({
        sql: `
          INSERT OR IGNORE INTO schema_migrations (
            version,
            applied_at
          )
          VALUES (?, ?)
        `,
        args: [
          1,
          nowIso(),
        ],
      })


      // RESERVATION_TTL_24H
      const ttlMigration =
        await db.execute(`
          SELECT version
          FROM schema_migrations
          WHERE version = 2
          LIMIT 1
        `)

      if (!ttlMigration.rows.length) {
        const timestamp = nowIso()

        const expiresAt =
          new Date(
            Date.now() +
            1440 * 60000
          ).toISOString()

        const ttlEvents =
          await db.execute(`
            SELECT id
            FROM events
            WHERE reservation_ttl_minutes = 120
          `)

        for (
          const row of ttlEvents.rows
        ) {
          const eventId =
            Number(row.id)

          await db.execute({
            sql: `
              UPDATE events
              SET
                reservation_ttl_minutes = 1440,
                updated_at = ?
              WHERE id = ?
            `,
            args: [
              timestamp,
              eventId,
            ],
          })

          // Estende também reservas Pix
          // pendentes que já existiam antes
          // desta migração.
          await db.execute({
            sql: `
              UPDATE raffle_numbers
              SET
                expires_at = ?,
                updated_at = ?
              WHERE event_id = ?
                AND status = 'AWAITING_PAYMENT'
            `,
            args: [
              expiresAt,
              timestamp,
              eventId,
            ],
          })
        }

        await db.execute({
          sql: `
            INSERT INTO schema_migrations (
              version,
              applied_at
            )
            VALUES (?, ?)
          `,
          args: [
            2,
            timestamp,
          ],
        })
      }


      // PAYMENT_SETTINGS_V3
      const paymentSettingsMigration =
        await db.execute(`
          SELECT version
          FROM schema_migrations
          WHERE version = 3
          LIMIT 1
        `)

      if (!paymentSettingsMigration.rows.length) {
        const timestamp = nowIso()

        const events =
          await db.execute(`
            SELECT
              id,
              reservation_ttl_minutes
            FROM events
          `)

        for (const event of events.rows) {
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
        }

        await db.execute({
          sql: `
            INSERT INTO schema_migrations (
              version,
              applied_at
            )
            VALUES (?, ?)
          `,
          args: [
            3,
            timestamp,
          ],
        })
      }

    })().catch((error) => {
      schemaReady = null
      throw error
    })
  }

  return schemaReady
}

export async function ensureDefaultEvent() {
  await ensureSchema()

  const db = getDb()

  let result = await db.execute({
    sql: `
      SELECT *
      FROM events
      WHERE slug = ?
      LIMIT 1
    `,
    args: [
      'cha-da-malu',
    ],
  })

  if (result.rows.length) {
    return result.rows[0]
  }

  const timestamp = nowIso()

  await db.execute({
    sql: `
      INSERT INTO events (
        organizer_identifier,
        name,
        slug,
        baby_name,
        message,
        prize,
        draw_date,
        draw_time,
        number_count,
        number_price,
        pix_key,
        pix_recipient_name,
        pix_city,
        whatsapp,
        delivery_address,
        allow_pix,
        allow_diaper,
        reservation_ttl_minutes,
        active,
        created_at,
        updated_at
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `,
    args: [
      'rafael',
      'Chá de bebê da Malu',
      'cha-da-malu',
      'Malu',
      'Escolha seu número da sorte e nos ajude a preparar cada detalhe da chegada da Malu.',
      'R$ 500,00 via Pix',
      '2026-09-28',
      '19:00',
      30,
      15,
      '',
      'Malu',
      'SAO PAULO',
      '',
      'A combinar com a família',
      1,
      1,
      1440,
      1,
      timestamp,
      timestamp,
    ],
  })

  result = await db.execute({
    sql: `
      SELECT *
      FROM events
      WHERE slug = ?
      LIMIT 1
    `,
    args: [
      'cha-da-malu',
    ],
  })

  const event = result.rows[0]

  if (!event) {
    throw new Error(
      'Falha ao criar o evento inicial.'
    )
  }

  for (
    let number = 1;
    number <= Number(event.number_count);
    number += 1
  ) {
    await db.execute({
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

  return event
}
