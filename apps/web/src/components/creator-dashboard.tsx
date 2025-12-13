"use client"

import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "sonner"

export function CreatorDashboard() {
  const [status, setStatus] = useState<'idle' | 'processing' | 'ready'>('idle')
  const [url, setUrl] = useState('')
  const [videos, setVideos] = useState<any[]>([])
  const [isEnrolled, setIsEnrolled] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const searchParams = useSearchParams()
  const router = useRouter()

  const refreshVideos = () => {
    fetch('http://localhost:8000/ingest/list', { credentials: 'include' })
        .then(r => r.json())
        .then(json => {
            if (json.status === 'success') {
                // Sort by date desc if needed, or rely on backend
                setVideos(json.data.items || []);
            }
        })
        .catch(e => console.error("Failed to load items", e));
  }
  
  // Check Session & Fetch Data
  useEffect(() => {
    fetch('http://localhost:8000/auth/me', { credentials: 'include' })
        .then(res => res.json())
        .then(data => {
            if (!data.authenticated) {
                window.location.href = '/login';
            } else {
                // Fetch existing videos
                refreshVideos();
                
                // Fetch Voice Status
                fetch('http://localhost:8000/voice/status', { credentials: 'include' })
                    .then(r => r.json())
                    .then(json => {
                        if (json.status === 'success' && json.enrolled) {
                            setIsEnrolled(true);
                        }
                    })
                    .catch(e => console.error("Failed to voice status", e));
            }
        })
        .catch(() => window.location.href = '/login');
  }, []);

  const handleVoiceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files?.[0]) return;
      
      const file = e.target.files[0];
      const formData = new FormData();
      formData.append('file', file);
      
      try {
          // Optimistic
          setStatus('processing');
          const res = await fetch('http://localhost:8000/voice/enroll', {
              method: 'POST',
              credentials: 'include',
              body: formData // No Content-Type header, browser sets it with boundary
          });
          const json = await res.json();
          if (json.status === 'success') {
              setIsEnrolled(true);
              toast.success("Voice Enrolled Successfully!");
          } else {
              toast.error("Failed: " + json.error);
          }
      } catch (e) {
          console.error(e);
          toast.error("Error uploading voice");
      } finally {
          setStatus('idle');
      }
  }

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
                setVideos(json.data.items || [])
                setStatus('ready')
                router.replace('/creator')
            }
        })
        .catch(e => {
            console.error(e)
            setStatus('idle')
        })
    }
  }, [searchParams, router])

  const handleQueueParams = async (id: string) => {
      // Optimistic Update
      setVideos((prev: any[]) => prev.map((v: any) => v.id === id ? { ...v, status: 'PROCESSING' } : v))
      
      try {
          await fetch(`http://localhost:8000/ingest/queue/${id}`, { method: 'POST', credentials: 'include' });
          // Poll or wait for websocket in future. For now, just set to COMPLETED after a timeout? 
          // Actually, let's keep it processing until reload or polling impl.
          // Triggering a re-fetch of the list would be ideal but lightweight for now.
      } catch (e) {
          console.error(e);
          setVideos((prev: any[]) => prev.map((v: any) => v.id === id ? { ...v, status: 'FAILED' } : v))
      }
  }

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
      
      if (['success', 'queued', 'exists'].includes(json.status)) {
        if (json.status === 'exists') {
             toast.info("This video is already in your library.");
        } else {
             refreshVideos();
             toast.success("Video added to queue!");
        }
        setUrl('');
        setStatus('ready')
      } else {
        const errMsg = typeof json.error === 'object' ? JSON.stringify(json.error) : json.error;
        throw new Error(errMsg || "Unknown error")
      }
    } catch (e) {
      console.error(e)
      setStatus('idle')
    }
  }

  const handleDelete = async (id: string) => {
      if (!confirm("Are you sure? This will delete all data for this item.")) return;
       setVideos(prev => prev.filter(v => v.id !== id));
       try {
           const res = await fetch(`http://localhost:8000/ingest/item/${id}`, { method: 'DELETE', credentials: 'include' });
           if (!res.ok) throw new Error("Delete failed");
       } catch (e) {
           console.error(e);
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
        <div className="lg:col-span-1 space-y-4">
             {/* Voice Identity Card */}
             <Card>
                <CardHeader>
                    <CardTitle>Voice Identity</CardTitle>
                    <CardDescription>Enroll your "Golden Sample" for voice cloning.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${isEnrolled ? 'bg-green-500' : 'bg-red-500'}`}></div>
                        <span className="text-sm font-medium">{isEnrolled ? "Voice Enrolled" : "Not Enrolled"}</span>
                    </div>
                    
                    {!isEnrolled && (
                        <p className="text-xs text-muted-foreground">
                            Upload a 10s recording of your voice to filter ingested content.
                        </p>
                    )}

                    <div className="grid w-full max-w-sm items-center gap-1.5">
                        <Input 
                            ref={fileInputRef}
                            type="file" 
                            accept="audio/*" 
                            onChange={handleVoiceUpload}
                            disabled={status === 'processing'}
                        />
                    </div>
                </CardContent>
             </Card>

             {/* Connection Card */}
            <Card>
                <CardHeader>
                    <CardTitle>Connections</CardTitle>
                    <CardDescription>Connect platforms to scan.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Button variant="outline" className="w-full justify-start gap-2" 
                        disabled={!isEnrolled}
                        onClick={async () => {
                            const res = await fetch('http://localhost:8000/auth/youtube/url', { method: 'GET', headers: { 'Accept': 'application/json' } , credentials: 'include' });
                            if (res.status === 401) { window.location.href = '/login'; return; }
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
                        disabled={!isEnrolled}
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

             {/* Manual Link Card */}
             <Card>
                <CardHeader>
                     <CardTitle>Quick Link</CardTitle>
                     <CardDescription>Ingest single video URL</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                     <Input placeholder="https://youtube.com/..." value={url} onChange={(e) => setUrl(e.target.value)} disabled={!isEnrolled} />
                     <Button onClick={handleIngest} disabled={status === 'processing' || !isEnrolled} className="w-full">Ingest</Button>
                </CardContent>
             </Card>
        </div>

        <div className="lg:col-span-2 space-y-6">
            <h3 className="text-xl font-semibold">Library ({videos.length})</h3>
            
            {status === 'processing' && videos.length === 0 && (
                 <div className="py-12 flex flex-col items-center justify-center space-y-4 text-center">
                    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-muted-foreground">Scanning repository...</p>
                 </div>
            )}

            <div className="grid gap-4">
                {videos.map((video) => (
                    <Card key={video.id} className="overflow-hidden flex flex-col sm:flex-row">
                        <div className="sm:w-48 h-32 bg-muted relative shrink-0">
                            {video.thumbnail ? (
                                <img src={video.thumbnail} className="w-full h-full object-cover" alt={video.title}/>
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-muted-foreground">No Thumb</div>
                            )}
                            <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1 rounded">
                                {video.type}
                            </div>
                        </div>
                        <div className="p-4 flex flex-col justify-between flex-1">
                             <div>
                                 <h4 className="font-semibold line-clamp-1" title={video.title}>{video.title}</h4>
                                 <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{video.description}</div>
                                 <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                                     <span>👁 {parseInt(video.stats?.views || "0").toLocaleString()}</span>
                                     <span>👍 {parseInt(video.stats?.likes || "0").toLocaleString()}</span>
                                     <span>💬 {video.stats?.comments || 0} interactions</span>
                                 </div>
                             </div>
                             <div className="mt-4 flex items-center justify-between">
                                 <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${
                                     video.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                                     video.status === 'PROCESSING' ? 'bg-blue-100 text-blue-700' :
                                     'bg-gray-100 text-gray-500'
                                 }`}>
                                     {video.status || 'PENDING'}
                                 </span>
                                 
                                 <div className="flex gap-2">
                                     {video.status !== 'COMPLETED' && video.status !== 'PROCESSING' && (
                                         <Button size="sm" onClick={() => handleQueueParams(video.id)}>Ingest</Button>
                                     )}
                                     <Button size="sm" variant="destructive" onClick={() => handleDelete(video.id)}>
                                         Delete
                                     </Button>
                                 </div>
                             </div>
                        </div>
                    </Card>
                ))}
                
                {videos.length === 0 && status === 'ready' && (
                    <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                        No videos found. Try connecting your account.
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  )
}
