import Fastify, { FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import websocket from '@fastify/websocket'
import { MoshiClient } from './moshi-client'
import { ingestionRoutes } from './ingestion'

const server: FastifyInstance = Fastify({
  logger: true
})

server.get('/', async () => {
  return { status: 'ok', service: 'hear-server', engine: 'node' }
})

server.get('/health', async () => {
  return { status: 'healthy', timestamp: new Date().toISOString() }
})

const start = async () => {
  try {
    // 1. Register Plugins
    await server.register(cors, { origin: true })
    await server.register(websocket)

    // 2. Register Routes
    server.register(ingestionRoutes)

    // 3. Register WebSocket Endpoint
    server.register(async function (fastify) {
      fastify.get('/ws/audio', { websocket: true }, (connection, req) => {
        fastify.log.info('Client connected to audio stream')
        
        const moshi = new MoshiClient({ host: 'localhost', port: 8998, mock: true })
        moshi.connect()

        moshi.on('audio', (audioChunk: Buffer) => {
           connection.socket.send(audioChunk)
        })

        connection.socket.on('message', (message: Buffer) => {
          moshi.sendAudioChunk(message)
        })

        connection.socket.on('close', () => {
          fastify.log.info('Client disconnected')
          moshi.disconnect()
        })
      })
    })

    // 4. Start Server
    await server.listen({ port: 8000, host: '0.0.0.0' })
    console.log('Server listening on http://localhost:8000')
  } catch (err) {
    server.log.error(err)
    process.exit(1)
  }
}

start()
