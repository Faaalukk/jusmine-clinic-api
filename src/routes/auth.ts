import { Elysia, t } from 'elysia'
import { authPlugin, checkCredentials, TOKEN_TTL } from '../auth'

export const authRoutes = new Elysia({ prefix: '/auth' })
  .use(authPlugin)
  .post(
    '/login',
    async ({ body, jwt, status }) => {
      const role = checkCredentials(body.username, body.password)
      if (!role) return status(401, { error: 'invalid_credentials' })
      const token = await jwt.sign({ role, exp: TOKEN_TTL[role] })
      return { token, role }
    },
    { body: t.Object({ username: t.String({ minLength: 1 }), password: t.String({ minLength: 1 }) }) },
  )
  .get('/me', ({ role }) => ({ role: role! }), { requireRole: 'any' })
