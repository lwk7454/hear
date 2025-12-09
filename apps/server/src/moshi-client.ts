import { EventEmitter } from 'events'

export class MoshiClient extends EventEmitter {
  private isConnected: boolean = false
  private mockMode: boolean = true

  constructor(options: { host: string; port: number; mock?: boolean }) {
    super()
    this.mockMode = options.mock ?? true
  }

  public connect() {
    if (this.mockMode) {
      this.isConnected = true
      // Simulate Moshi "Ready" state
      setTimeout(() => {
        this.emit('ready')
        console.log('[MoshiClient] Mock Connection Established')
      }, 500)
      return
    }
    // TODO: Implement Real ZMQ/WebSocket to Python Service
  }

  public sendAudioChunk(pcm: Buffer) {
    if (!this.isConnected) return

    if (this.mockMode) {
      // Simulate Inference Latency (e.g. 200ms)
      // Then "Echo" back with a twist or just standard echo for loopback test
      // To really test "generation", we could send back a generated sine wave 
      // but simple echo is enough to prove the pipe is 100% open.
      
      // Let's add a small random delay to simulate network jitter
      const latency = Math.floor(Math.random() * 50) + 150 
      
      setTimeout(() => {
        this.emit('audio', pcm)
      }, latency)
    }
  }

  public disconnect() {
    this.isConnected = false
    console.log('[MoshiClient] Disconnected')
  }
}
