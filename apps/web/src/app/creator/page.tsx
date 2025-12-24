import { CreatorDashboard } from "@/components/creator-dashboard"
import { Suspense } from "react"

export default function CreatorPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Suspense fallback={<div>Loading...</div>}>
        <CreatorDashboard />
      </Suspense>
    </div>
  )
}
