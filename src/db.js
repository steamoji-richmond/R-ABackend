import mongoose from 'mongoose'
import { config } from './config.js'

mongoose.set('strictQuery', true)

export async function connectDb() {
  if (mongoose.connection.readyState === 1) return mongoose.connection
  await mongoose.connect(config.mongoUri, {
    maxPoolSize: config.mongoMaxPool,
    minPoolSize: 2,
    serverSelectionTimeoutMS: 8000,
    socketTimeoutMS: 45000,
    retryWrites: true,
  })
  console.log(
    `[db] connected (pool=${config.mongoMaxPool}) to ${maskUri(config.mongoUri)}`
  )
  return mongoose.connection
}

export async function disconnectDb() {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect()
}

function maskUri(uri) {
  try {
    const u = new URL(uri)
    if (u.password) u.password = '****'
    return u.toString()
  } catch {
    return uri
  }
}
