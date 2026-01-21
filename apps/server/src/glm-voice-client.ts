import { EventEmitter } from 'events'
import { env } from './env.js';
import WebSocket from 'ws'

export class GLMVoiceClient extends EventEmitter {
  private isConnected: boolean = false
  private mockMode: boolean = true
  private ws: WebSocket | null = null

  constructor(options: { host: string; port: number; mock?: boolean }) {
    super()
    this.mockMode = options.mock ?? true
  }

  public connect() {
    if (this.mockMode) {
      this.isConnected = true
      setTimeout(() => {
        this.emit('ready')
        console.log('[GLMVoiceClient] Mock Connection Established')
      }, 500)
      return
    }

    // Real WebSocket connection to GLM worker on RunPod
    this.ws = new WebSocket(`ws://${env.GLM_WORKER_HOST}:8003/ws/stream`)
    
    this.ws.on('open', () => {
      this.isConnected = true
      this.emit('ready')
      console.log('[GLMVoiceClient] Connected to GLM Worker')
    })

    this.ws.on('message', (data: Buffer) => {
      this.emit('audio', data)
    })

    this.ws.on('close', () => {
      this.isConnected = false
      console.log('[GLMVoiceClient] Connection closed')
    })
  }

  public sendAudioChunk(pcm: Buffer) {
    if (!this.isConnected) return

    if (this.mockMode) {
      const latency = Math.floor(Math.random() * 50) + 150 
      setTimeout(() => {
        this.emit('audio', pcm)
      }, latency)
      return
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(pcm)
    }
  }

  public stopGeneration() {
    // Signal the model to stop (pseudo-duplex interruption)
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'STOP' }))
    }
  }

  public disconnect() {
    this.isConnected = false
    if (this.ws) {
      this.ws.close()
    }
    console.log('[GLMVoiceClient] Disconnected')
  }
}
