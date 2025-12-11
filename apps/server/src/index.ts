import 'dotenv/config'
import Fastify, { FastifyInstance } from 'fastify'
import { authRoutes } from './routes/auth'
import cors from '@fastify/cors'
import websocket from '@fastify/websocket'
import jwt from '@fastify/jwt'
import cookie from '@fastify/cookie'
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
    await server.register(cors, { origin: true, credentials: true }) // Enable cookies
    await server.register(websocket)
    
    server.register(jwt, {
      secret: process.env.JWT_SECRET || 'supersecret123',
      cookie: {
        cookieName: 'token',
        signed: false
      }
    })
    server.register(cookie, {
        secret: process.env.COOKIE_SECRET || 'another-secret-123',
        parseOptions: {} 
    })

    // 2. Register Routes
    server.register(authRoutes)
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

        if (connection && connection.socket) {
            connection.socket.on('message', (message: Buffer) => {
                moshi.sendAudioChunk(message)
            })

            connection.socket.on('close', () => {
                fastify.log.info('Client disconnected')
                moshi.disconnect()
            })
        }
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
