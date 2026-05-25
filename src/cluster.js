import cluster from 'node:cluster'
import os from 'node:os'

const WORKERS = Number(process.env.WEB_CONCURRENCY) || os.cpus().length

if (cluster.isPrimary) {
  console.log(`[cluster] primary ${process.pid} spawning ${WORKERS} workers`)
  for (let i = 0; i < WORKERS; i++) cluster.fork()
  cluster.on('exit', (worker, code) => {
    console.warn(`[cluster] worker ${worker.process.pid} died (${code}) – restarting`)
    cluster.fork()
  })
} else {
  import('./index.js')
}
