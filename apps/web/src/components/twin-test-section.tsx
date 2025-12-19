"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "sonner"
import { Play, Pause, Loader2, Send, Mic } from "lucide-react"

interface TwinTestSectionProps {
  creatorId: string,
  isEnrolled: boolean
}

interface Message {
    role: 'user' | 'assistant'
    text: string
    audioUrl?: string
}

export function TwinTestSection({ creatorId, isEnrolled }: TwinTestSectionProps) {
    const [messages, setMessages] = useState<Message[]>([
        { role: 'assistant', text: "Hello! I'm your digital twin. Test my voice here." }
    ])
    const [inputText, setInputText] = useState("")
    const [ttsText, setTtsText] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [playingUrl, setPlayingUrl] = useState<string | null>(null)
    
    // Audio Player Ref
    const audioRef = useRef<HTMLAudioElement | null>(null)
    
    useEffect(() => {
        audioRef.current = new Audio()
        
        const handleEnded = () => setPlayingUrl(null)
        const handleError = async (e: Event) => {
             const error = audioRef.current?.error;
             console.error("Audio Playback Error:", error, "Src:", audioRef.current?.src);
             
             // Auto-retry with localhost if 192.168... fails (common in dev envs)
             if (audioRef.current && audioRef.current.src.includes('192.168') && !audioRef.current.src.includes('retry=true')) {
                 const newUrl = audioRef.current.src.replace(/192\.168\.\d+\.\d+/, 'localhost') + "&retry=true";
                 console.log("Retrying with localhost:", newUrl);
                 audioRef.current.src = newUrl;
                 try {
                    await audioRef.current.play();
                    // If successful, update state
                    setPlayingUrl(newUrl); 
                    return;
                 } catch (retryError) {
                     console.error("Retry failed", retryError);
                 }
             }

             setPlayingUrl(null)
             toast.error(`Failed to play audio: ${error?.message || "Format not supported"}`)
        }
        
        audioRef.current.addEventListener('ended', handleEnded)
        audioRef.current.addEventListener('error', handleError)
        
        return () => {
            if (audioRef.current) {
                audioRef.current.removeEventListener('ended', handleEnded)
                audioRef.current.removeEventListener('error', handleError)
                audioRef.current.pause()
            }
        }
    }, [])

    const playAudio = (url: string) => {
        if (!audioRef.current) return
        
        if (playingUrl === url) {
            audioRef.current.pause()
            setPlayingUrl(null)
            return
        }

        audioRef.current.src = url
        audioRef.current.play()
            .then(() => setPlayingUrl(url))
            .catch(e => {
                console.error("Play failed", e)
                toast.error("Could not play audio. File might still be processing.")
            })
    }

    // Load History
    useEffect(() => {
        if (!creatorId) return;
        fetch(`http://localhost:8000/chat/history?creatorId=${creatorId}`, { credentials: 'include' })
            .then(res => res.json())
            .then(data => {
                if (data.status === 'success' && data.messages.length > 0) {
                    setMessages(data.messages)
                }
            })
            .catch(console.error)
    }, [creatorId])

    const handleClearChat = async () => {
         if (!confirm("Clear chat history?")) return;
         try {
             await fetch(`http://localhost:8000/chat/history?creatorId=${creatorId}`, { method: 'DELETE', credentials: 'include' });
             setMessages([]);
             toast.success("Chat history cleared");
         } catch (e) {
             toast.error("Failed to clear chat");
         }
    }

    const handleChatSend = async () => {
        if (!inputText.trim()) return
        if (!isEnrolled) {
            toast.error("Please enroll your voice first.")
            return
        }

        const userMsg = { role: 'user' as const, text: inputText }
        setMessages(prev => [...prev, userMsg])
        setInputText("")
        setIsLoading(true)

        try {
            const res = await fetch('http://localhost:8000/chat/text', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ text: userMsg.text, creatorId })
            })
            const data = await res.json()
            
            if (data.status === 'success') {
                const aiMsg = { 
                    role: 'assistant' as const, 
                    text: data.text, 
                    audioUrl: data.audioUrl 
                }
                setMessages(prev => [...prev, aiMsg])
                
                // Auto-play
                if (data.audioUrl) {
                    playAudio(data.audioUrl)
                }
            } else {
                throw new Error(data.error || "Chat failed")
            }
        } catch (e: any) {
            toast.error(e.message)
            setMessages(prev => [...prev, { role: 'assistant', text: "[Error: Failed to respond]" }])
        } finally {
            setIsLoading(false)
        }
    }

    const handleTtsRead = async () => {
        if (!ttsText.trim()) return
        if (!isEnrolled) {
            toast.error("Please enroll your voice first.")
            return
        }

        setIsLoading(true)
        try {
            const res = await fetch('http://localhost:8000/chat/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ text: ttsText, creatorId })
            })
            const data = await res.json()
            
            if (data.status === 'success' && data.audioUrl) {
                 playAudio(data.audioUrl)
            } else {
                 throw new Error(data.error || "Synthesis failed")
            }
        
        } catch (e: any) {
            toast.error(e.message)
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <Card className="flex flex-col h-[600px]">
            <CardHeader>
                <CardTitle>Test Your Twin</CardTitle>
                <CardDescription>Verify your cloned voice model in different scenarios.</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 p-0 overflow-hidden">
                <Tabs defaultValue="chat" className="flex flex-col h-full">
                    <div className="px-6">
                        <TabsList className="w-full">
                            <TabsTrigger value="chat" className="flex-1">Chat Interaction</TabsTrigger>
                            <TabsTrigger value="tts" className="flex-1">Read Aloud</TabsTrigger>
                        </TabsList>
                    </div>

                    <TabsContent value="chat" className="flex-1 flex flex-col p-6 h-full overflow-hidden data-[state=inactive]:hidden">
                         <div className="flex justify-end mb-2">
                                <Button variant="ghost" size="sm" onClick={handleClearChat} className="text-xs text-muted-foreground hover:text-destructive">
                                    Clear Chat History
                                </Button>
                          </div>
                         <div className="flex-1 pr-4 mb-4 overflow-y-auto">
                            <div className="space-y-4">
                                {messages.map((m, i) => (
                                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[80%] rounded-lg p-3 ${
                                            m.role === 'user' 
                                                ? 'bg-primary text-primary-foreground' 
                                                : 'bg-muted'
                                        }`}>
                                            <p className="text-sm">{m.text}</p>
                                            {m.audioUrl && (
                                                <Button 
                                                    variant="ghost" 
                                                    size="sm" 
                                                    className="mt-2 h-6 px-0 text-xs gap-1 hover:bg-transparent"
                                                    onClick={() => playAudio(m.audioUrl!)}
                                                >
                                                    {playingUrl === m.audioUrl ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                                                    {playingUrl === m.audioUrl ? "Pause Voice" : "Play Voice"}
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                {isLoading && (
                                    <div className="flex justify-start">
                                        <div className="bg-muted rounded-lg p-3 flex items-center gap-2">
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            <span className="text-xs text-muted-foreground">Thinking...</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                         </div>
                         <div className="flex gap-2">
                             <Input 
                                placeholder="Say something..." 
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && handleChatSend()}
                                disabled={isLoading}
                             />
                             <Button onClick={handleChatSend} disabled={isLoading || !inputText}>
                                 <Send className="w-4 h-4" />
                             </Button>
                         </div>
                    </TabsContent>

                    <TabsContent value="tts" className="flex flex-col p-6 space-y-4 data-[state=inactive]:hidden">
                        <div className="space-y-2">
                            <h3 className="text-sm font-medium">Text to Speech</h3>
                            <p className="text-xs text-muted-foreground">
                                Enter a paragraph to hear it read in your voice.
                            </p>
                        </div>
                        <Textarea 
                            className="flex-1 resize-none h-40" 
                            placeholder="Enter text here..."
                            value={ttsText}
                            onChange={(e) => setTtsText(e.target.value)}
                        />
                        <div className="flex justify-between items-center">
                             <span className="text-xs text-muted-foreground">{ttsText.length} chars</span>
                             <Button onClick={handleTtsRead} disabled={isLoading || !ttsText}>
                                 {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Mic className="w-4 h-4 mr-2" />}
                                 Read Aloud
                             </Button>
                        </div>
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    )
}
