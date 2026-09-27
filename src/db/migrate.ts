import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { client, db } from '.'

await migrate(db, { migrationsFolder: './drizzle' })
console.log('Migrations applied')
await client.end()
