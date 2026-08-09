import { getDb } from '../server/_db.js'

const url =
  String(
    process.env.TURSO_DATABASE_URL ||
    'file:./rifa-local.db'
  )

if (
  url.startsWith('libsql://') &&
  !url.includes('rifa-malu-dev-')
) {
  throw new Error(
    `Banco remoto não autorizado: ${url}`
  )
}

console.log(
  'Banco:',
  url.startsWith('libsql://')
    ? url
    : 'SQLite local'
)

const db = getDb()

const info =
  await db.execute(
    'PRAGMA table_info(events)'
  )

const columns =
  new Set(
    info.rows.map(row =>
      String(row.name)
    )
  )

if (
  !columns.has('organizer_name')
) {
  console.log(
    'Adicionando organizer_name...'
  )

  await db.execute(`
    ALTER TABLE events
    ADD COLUMN organizer_name
      TEXT NOT NULL
      DEFAULT 'Rafael Almeida'
  `)
} else {
  console.log(
    'organizer_name já existe.'
  )
}

await db.execute(`
  UPDATE events
  SET organizer_name = 'Rafael Almeida'
  WHERE
    organizer_name IS NULL
    OR TRIM(organizer_name) = ''
`)

const check =
  await db.execute(`
    SELECT
      id,
      name,
      organizer_name
    FROM events
    ORDER BY id
  `)

console.table(check.rows)

console.log(
  'Migração organizer_name OK.'
)
