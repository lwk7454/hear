"use client"

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export function CreatorDashboard() {
  const [url, setUrl] = useState('')
  const [status, setStatus] = useState<'idle' | 'processing' | 'ready'>('idle')
  const [persona, setPersona] = useState<any>(null)
  
  const searchParams = useSearchParams()
  const router = useRouter()
  
  // Check Session
  useEffect(() => {
    fetch('http://localhost:8000/auth/me', { credentials: 'include' })
        .then(res => res.json())
        .then(data => {
            if (!data.authenticated) {
                window.location.href = '/login';
            }
        })
        .catch(() => window.location.href = '/login');
  }, []);

  // Handle OAuth Callback Success
  useEffect(() => {
    const connected = searchParams.get('connected')
    if (connected) {
        setStatus('processing')
        // Trigger Discovery
        fetch('http://localhost:8000/ingest/discover', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ 
                platform: connected, 
                // authCode not needed as token is in DB now
            })
        })
        .then(res => res.json())
        .then(json => {
            if (json.status === 'success') {
                // Merge data
                if (connected === 'instagram') {
                     setPersona((prev: any) => ({ 
                        ...prev, 
                        ig: {
                            source: "Instagram",
                            postsScanned: json.data.items.length,
                            style: { style: "Connected & Scanned" }
                        }
                    }))
                } else if (connected === 'youtube') {
                    // Just show a success state or similar
                     setPersona((prev: any) => ({ 
                        ...prev, 
                        yt: {
                            source: "YouTube",
                            videosScanned: json.data.items.length,
                            style: { style: "Connected & Scanned" }
                        }
                    }))
                }
                setStatus('ready')
                // Clean URL
                router.replace('/creator')
            }
        })
        .catch(e => {
            console.error(e)
            setStatus('idle')
        })
    }
  }, [searchParams, router])

  const handleIngest = async () => {
    setStatus('processing')
    try {
      // Call Node.js Backend
      const res = await fetch('http://localhost:8000/ingest/youtube', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ url })
      })
      const json = await res.json()
      
      if (json.status === 'success') {
        setPersona(json.data)
        setStatus('ready')
      } else {
        throw new Error(json.error)
      }
    } catch (e) {
      console.error(e)
      setStatus('idle')
    }
  }

  return (
    <div className="w-full max-w-5xl mx-auto p-6 space-y-8">
      <div className="flex flex-col gap-2 relative">
         <div className="flex items-center justify-between">
            <div>
                 <h2 className="text-3xl font-bold tracking-tight">Creator Studio</h2>
                 <p className="text-muted-foreground">Train your Digital Twin by ingesting your content.</p>
            </div>
            <Button variant="ghost" className="text-muted-foreground hover:text-foreground" onClick={async () => {
                 await fetch('http://localhost:8000/auth/logout', { method: 'POST', credentials: 'include' });
                 window.location.href = '/';
            }}>
                Logout
            </Button>
         </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
            <Tabs defaultValue="link" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="link">Quick Link (YouTube)</TabsTrigger>
                    <TabsTrigger value="oauth">Authorized Connect (Deep Scan)</TabsTrigger>
                </TabsList>
                
                <TabsContent value="link">
                    <Card>
                    <CardHeader>
                        <CardTitle>Single Video Ingest</CardTitle>
                        <CardDescription>Paste a YouTube link for a quick persona extraction.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Input 
                            placeholder="https://youtube.com/watch?v=..." 
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                        />
                        <Button 
                            onClick={handleIngest} 
                            disabled={status === 'processing' || !url}
                            className="w-full"
                        >
                        {status === 'processing' ? 'Analyzing...' : 'Ingest Video'}
                        </Button>
                    </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="oauth">
                    <Card>
                        <CardHeader>
                            <CardTitle>Platform Connections</CardTitle>
                            <CardDescription>Connect accounts for a deep repository scan.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Button variant="outline" className="w-full justify-start gap-2" 
                                onClick={async () => {
                                    // Use Session
                                    const res = await fetch('http://localhost:8000/auth/youtube/url', { method: 'GET', headers: { 'Accept': 'application/json' } , credentials: 'include' });
                                    if (res.status === 401) {
                                         window.location.href = '/login';
                                         return;
                                    }
                                    const { url } = await res.json();
                                    window.location.href = url;
                                }}
                            >
                                <img src="/assets/youtube.svg" className="w-5 h-5" alt="YT"/>
                                Connect YouTube
                            </Button>
                            <Button 
                                variant="outline" 
                                className="w-full justify-start gap-2"
                                onClick={async () => {
                                    const res = await fetch('http://localhost:8000/auth/instagram/url', { method: 'GET', credentials: 'include' });
                                     if (res.status === 401) {
                                         window.location.href = '/login';
                                         return;
                                    }
                                    const { url } = await res.json();
                                    window.location.href = url;
                                }}
                            >
                                <img src="/assets/instagram.svg" className="w-5 h-5" alt="IG"/>
                                Connect Instagram
                            </Button>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>

        <Card className="bg-muted/30">
          <CardHeader>
            <CardTitle>Twin Status</CardTitle>
            <CardDescription>Current capabilities.</CardDescription>
          </CardHeader>
          <CardContent>
            {status === 'idle' && (
                <div className="flex items-center justify-center h-48 text-muted-foreground text-sm border-2 border-dashed rounded-lg">
                    No active persona
                </div>
            )}
            {status === 'processing' && (
                <div className="flex flex-col items-center justify-center h-48 space-y-4">
                    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                    <div className="text-sm text-muted-foreground animate-pulse">Running DeepSeek Processor...</div>
                </div>
            )}
            {status === 'ready' && persona && (
                <div className="space-y-6 animate-in fade-in-0 slide-in-from-bottom-2">
                    {/* Brain Section */}
                    {persona.style && (
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Brain (DeepSeek)</span>
                                <span className="px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-600 text-[10px] font-medium">Active</span>
                            </div>
                            <div className="text-sm font-medium">{persona.style.tone}</div>
                            <div className="mt-1 flex flex-wrap gap-1">
                                {persona.style.keywords?.map((k: string) => (
                                    <span key={k} className="px-2 py-0.5 bg-background border rounded text-xs text-muted-foreground">#{k}</span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Voice Section */}
                    {persona.voice && (
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Voice Model</span>
                                <span className="px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-600 text-[10px] font-medium">
                                    {persona.voice.tier}
                                </span>
                            </div>
                            <div className="text-xs text-muted-foreground space-y-1">
                                <div className="flex justify-between">
                                    <span>Status</span>
                                    <span className="font-mono text-foreground">{persona.voice.status}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Voice ID</span>
                                    <span className="font-mono text-foreground">{persona.voice.voiceId}</span>
                                </div>
                            </div>
                            <div className="mt-3">
                                <audio controls className="w-full h-8" src={`http://localhost:8000/audio/${persona.voice.sample}`} />
                            </div>
                        </div>
                    )}

                    {/* Instagram Section (if connected) */}
                    {persona.ig && (
                        <div>
                             <div className="flex items-center gap-2 mb-2">
                                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Engagement</span>
                            </div>
                            <div className="p-3 bg-background rounded-md border text-xs">
                                <div className="font-semibold mb-1">{persona.ig.style.style}</div>
                                <div className="text-muted-foreground">Scanned {persona.ig.postsScanned} posts</div>
                            </div>
                        </div>
                    )}
                </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
