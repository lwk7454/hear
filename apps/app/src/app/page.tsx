import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Search, Globe, Zap, Heart } from "lucide-react"
import Link from "next/link"

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b p-4">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
          Hear.
        </h1>
      </header>

      <main className="p-4 space-y-6">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Find your favorite creator..." className="pl-9 bg-secondary/50 border-0" />
        </div>

        {/* Categories */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Explore</h2>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            {["Trending", "New", "Gaming", "Music", "Tech"].map((cat) => (
              <Button key={cat} variant="outline" className="rounded-full flex-shrink-0">
                {cat}
              </Button>
            ))}
          </div>
        </section>

        {/* Featured Creators */}
        <section>
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold">Featured Creators</h2>
            <Link href="#" className="text-sm text-primary">View all</Link>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            {/* Mock Data */}
            {[1, 2, 3, 4].map((i) => (
              <Link href={`/c/creator-${i}`} key={i}>
                <Card className="overflow-hidden border-0 bg-secondary/30 hover:bg-secondary/50 transition-colors">
                  <div className="aspect-square bg-muted relative">
                    <img 
                      src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${i}`} 
                      alt="Avatar"
                      className="object-cover w-full h-full"
                    />
                    <div className="absolute bottom-2 right-2 bg-green-500 w-3 h-3 rounded-full border-2 border-background" />
                  </div>
                  <CardContent className="p-3">
                    <h3 className="font-semibold truncate">Creator {i}</h3>
                    <p className="text-xs text-muted-foreground truncate">Gaming & Lifestyle</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>

        {/* Recent Activity */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Continue Chatting</h2>
          <div className="space-y-3">
             <Link href="/chat/creator-1">
                <Card className="flex items-center p-3 gap-3 border-0 bg-secondary/20">
                  <div className="w-10 h-10 rounded-full bg-muted overflow-hidden">
                     <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=1" alt="Avatar" />
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <h4 className="font-medium text-sm">Creator 1</h4>
                    <p className="text-xs text-muted-foreground truncate">That sounds awesome! Let's do it.</p>
                  </div>
                  <span className="text-xs text-muted-foreground">2m</span>
                </Card>
             </Link>
          </div>
        </section>
      </main>

      {/* Bottom Nav Placeholder */}
      <nav className="fixed bottom-0 left-0 right-0 border-t bg-background/80 backdrop-blur-lg h-16 flex items-center justify-around text-muted-foreground">
        <Button variant="ghost" size="icon" className="text-primary"><Globe className="h-6 w-6" /></Button>
        <Button variant="ghost" size="icon"><Zap className="h-6 w-6" /></Button>
        <Button variant="ghost" size="icon"><Heart className="h-6 w-6" /></Button>
      </nav>
    </div>
  );
}
