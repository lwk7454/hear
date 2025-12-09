"use client"

import { useState } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export function CreatorDashboard() {
  const [url, setUrl] = useState('')
  const [status, setStatus] = useState<'idle' | 'processing' | 'ready'>('idle')
  const [persona, setPersona] = useState<any>(null)

  const handleIngest = async () => {
    setStatus('processing')
    try {
      // Call Node.js Backend
      const res = await fetch('http://localhost:8000/ingest/youtube', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creatorId: 'test-user', url })
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
    <div className="w-full max-w-4xl mx-auto p-6 space-y-8">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-bold tracking-tight">Creator Studio</h2>
        <p className="text-muted-foreground">Train your Digital Twin by ingesting your content.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ingestion Source</CardTitle>
            <CardDescription>Add a link to your YouTube channel or video.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Input 
                placeholder="https://youtube.com/watch?v=..." 
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            <Button 
                onClick={handleIngest} 
                disabled={status === 'processing' || !url}
                className="w-full"
            >
              {status === 'processing' ? 'Analyzing Transcript...' : 'Ingest & Train'}
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-muted/50">
          <CardHeader>
            <CardTitle>Digital Twin Status</CardTitle>
            <CardDescription>Your persona's current brain state.</CardDescription>
          </CardHeader>
          <CardContent>
            {status === 'idle' && (
                <div className="flex items-center justify-center h-32 text-muted-foreground">
                    Waiting for data...
                </div>
            )}
            {status === 'processing' && (
                <div className="flex items-center justify-center h-32 text-blue-500 animate-pulse">
                    Processing 1 video...
                </div>
            )}
            {status === 'ready' && persona && (
                <div className="space-y-4 animate-in fade-in-0">
                    <div>
                        <span className="text-xs font-semibold uppercase text-muted-foreground">Tone</span>
                        <div className="text-lg font-medium">{persona.style.tone}</div>
                    </div>
                    <div>
                        <span className="text-xs font-semibold uppercase text-muted-foreground">Known Facts</span>
                        <ul className="list-disc list-inside text-sm">
                            {persona.facts.map((f: string, i: number) => (
                                <li key={i}>{f}</li>
                            ))}
                        </ul>
                    </div>
                    <div className="pt-2">
                        <Button variant="outline" size="sm" className="w-full">
                            Edit Rules
                        </Button>
                    </div>
                </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
