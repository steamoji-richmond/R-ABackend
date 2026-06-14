import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'

import { config, assertConfig, isCorsOriginAllowed } from './config.js'
import { connectDb, disconnectDb } from './db.js'
import execRouter from './routes/exec.js'
import restRouter from './routes/rest.js'
import { startCronJobs } from './services/cron.js'

async function main() {
  assertConfig()
  await connectDb()

  const app = express()
  app.set('trust proxy', 1)
  app.disable('x-powered-by')

  app.use(helmet({ crossOriginResourcePolicy: false }))
  app.use(compression())

  // CORS — reflect allowed browser origins; non-browser requests (no Origin) pass through
  const corsOpen =
    !config.corsOrigins.length ||
    (config.corsOrigins.length === 1 && config.corsOrigins[0] === '*')

  app.use(
    cors({
      origin(origin, callback) {
        if (isCorsOriginAllowed(origin)) {
          callback(null, corsOpen ? true : origin)
        } else {
          console.warn('[cors] blocked origin:', origin)
          callback(null, false)
        }
      },
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Accept', 'X-Admin-Key', 'X-Attend-Key'],
      maxAge: 86400,
    })
  )

  // Capture raw body for text/plain JSON posts
  app.use(
    express.raw({
      type: ['text/plain', 'application/json'],
      limit: '1mb',
      verify: (req, _res, buf) => {
        req.rawBody = buf
      },
    })
  )
  app.use((req, _res, next) => {
    if (req.rawBody && !Object.keys(req.body || {}).length) {
      try {
        req.body = JSON.parse(req.rawBody.toString('utf8'))
      } catch {
        req.body = {}
      }
    }
    next()
  })

  app.use(morgan(config.env === 'production' ? 'combined' : 'dev'))

  // Global rate limit
  app.use(
    rateLimit({
      windowMs: config.rate.windowMs,
      max: config.rate.max,
      standardHeaders: true,
      legacyHeaders: false,
      message: { success: false, error: 'Too many requests' },
    })
  )

  app.get('/', (_, res) =>
    res.json({ success: true, service: 'steamoji-workshop-backend', env: config.env })
  )
  app.get('/health', (_, res) => res.json({ success: true, status: 'ok' }))

  app.use('/exec', execRouter)
  app.use('/api', restRouter)

  app.use((_req, res) => res.status(404).json({ success: false, error: 'Not found' }))
  app.use((err, _req, res, _next) => {
    console.error('[error]', err)
    res.status(err.status || 500).json({
      success: false,
      error: err.message || 'Internal server error',
    })
  })

  startCronJobs()

  const server = app.listen(config.port, () => {
    console.log(
      `[server] listening on :${config.port} (${config.env}) — /exec + /api`
    )
  })

  const shutdown = async (sig) => {
    console.log(`\n[${sig}] shutting down...`)
    server.close(() => console.log('[server] http closed'))
    await disconnectDb()
    process.exit(0)
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

main().catch((err) => {
  console.error('[fatal]', err)
  process.exit(1)
})
