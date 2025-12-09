"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Mic, MicOff, Activity } from "lucide-react"
import { useAudioStream } from "@/hooks/use-audio-stream"

export function VoiceRoom() {
  const { connect, isConnected, startRecording, stopRecording, isRecording } = useAudioStream()

  React.useEffect(() => {
    connect()
  }, [connect])

  return (
    <div className="flex flex-col items-center gap-8 p-8 bg-neutral-900/50 rounded-3xl border border-white/10 backdrop-blur-md">
      <div className="relative">
        <div className={`w-32 h-32 rounded-full flex items-center justify-center transition-all duration-500 ${isRecording ? 'bg-rose-500/20 shadow-[0_0_50px_rgba(244,63,94,0.3)]' : 'bg-neutral-800'}`}>
          {isRecording ? (
            <Activity className="w-12 h-12 text-rose-500 animate-pulse" />
          ) : (
            <Mic className="w-12 h-12 text-neutral-400" />
          )}
        </div>
        {/* Simple ripple effect rings */}
        {isRecording && (
            <>
                <div className="absolute inset-0 rounded-full border border-rose-500/30 animate-ping opacity-75" />
                <div className="absolute inset-[-10px] rounded-full border border-rose-500/20 animate-pulse" />
            </>
        )}
      </div>

      <div className="flex flex-col items-center gap-2">
        <h3 className="text-xl font-medium text-white">
            {isRecording ? "Listening..." : "Tap to speak"}
        </h3>
        <p className="text-sm text-neutral-400">
            {isConnected ? "Connected to Gateway" : "Connecting..."}
        </p>
      </div>

      <div className="flex gap-4">
        {!isRecording ? (
             <Button 
                onClick={startRecording} 
                disabled={!isConnected}
                className="bg-white text-black hover:bg-neutral-200 rounded-full h-12 px-6"
             >
                <Mic className="w-4 h-4 mr-2" />
                Start Chat (Moshi)
             </Button>
        ) : (
            <Button 
                onClick={stopRecording} 
                variant="destructive"
                className="rounded-full h-12 px-6"
            >
                <MicOff className="w-4 h-4 mr-2" />
                Stop
             </Button>
        )}
      </div>
    </div>
  )
}
