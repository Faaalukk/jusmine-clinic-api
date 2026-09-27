import { jwt } from '@elysiajs/jwt'
import { Elysia, t } from 'elysia'
import { timingSafeEqual } from 'node:crypto'
import { env } from './env'

export type Role = 'employee' | 'manager'

export const TOKEN_TTL: Record<Role, string> = {
  // The employee account lives on a shared iPad, so it should not expire every shift.
  employee: '30d',
  manager: '7d',
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

export function checkCredentials(username: string, password: string): Role | null {
  const u = username.trim().toLowerCase()
  for (const role of ['employee', 'manager'] as const) {
    const account = env.accounts[role]
    if (u === account.username.toLowerCase() && safeEqual(password, account.password)) return role
  }
  return null
}

export const jwtPlugin = new Elysia({ name: 'jwt' }).use(
  jwt({
    name: 'jwt',
    secret: env.jwtSecret,
    schema: t.Object({ role: t.Union([t.Literal('employee'), t.Literal('manager')]) }),
  }),
)

/**
 * Resolves `role` from the bearer token and exposes a `role` macro:
 *   { role: 'any' }      -> any signed-in account
 *   { role: 'manager' }  -> manager only
 */
export const authPlugin = new Elysia({ name: 'auth' })
  .use(jwtPlugin)
  .derive({ as: 'global' }, async ({ jwt, headers }) => {
    const header = headers.authorization
    if (!header?.startsWith('Bearer ')) return { role: null as Role | null }
    const payload = await jwt.verify(header.slice(7))
    return { role: payload ? (payload.role as Role) : null }
  })
  .macro({
    requireRole: (required: 'any' | Role) => ({
      beforeHandle({ role, status }) {
        if (!role) return status(401, { error: 'unauthorized' })
        if (required !== 'any' && role !== required) return status(403, { error: 'forbidden' })
      },
    }),
  })
