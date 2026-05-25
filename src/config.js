import 'dotenv/config'

function num(v, def) {
  const n = Number(v)
  return Number.isFinite(n) ? n : def
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: num(process.env.PORT, 4000),

  mongoUri: process.env.MONGODB_URI || '',
  mongoMaxPool: num(process.env.MONGODB_MAX_POOL, 50),

  corsOrigins: (process.env.CORS_ORIGINS || '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  adminPass: process.env.ADMIN_PASS || '',
  attendPass: process.env.ATTEND_PASS || '',

  rate: {
    windowMs: num(process.env.RATE_WINDOW_MS, 60_000),
    max: num(process.env.RATE_MAX, 300),
  },

  // Optional global fallback for Steamoji import when a branch has no token set
  steamoji: {
    authToken: process.env.STEAMOJI_AUTH_TOKEN || '',
  },

  // Square credentials are stored per branch; only the return URL is global
  square: {
    redirectUrl:
      process.env.CHECKOUT_REDIRECT_URL || 'http://localhost:3000/payment/return',
  },
}

export function assertConfig() {
  if (!config.mongoUri) throw new Error('MONGODB_URI is required')
}
