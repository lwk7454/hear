
import Link from 'next/link'
import { Button } from "@/components/ui/button"

export default function Home() {
  return (
    <div className="min-h-screen bg-black text-white selection:bg-rose-500/30 overflow-hidden">
        {/* Nav */}
        <nav className="absolute top-0 w-full z-50 p-6 flex justify-between items-center max-w-7xl mx-auto left-0 right-0">
            <div className="font-bold text-2xl tracking-tighter">Hear.</div>
            <Link href="/login">
                <Button variant="outline" className="rounded-full border-white/20 hover:bg-white/10">Creator Login</Button>
            </Link>
        </nav>

      {/* Background Gradients */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-purple-900/40 rounded-full blur-[120px]" />
        <div className="absolute top-[20%] right-[-10%] w-[40%] h-[40%] bg-rose-900/30 rounded-full blur-[120px]" />
      </div>

      <main className="relative z-10">
        {/* Hero Section */}
        <section className="flex flex-col items-center justify-center min-h-[90vh] p-8 text-center pt-32">
            <div className="space-y-8 max-w-4xl">
            <div className="inline-block px-3 py-1 text-xs font-medium tracking-wider text-rose-400 uppercase bg-rose-950/30 rounded-full border border-rose-900/50">
                For Creators
            </div>
            
            <h1 className="text-6xl md:text-8xl font-bold tracking-tighter leading-[1.1]">
                Clone your <br/>
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-400 to-purple-400">Digital Twin.</span>
            </h1>
            
            <p className="text-xl md:text-2xl text-neutral-400 max-w-2xl mx-auto leading-relaxed">
                Connect your YouTube & Instagram. We train a voice and text model that speaks just like you. 
                Scale your engagement infinitely.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-8">
                <Link href="/login">
                    <Button size="lg" className="bg-white text-black hover:bg-neutral-200 rounded-full px-10 text-lg h-14 font-semibold">
                    Get Started
                    </Button>
                </Link>
                <Button variant="outline" size="lg" className="border-white/20 hover:bg-white/10 rounded-full px-10 text-lg h-14">
                View Demo Profile
                </Button>
            </div>
            </div>
        </section>

        {/* Feature Grid */}
        <section className="py-24 px-8 max-w-7xl mx-auto border-t border-white/10">
            <div className="grid md:grid-cols-3 gap-12 text-left">
                <div className="space-y-4">
                    <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-2xl">🧠</div>
                    <h3 className="text-xl font-bold">Deep Behavior Scan</h3>
                    <p className="text-neutral-400">We analyze your titles, captions, and comments to understand exactly *how* you talk to your fans.</p>
                </div>
                <div className="space-y-4">
                     <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-2xl">🎙️</div>
                    <h3 className="text-xl font-bold">Voice Cloning (Tier 1)</h3>
                    <p className="text-neutral-400">High-fidelity voice synthesis that captures your cadence, tone, and filler words.</p>
                </div>
                <div className="space-y-4">
                     <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-2xl">⚡</div>
                    <h3 className="text-xl font-bold">Infinite Scale</h3>
                    <p className="text-neutral-400">Your twin can reply to 1,000 DMs while you sleep. Authentically you, fully automated.</p>
                </div>
            </div>
        </section>
      </main>
      
       <footer className="py-12 text-center text-neutral-600 text-sm border-t border-white/5">
          <p>© 2024 Hear Platform. All rights reserved.</p>
        </footer>
    </div>
  );
}
