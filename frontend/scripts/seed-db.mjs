import {
  ensureDefaultEvent,
} from '../server/_schema.js'

import {
  getDb,
} from '../server/_db.js'

async function main() {
  console.log(
    'Criando/verificando evento da Malu...'
  )

  const event =
    await ensureDefaultEvent()

  const db = getDb()

  const numbers = await db.execute({
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

  console.log('')
  console.log('Evento:')
  console.log({
    id: Number(event.id),
    name: String(event.name),
    slug: String(event.slug),
    numberCount: Number(
      event.number_count
    ),
  })

  console.log('')
  console.log(
    `Números existentes: ${numbers.rows.length}`
  )

  console.log('Seed OK.')
}

main().catch((error) => {
  console.error('ERRO NO SEED')
  console.error(error)
  process.exit(1)
})
