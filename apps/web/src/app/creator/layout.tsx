import { CreatorNav } from "@/components/creator-nav"

export default function CreatorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <CreatorNav />
      <main className="flex-1">
        {children}
      </main>
    </div>
  )
}
