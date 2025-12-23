"use client"

import { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"
import { Trash2, Edit2, Check, X, Plus } from "lucide-react"
import { API_BASE_URL } from '@/lib/api'

interface Fact {
  id: string
  content: string
  status: 'ALLOWED' | 'FORBIDDEN' | 'EDITED'
  isManual: boolean
  createdAt: string
}

export function FactsManager() {
  const [facts, setFacts] = useState<Fact[]>([])
  const [loading, setLoading] = useState(true)
  const [newFactContent, setNewFactContent] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')

  const fetchFacts = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/facts`, { credentials: 'include' })
      const json = await res.json()
      if (json.status === 'success') {
        setFacts(json.facts || [])
      } else {
        toast.error("Failed to load facts: " + json.error)
      }
    } catch (e) {
      console.error(e)
      toast.error("Error loading facts")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchFacts()
  }, [])

  const handleAddFact = async () => {
    if (!newFactContent.trim()) return
    try {
      const res = await fetch(`${API_BASE_URL}/facts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content: newFactContent })
      })
      const json = await res.json()
      if (json.status === 'success') {
        setFacts([json.fact, ...facts])
        setNewFactContent('')
        toast.success("Fact added!")
      } else {
        toast.error("Failed to add fact: " + json.error)
      }
    } catch (e) {
      console.error(e)
      toast.error("Error adding fact")
    }
  }

  const handleDeleteFact = async (id: string) => {
    if (!confirm("Delete this fact?")) return
    try {
      const res = await fetch(`${API_BASE_URL}/facts/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      })
      const json = await res.json()
      if (json.status === 'success') {
        setFacts(facts.filter(f => f.id !== id))
        toast.success("Fact deleted")
      } else {
        toast.error("Failed to delete fact: " + json.error)
      }
    } catch (e) {
      console.error(e)
      toast.error("Error deleting fact")
    }
  }

  const handleUpdateFact = async (id: string, updates: Partial<Fact>) => {
    try {
      const res = await fetch(`${API_BASE_URL}/facts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(updates)
      })
      const json = await res.json()
      if (json.status === 'success') {
        setFacts(facts.map(f => f.id === id ? json.fact : f))
        setEditingId(null)
        toast.success("Fact updated")
      } else {
        toast.error("Failed to update fact: " + json.error)
      }
    } catch (e) {
      console.error(e)
      toast.error("Error updating fact")
    }
  }

  const startEditing = (fact: Fact) => {
    setEditingId(fact.id)
    setEditContent(fact.content)
  }

  const cancelEditing = () => {
    setEditingId(null)
    setEditContent('')
  }

  if (loading) {
    return (
      <div className="py-12 flex flex-col items-center justify-center space-y-4">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="text-muted-foreground">Loading facts...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Add New Fact</CardTitle>
          <CardDescription>Manually add a piece of information for your persona.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea 
            placeholder="e.g. I worked at SpaceX for 5 years." 
            value={newFactContent}
            onChange={(e) => setNewFactContent(e.target.value)}
          />
          <Button onClick={handleAddFact} disabled={!newFactContent.trim()} className="w-full gap-2">
            <Plus className="w-4 h-4" /> Add Fact
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        <h3 className="text-xl font-semibold">Knowledge Base ({facts.length})</h3>
        {facts.map((fact) => (
          <Card key={fact.id} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex flex-col gap-4">
                {editingId === fact.id ? (
                  <div className="space-y-4">
                    <Textarea 
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="min-h-[100px]"
                    />
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="outline" onClick={cancelEditing} className="gap-1">
                        <X className="w-4 h-4" /> Cancel
                      </Button>
                      <Button size="sm" onClick={() => handleUpdateFact(fact.id, { content: editContent })} className="gap-1">
                        <Check className="w-4 h-4" /> Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between items-start gap-4">
                      <p className="text-sm leading-relaxed">{fact.content}</p>
                      <div className="flex gap-2 shrink-0">
                        <Button size="icon" variant="ghost" onClick={() => startEditing(fact)}>
                          <Edit2 className="w-4 h-4 text-muted-foreground hover:text-primary transition-colors" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => handleDeleteFact(fact.id)}>
                          <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive transition-colors" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex gap-2">
                        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${
                          fact.status === 'ALLOWED' ? 'bg-green-100 text-green-700' :
                          fact.status === 'FORBIDDEN' ? 'bg-red-100 text-red-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>
                          {fact.status}
                        </span>
                        {fact.isManual && (
                          <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-gray-100 text-gray-500">
                            MANUAL
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {fact.status !== 'ALLOWED' && (
                          <Button size="sm" variant="outline" className="text-[10px] h-7 px-2" onClick={() => handleUpdateFact(fact.id, { status: 'ALLOWED' })}>
                            Allow
                          </Button>
                        )}
                        {fact.status !== 'FORBIDDEN' && (
                          <Button size="sm" variant="outline" className="text-[10px] h-7 px-2 text-destructive hover:text-destructive" onClick={() => handleUpdateFact(fact.id, { status: 'FORBIDDEN' })}>
                            Forbid
                          </Button>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {facts.length === 0 && !loading && (
          <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
            No facts found. Ingest content or add facts manually.
          </div>
        )}
      </div>
    </div>
  )
}
