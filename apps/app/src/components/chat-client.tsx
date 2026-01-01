"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ArrowLeft, Mic, Phone, SendHorizontal, MoreVertical } from "lucide-react"
import Link from "next/link"

export function ChatClient({ creatorId }: { creatorId: string }) {
  const [mode, setMode] = React.useState<"text" | "voice_tier1" | "voice_tier2">("text")
  
  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b bg-background/80 backdrop-blur z-10">
        <div className="flex items-center gap-3">
          <Link href={`/c/${creatorId}`}>
            <ArrowLeft className="h-6 w-6 text-muted-foreground" />
          </Link>
          <div className="flex items-center gap-2">
            <div className="relative">
              <div className="w-8 h-8 rounded-full bg-secondary overflow-hidden">
                <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${creatorId}`} alt="Avatar" />
              </div>
              <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-background" />
            </div>
            <div>
               <h1 className="font-semibold text-sm">{creatorId}</h1>
               <p className="text-xs text-green-500 font-medium">Online</p>
            </div>
          </div>
        </div>
        <div className="flex gap-1">
           <Button variant="ghost" size="icon" onClick={() => setMode(mode === 'text' ? 'voice_tier2' : 'text')}>
              <Phone className={`h-5 w-5 ${mode === 'voice_tier2' ? 'fill-current text-green-500' : ''}`} />
           </Button>
           <Button variant="ghost" size="icon">
              <MoreVertical className="h-5 w-5" />
           </Button>
        </div>
      </header>

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="flex justify-start">
           <div className="bg-secondary rounded-2xl rounded-tl-sm p-3 max-w-[80%]">
             <p className="text-sm">Hello! How are you doing today? 👋</p>
           </div>
        </div>
        <div className="flex justify-end">
           <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-sm p-3 max-w-[80%]">
             <p className="text-sm">I'm doing great, thanks for asking!</p>
           </div>
        </div>
        
        {mode === 'voice_tier2' && (
           <div className="absolute inset-x-0 bottom-0 top-16 bg-background/95 backdrop-blur-sm flex flex-col items-center justify-center z-20 transition-all duration-500">
               <div className="w-32 h-32 rounded-full bg-primary/10 flex items-center justify-center animate-pulse mb-8">
                  <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center">
                     <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${creatorId}`} alt="Avatar" className="w-20 h-20 rounded-full" />
                  </div>
               </div>
               <h2 className="text-2xl font-bold mb-2">Talking with {creatorId}</h2>
               <p className="text-muted-foreground animate-pulse">Listening...</p>
               
               <div className="mt-12 flex gap-4">
                  <Button size="lg" variant="destructive" className="rounded-full w-16 h-16" onClick={() => setMode('text')}>
                     <Phone className="h-8 w-8 rotate-135" />
                  </Button>
               </div>
           </div>
        )}
      </main>
      
      {/* Footer / Input */}
      <footer className="p-3 border-t bg-background/80 backdrop-blur pb-8">
        <div className="flex items-center gap-2">
           <Button size="icon" variant="ghost" className="text-muted-foreground shrink-0">
             <Mic className="h-5 w-5" />
           </Button>
           <Input placeholder="Message..." className="rounded-full bg-secondary border-0" />
           <Button size="icon" className="rounded-full shrink-0">
             <SendHorizontal className="h-5 w-5" />
           </Button>
        </div>
      </footer>
    </div>
  )
}
