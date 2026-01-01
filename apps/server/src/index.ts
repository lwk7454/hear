import 'dotenv/config'
import Fastify, { FastifyInstance } from 'fastify'
import { authRoutes } from './routes/auth'
import { storageService } from './services/storage'
import cors from '@fastify/cors'
import websocket from '@fastify/websocket'
import jwt from '@fastify/jwt'
import cookie from '@fastify/cookie'
import fastifyMultipart from '@fastify/multipart'
import { GLMVoiceClient } from './glm-voice-client'
import { ingestionRoutes } from './ingestion'
import { voiceRoutes } from './routes/voice'
import { chatRoutes } from './routes/chat'
import { factRoutes } from './routes/facts'
import { RealTimeVAD } from "@ericedouard/vad-node-realtime"
import axios from 'axios'

let lastActiveAt = Date.now()
const IDLE_TIMEOUT = 15 * 60 * 1000 // 15 minutes
const CHECK_INTERVAL = 60 * 1000 // 1 minute

function updateActivity() {
  lastActiveAt = Date.now()
}

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
    const allowedOrigins = process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
      : [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:3001',
        'http://127.0.0.1:3001'
      ];

    await server.register(cors, {
      origin: allowedOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']
    }) // Enable cookies
    await server.register(fastifyMultipart, {
      attachFieldsToBody: true,
      limits: {
        fileSize: 100 * 1024 * 1024, // 100MB
      }
    })
    await server.register(websocket)

    // Activity Tracker Hook
    server.addHook('onRequest', async (request, reply) => {
      updateActivity()
    })

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
    server.register(voiceRoutes)
    server.register(chatRoutes)
    server.register(factRoutes)

    // 3. Register WebSocket Endpoint
    server.register(async function (fastify) {
      fastify.get('/ws/audio', { websocket: true }, async (connection, req) => {
        fastify.log.info('Client connected to audio stream')

        const glm = new GLMVoiceClient({ host: 'localhost', port: 8003, mock: true })
        glm.connect()

        let isAgentSpeaking = false

        glm.on('audio', (audioChunk: Buffer) => {
          isAgentSpeaking = true
            ; (connection as any).socket.send(audioChunk)
        })

        // Initialize VAD
        const vad = await RealTimeVAD.new({
          sampleRate: 16000,
          onSpeechStart: () => {
            if (isAgentSpeaking) {
              fastify.log.info('User interruption detected via VAD!')
              glm.stopGeneration()
              isAgentSpeaking = false
            }
          },
          onSpeechEnd: (audio: Float32Array) => {
            // User stopped speaking
          }
        })

        if (connection && (connection as any).socket) {
          (connection as any).socket.on('message', async (message: Buffer) => {
            // Convert Buffer to Float32Array for VAD (16kHz mono expected)
            // This assumes the client is sending 16-bit PCM
            const float32Array = new Float32Array(message.length / 2)
            for (let i = 0; i < float32Array.length; i++) {
              float32Array[i] = message.readInt16LE(i * 2) / 32768.0
            }

            // Process VAD
            await vad.processAudio(float32Array)

            // Proxy to GLM
            updateActivity()
            glm.sendAudioChunk(message)
          })

            (connection as any).socket.on('close', () => {
              fastify.log.info('Client disconnected')
              glm.disconnect()
            })
        }
      })
    })


    // 4. Start Server
    await storageService.ensureBucket();
    await server.listen({ port: 8000, host: '0.0.0.0' })
    console.log('Server listening on http://localhost:8000')

    // Auto-Stop Timer
    server.log.info({ idleTimeout: IDLE_TIMEOUT, checkInterval: CHECK_INTERVAL }, 'Auto-stop timer started')
    setInterval(async () => {
      const idleTime = Date.now() - lastActiveAt
      if (idleTime > IDLE_TIMEOUT) {
        const podId = process.env.SERVER_POD_ID || process.env.RUNPOD_POD_ID
        const apiKey = process.env.RUNPOD_API_KEY
        
        if (podId && apiKey) {
          server.log.info({ podId, idleTime }, 'Idle timeout reached. Stopping RunPod pod...')
          try {
            await axios.post(
              `https://api.runpod.io/graphql?api_key=${apiKey}`,
              {
                query: `mutation { podStop(input: { podId: "${podId}" }) { id } }`
              }
            )
            server.log.info('Pod stop mutation sent. Exiting...')
            process.exit(0)
          } catch (err: any) {
            server.log.error({ err: err.message }, 'Failed to stop RunPod pod')
          }
        } else {
          server.log.warn({ podId: !!podId, apiKey: !!apiKey }, 'Idle timeout reached but missing Pod ID or API Key. Skipping auto-stop.')
        }
      }
    }, CHECK_INTERVAL)
  } catch (err) {
    server.log.error(err)
    process.exit(1)
  }
}

start()
