import { Button } from "@/components/ui/button"
import { VoiceRoom } from "@/components/voice-room"

export default function Home() {
  return (
    <div className="min-h-screen bg-black text-white selection:bg-rose-500/30">
      {/* Background Gradients */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-900/40 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-rose-900/40 rounded-full blur-[120px]" />
      </div>

      <main className="relative z-10 flex flex-col items-center justify-center min-h-screen p-8 text-center">
        <div className="space-y-6 max-w-2xl">
          <div className="inline-block px-3 py-1 text-xs font-medium tracking-wider text-rose-400 uppercase bg-rose-950/30 rounded-full border border-rose-900/50 mb-4">
            AI Audio Companionship
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-b from-white to-white/60">
            Hear.
            <span className="block text-2xl md:text-3xl font-normal text-white/40 mt-4 tracking-normal">
              Feel the connection.
            </span>
          </h1>
          
          <p className="text-lg md:text-xl text-neutral-400 max-w-lg mx-auto leading-relaxed">
            Experience asynchronous voice conversations with your favorite creators. 
            Powered by advanced emotional intelligence.
          </p>

          <div className="flex justify-center pt-8 pb-8">
            <VoiceRoom />
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="bg-white text-black hover:bg-neutral-200 rounded-full px-8 text-lg h-12">
              Start Listening
            </Button>
            <Button variant="outline" size="lg" className="border-white/20 text-white hover:bg-white/10 rounded-full px-8 text-lg h-12">
              For Creators
            </Button>
          </div>
        </div>

        <div className="absolute bottom-8 text-neutral-600 text-sm">
          <p>v0.1.0 • Alpha</p>
        </div>
      </main>
    </div>
  );
}
