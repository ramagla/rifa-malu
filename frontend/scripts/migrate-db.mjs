import {
  ensureSchema,
} from '../server/_schema.js'

import {
  getDb,
} from '../server/_db.js'

async function main() {
  console.log('Aplicando schema...')

  await ensureSchema()

  const db = getDb()

  const result = await db.execute(`
    SELECT
      version,
      applied_at
    FROM schema_migrations
    ORDER BY version
  `)

  console.table(result.rows)

  console.log('Schema OK.')
}

main().catch((error) => {
  console.error('ERRO NA MIGRAÇÃO')
  console.error(error)
  process.exit(1)
})
