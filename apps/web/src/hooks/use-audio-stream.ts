"use client"

import { useState, useEffect, useRef, useCallback } from 'react'
import { WS_BASE_URL } from '@/lib/api'

export function useAudioStream() {
  const [isConnected, setIsConnected] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const socketRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const inputRef = useRef<MediaStreamAudioSourceNode | null>(null)

  const connect = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN) return

    // Connect to Node.js Gateway
    const ws = new WebSocket(`${WS_BASE_URL}/ws/audio`)
    
    ws.onopen = () => {
      console.log('Connected to Audio Gateway')
      setIsConnected(true)
    }
    
    ws.onclose = () => {
      console.log('Disconnected from Audio Gateway')
      setIsConnected(false)
      setIsRecording(false)
    }

    // Handle incoming audio (The "Echo" or Moshi response)
    ws.onmessage = async (event) => {
      if (event.data instanceof Blob) {
        // Playback logic will go here (Buffer queue)
        // For MVP we just log
        // console.log('Received audio blob', event.data.size)
      }
    }

    socketRef.current = ws
  }, [])

  const startRecording = useCallback(async () => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 24000, // Moshi often likes 24kHz
      })
      
      const source = audioContext.createMediaStreamSource(stream)
      // BufferSize 4096 is ~170ms at 24kHz. 
      // 2048 is ~85ms. Let's aim low latency.
      const processor = audioContext.createScriptProcessor(2048, 1, 1)

      processor.onaudioprocess = (e) => {
        if (!socketRef.current) return
        
        const inputData = e.inputBuffer.getChannelData(0)
        
        // Convert Float32 to Int16
        const buffer = new ArrayBuffer(inputData.length * 2)
        const view = new DataView(buffer)
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]))
          view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
        }
        
        if (socketRef.current.readyState === WebSocket.OPEN) {
            socketRef.current.send(buffer)
        }
      }

      source.connect(processor)
      processor.connect(audioContext.destination) // Needed for Chrome to activate it

      inputRef.current = source
      processorRef.current = processor
      audioContextRef.current = audioContext
      setIsRecording(true)

    } catch (err) {
      console.error("Error accessing microphone:", err)
    }
  }, [])

  const stopRecording = useCallback(() => {
    if (processorRef.current) {
        processorRef.current.disconnect()
        processorRef.current = null
    }
    if (inputRef.current) {
        inputRef.current.disconnect()
        inputRef.current = null
    }
    if (audioContextRef.current) {
        audioContextRef.current.close()
        audioContextRef.current = null
    }
    setIsRecording(false)
  }, [])

  return { connect, isConnected, startRecording, stopRecording, isRecording }
}
