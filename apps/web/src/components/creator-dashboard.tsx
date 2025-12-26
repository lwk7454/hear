"use client"

import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "sonner"
import { ExternalLink, Brain } from "lucide-react"
import { API_BASE_URL } from '@/lib/api'
import { FactsManager } from './facts-manager'

export function CreatorDashboard() {
  const [status, setStatus] = useState<'idle' | 'processing' | 'ready'>('idle')
  const [url, setUrl] = useState('')
  const [videos, setVideos] = useState<any[]>([])
  const [isEnrolled, setIsEnrolled] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [creator, setCreator] = useState<any>(null)
  const [bioName, setBioName] = useState('')
  const [bioCategory, setBioCategory] = useState('')
  const [voiceYoutubeUrl, setVoiceYoutubeUrl] = useState('')
  const searchParams = useSearchParams()
  const router = useRouter()

  const refreshVideos = () => {
    fetch(`${API_BASE_URL}/ingest/list`, { credentials: 'include' })
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
    fetch(`${API_BASE_URL}/auth/me`, { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (!data.authenticated) {
          window.location.href = '/login';
        } else {
          setCreator(data.creator)
          setIsAdmin(!!data.isAdmin)
          // Fetch existing videos
          refreshVideos();

          // Fetch Voice Status
          fetch(`${API_BASE_URL}/voice/status`, { credentials: 'include' })
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


  const handleVoiceYoutubeEnroll = async () => {
    if (!voiceYoutubeUrl) return;

    try {
      setStatus('processing');
      const res = await fetch(`${API_BASE_URL}/voice/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ youtubeUrl: voiceYoutubeUrl })
      });
      const json = await res.json();

      if (res.status === 202) {
        setVoiceYoutubeUrl('');
        setStatus('idle');
        toast.success("Enrollment started in background. Please refresh the page in a few minutes.");
      } else if (json.status === 'success') {
        setIsEnrolled(true);
        setVoiceYoutubeUrl('');
        setStatus('idle');
        toast.success("Voice Enrollment Completed!");
      } else {
        setStatus('idle');
        toast.error("Failed: " + json.error);
      }
    } catch (e) {
      console.error(e);
      setStatus('idle');
      toast.error("Error enrolling via YouTube");
    }
  }

  // Handle OAuth Callback Success
  useEffect(() => {
    const connected = searchParams.get('connected')
    if (connected) {
      setStatus('processing')
      // Trigger Discovery
      fetch(`${API_BASE_URL}/ingest/discover`, {
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
      await fetch(`${API_BASE_URL}/ingest/queue/${id}`, { method: 'POST', credentials: 'include' });
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
      const res = await fetch(`${API_BASE_URL}/ingest/youtube`, {
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
      const res = await fetch(`${API_BASE_URL}/ingest/item/${id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error("Delete failed");
    } catch (e) {
      console.error(e);
    }
  }

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setSelectedIds(newSet)
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === videos.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(videos.map(v => v.id)))
    }
  }

  const handleBatchIngest = async () => {
    if (selectedIds.size === 0) return;
    setStatus('processing')
    try {
      const res = await fetch(`${API_BASE_URL}/ingest/batch/queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ids: Array.from(selectedIds) })
      });
      const json = await res.json();
      if (json.status === 'success') {
        toast.success(json.msg || "Batch started");
        // Optimistic update
        setVideos(prev => prev.map(v => selectedIds.has(v.id) ? { ...v, status: 'PROCESSING' } : v));
        setSelectedIds(new Set()); // Clear selection
      } else {
        toast.error(json.error || "Batch failed");
      }
    } catch (e) {
      console.error(e);
      toast.error("Batch ingest error");
    } finally {
      setStatus('ready')
    }
  }

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedIds.size} items?`)) return;

    setStatus('processing')
    try {
      const res = await fetch(`${API_BASE_URL}/ingest/batch/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ids: Array.from(selectedIds) })
      });
      const json = await res.json();
      if (json.status === 'success') {
        toast.success(`Deleted ${json.count} items`);
        setVideos(prev => prev.filter(v => !selectedIds.has(v.id)));
        setSelectedIds(new Set());
      } else {
        toast.error(json.error || "Batch delete failed");
      }
    } catch (e) {
      console.error(e);
      toast.error("Batch delete error");
    } finally {
      setStatus('ready')
    }
  }

  return (
    <div className="w-full max-w-5xl mx-auto p-6 space-y-8">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
            <p className="text-muted-foreground">Manage your content and voice identity.</p>
          </div>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="facts" className="flex gap-2">
              <Brain className="w-4 h-4" /> Knowledge
            </TabsTrigger>
            {isAdmin && <TabsTrigger value="dev">Dev Tools</TabsTrigger>}
          </TabsList>

          <TabsContent value="overview" className="space-y-8">
            <div className="grid gap-8 lg:grid-cols-3">
              <div className="lg:col-span-1 space-y-6">
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
                        Provide a YouTube link of your voice (1-2 mins of clear speech) to enroll.
                      </p>
                    )}
                    <div className="space-y-4">
                      <div className="grid w-full max-w-sm items-center gap-1.5">
                        <label className="text-[10px] uppercase font-bold text-muted-foreground">YouTube URL</label>
                        <div className="flex gap-2">
                          <Input
                            placeholder="https://youtube.com/watch?v=..."
                            value={voiceYoutubeUrl}
                            onChange={(e) => setVoiceYoutubeUrl(e.target.value)}
                            disabled={status === 'processing'}
                          />
                          <Button size="sm" onClick={handleVoiceYoutubeEnroll} disabled={status === 'processing' || !voiceYoutubeUrl}>Enroll</Button>
                        </div>
                      </div>
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
                        const res = await fetch(`${API_BASE_URL}/auth/youtube/url`, { method: 'GET', headers: { 'Accept': 'application/json' }, credentials: 'include' });
                        if (res.status === 401) { window.location.href = '/login'; return; }
                        const { url } = await res.json();
                        window.location.href = url;
                      }}
                    >
                      <img src="/assets/youtube.svg" className="w-5 h-5" alt="YT" />
                      Connect YouTube
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full justify-start gap-2"
                      disabled={!isEnrolled}
                      onClick={async () => {
                        const res = await fetch(`${API_BASE_URL}/auth/instagram/url`, { method: 'GET', credentials: 'include' });
                        if (res.status === 401) {
                          window.location.href = '/login';
                          return;
                        }
                        const { url } = await res.json();
                        window.location.href = url;
                      }}
                    >
                      <img src="/assets/instagram.svg" className="w-5 h-5" alt="IG" />
                      Connect Instagram
                    </Button>
                  </CardContent>
                </Card>

                {/* Danger Zone */}
                <Card className="border-destructive/50">
                  <CardHeader>
                    <CardTitle className="text-destructive">Danger Zone</CardTitle>
                    <CardDescription>Irreversible actions.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button
                      variant="destructive"
                      className="w-full"
                      onClick={async () => {
                        if (!confirm("Are you ABSOLUTELY sure? This will delete ALL your training data, library items, and digital twin memory. This cannot be undone.")) return;
                        try {
                          setStatus('processing');
                          const res = await fetch(`${API_BASE_URL}/ingest/reset`, { method: 'DELETE', credentials: 'include' });
                          const json = await res.json();
                          if (json.status === 'success') {
                            toast.success("Twin data reset successfully.");
                            setVideos([]);
                            window.location.reload();
                          } else {
                            throw new Error(json.error || "Reset failed");
                          }
                        } catch (e: any) {
                          console.error(e);
                          toast.error(e.message || "Failed to reset data");
                        } finally {
                          setStatus('idle');
                        }
                      }}
                    >
                      Reset Digital Twin Data
                    </Button>
                  </CardContent>
                </Card>
              </div>

              <div className="lg:col-span-2 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-semibold">Library ({videos.length})</h3>
                  {videos.length > 0 && (
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                        checked={videos.length > 0 && selectedIds.size === videos.length}
                        onChange={toggleSelectAll}
                      />
                      <span className="text-sm text-muted-foreground mr-4">Select All</span>
                      {selectedIds.size > 0 && (
                        <>
                          <Button size="sm" variant="outline" onClick={handleBatchIngest}>
                            Ingest ({selectedIds.size})
                          </Button>
                          <Button size="sm" variant="destructive" onClick={handleBatchDelete}>
                            Delete ({selectedIds.size})
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {status === 'processing' && videos.length === 0 && (
                  <div className="py-12 flex flex-col items-center justify-center space-y-4 text-center">
                    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-muted-foreground">Scanning repository...</p>
                  </div>
                )}

                <div className="grid gap-4">
                  {videos.map((video) => (
                    <Card key={video.id} className={`overflow-hidden flex flex-col sm:flex-row transition-colors ${selectedIds.has(video.id) ? 'border-primary/50 bg-accent/5' : ''}`}>
                      <div className="p-2 flex items-start justify-center">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary mt-2 ml-2"
                          checked={selectedIds.has(video.id)}
                          onChange={() => toggleSelection(video.id)}
                        />
                      </div>
                      <div className="sm:w-48 h-32 bg-muted relative shrink-0">
                        {video.thumbnail ? (
                          <img src={video.thumbnail} className="w-full h-full object-cover" alt={video.title} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground">No Thumb</div>
                        )}
                        <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1 rounded">
                          {video.type}
                        </div>
                      </div>
                      <div className="p-4 flex flex-col justify-between flex-1 min-w-0">
                        <div>
                          <a href={video.url} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-2 hover:text-primary transition-colors">
                            <ExternalLink className="w-4 h-4 shrink-0" />
                            <h4 className="font-semibold line-clamp-1" title={video.title}>{video.title}</h4>
                          </a>
                          <div className="text-xs text-muted-foreground mt-1 line-clamp-2 break-all">{video.description}</div>
                          <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                            <span>👁 {parseInt(video.stats?.views || "0").toLocaleString()}</span>
                            <span>👍 {parseInt(video.stats?.likes || "0").toLocaleString()}</span>
                            <span>💬 {video.stats?.comments || 0} interactions</span>
                          </div>
                        </div>
                        <div className="mt-4 flex items-center justify-between">
                          <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${video.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                            video.status === 'PROCESSING' ? 'bg-blue-100 text-blue-700' :
                              'bg-gray-100 text-gray-500'
                            }`}>
                            {video.status || 'PENDING'}
                          </span>
                          <div className="flex gap-2">
                            {video.status !== 'COMPLETED' && video.status !== 'PROCESSING' && (
                              <Button size="sm" onClick={() => handleQueueParams(video.id)}>Ingest</Button>
                            )}
                            <Button size="sm" variant="destructive" onClick={() => handleDelete(video.id)}>Delete</Button>
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
          </TabsContent>

          <TabsContent value="facts" className="space-y-6">
            <FactsManager />
          </TabsContent>

          {isAdmin && (
            <TabsContent value="dev" className="space-y-6">
              <div className="grid gap-8 lg:grid-cols-2">
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Backend Health Check</CardTitle>
                      <CardDescription>Verify the server is up and database is connected.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button variant="outline" className="w-full" onClick={async () => {
                        try {
                          const res = await fetch(`${API_BASE_URL}/health`);
                          const json = await res.json();
                          toast.success(`Server is ${json.status}! Timestamp: ${json.timestamp}`);
                        } catch (e) {
                          toast.error("Server unreachable");
                        }
                      }}>Run Health Check</Button>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Manual Ingestion</CardTitle>
                      <CardDescription>Bypass automated scans and ingest any URL directly.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <Input placeholder="https://youtube.com/..." value={url} onChange={(e) => setUrl(e.target.value)} />
                      <Button onClick={handleIngest} disabled={status === 'processing' || !url} className="w-full">Ingest URL</Button>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Platform Rescan</CardTitle>
                      <CardDescription>Manually trigger a content scan for a connected platform.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          className="flex-1 gap-2"
                          onClick={() => {
                            setStatus('processing');
                            fetch(`${API_BASE_URL}/ingest/discover`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              credentials: 'include',
                              body: JSON.stringify({ platform: 'youtube' })
                            })
                              .then(r => r.json())
                              .then(json => {
                                if (json.status === 'success') {
                                  toast.success("YouTube scan completed!");
                                  refreshVideos();
                                } else {
                                  toast.error(json.error || "Scan failed");
                                }
                              })
                              .finally(() => setStatus('idle'));
                          }}
                        >
                          <img src="/assets/youtube.svg" className="w-4 h-4" alt="YT" />
                          Scan YouTube
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-1 gap-2"
                          onClick={() => {
                            setStatus('processing');
                            fetch(`${API_BASE_URL}/ingest/discover`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              credentials: 'include',
                              body: JSON.stringify({ platform: 'instagram' })
                            })
                              .then(r => r.json())
                              .then(json => {
                                if (json.status === 'success') {
                                  toast.success("Instagram scan completed!");
                                  refreshVideos();
                                } else {
                                  toast.error(json.error || "Scan failed");
                                }
                              })
                              .finally(() => setStatus('idle'));
                          }}
                        >
                          <img src="/assets/instagram.svg" className="w-4 h-4" alt="IG" />
                          Scan Instagram
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Bio Research Bypass</CardTitle>
                      <CardDescription>Test the Perplexity bio service for any public figure.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <Input placeholder="Full Name (e.g. Elon Musk)" value={bioName} onChange={(e) => setBioName(e.target.value)} />
                      <Input placeholder="Category (e.g. Technology)" value={bioCategory} onChange={(e) => setBioCategory(e.target.value)} />
                      <Button className="w-full" disabled={status === 'processing' || !bioName || !bioCategory}
                        onClick={async () => {
                          setStatus('processing');
                          try {
                            const res = await fetch(`${API_BASE_URL}/ingest/bio`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              credentials: 'include',
                              body: JSON.stringify({ category: bioCategory, overrideName: bioName })
                            });
                            const json = await res.json();
                            if (json.status === 'success') {
                              toast.success("Bio research triggered!");
                            } else {
                              toast.error(json.error || "Research failed");
                            }
                          } catch (e) {
                            toast.error("Network error");
                          } finally {
                            setStatus('idle');
                          }
                        }}>Trigger Bio Research</Button>
                    </CardContent>
                  </Card>

                  <Card className="border-yellow-500/50">
                    <CardHeader>
                      <CardTitle className="text-yellow-600">Dev Utilities</CardTitle>
                      <CardDescription>Quick actions for local development.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <Button variant="outline" className="w-full" onClick={() => window.location.reload()}>Force Hard Reload</Button>
                      <Button variant="outline" className="w-full" onClick={() => console.log({ videos, creator, isAdmin })}>Log Current State to Console</Button>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  )
}
