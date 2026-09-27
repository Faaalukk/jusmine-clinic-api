import { cors } from '@elysiajs/cors'
import { Elysia } from 'elysia'
import { env } from './env'
import { authRoutes } from './routes/auth'
import { branchRoutes } from './routes/branches'
import { reportRoutes } from './routes/reports'
import { sourceRoutes } from './routes/sources'
import { surveyRoutes } from './routes/survey'

export const app = new Elysia()
  .use(cors({ origin: env.corsOrigin, allowedHeaders: ['Content-Type', 'Authorization'] }))
  .get('/health', () => ({ ok: true }))
  .use(authRoutes)
  .use(surveyRoutes)
  .use(branchRoutes)
  .use(sourceRoutes)
  .use(reportRoutes)

export type App = typeof app
