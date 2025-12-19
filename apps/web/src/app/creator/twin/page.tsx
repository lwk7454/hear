"use client"

import { useEffect, useState } from "react"
import { TwinTestSection } from "@/components/twin-test-section"

export default function TwinPage() {
    const [creatorId, setCreatorId] = useState<string | null>(null)
    const [isEnrolled, setIsEnrolled] = useState(false)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        // Fetch User & Voice Status
        Promise.all([
            fetch('http://localhost:8000/auth/me', { credentials: 'include' }).then(r => r.json()),
            fetch('http://localhost:8000/voice/status', { credentials: 'include' }).then(r => r.json())
        ]).then(([authData, voiceData]) => {
            if (authData.authenticated && authData.creator) {
                setCreatorId(authData.creator.id)
            } else {
                 window.location.href = '/login'
                 return
            }
            
            if (voiceData.status === 'success' && voiceData.enrolled) {
                setIsEnrolled(true)
            }
        }).catch(e => {
            console.error(e)
        }).finally(() => {
            setLoading(false)
        })
    }, [])

    if (loading) {
        return <div className="flex h-[calc(100vh-65px)] items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
    }

    if (!creatorId) return null

    return (
        <div className="container max-w-4xl mx-auto py-8 space-y-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">Test Digital Twin</h1>
                <p className="text-muted-foreground">
                    interact with your clone to verify voice quality and personality.
                </p>
            </div>

            <TwinTestSection creatorId={creatorId} isEnrolled={isEnrolled} />
        </div>
    )
}
