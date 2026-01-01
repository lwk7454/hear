import { Button } from "@/components/ui/button"
import { MessageCircle, Phone, ArrowLeft, Share2 } from "lucide-react"
import Link from "next/link"

export const generateStaticParams = () => {
  return [{ slug: 'test' }];
};

export default async function CreatorProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  
  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Hero Image */}
      <div className="relative h-80 w-full">
        <img 
          src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${slug}`} 
          alt="Creator Cover" 
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
        
        <Link href="/" className="absolute top-4 left-4 p-2 bg-background/50 backdrop-blur rounded-full">
           <ArrowLeft className="h-6 w-6" />
        </Link>
        <button className="absolute top-4 right-4 p-2 bg-background/50 backdrop-blur rounded-full">
           <Share2 className="h-6 w-6" />
        </button>
      </div>

      {/* Info */}
      <div className="px-5 -mt-12 relative z-10">
        <div className="flex justify-between items-end mb-4">
           <div>
              <h1 className="text-3xl font-bold">{slug}</h1>
              <p className="text-muted-foreground">@the_real_{slug}</p>
           </div>
           <Button className="rounded-full px-6">Follow</Button>
        </div>

        {/* Stats */}
        <div className="flex gap-6 mb-6 text-sm">
           <div className="flex flex-col">
              <span className="font-bold">128k</span>
              <span className="text-muted-foreground">Followers</span>
           </div>
           <div className="flex flex-col">
              <span className="font-bold">4.9</span>
              <span className="text-muted-foreground">Rating</span>
           </div>
           <div className="flex flex-col">
              <span className="font-bold">2.4m</span>
              <span className="text-muted-foreground">Messages</span>
           </div>
        </div>

        {/* Bio */}
        <div className="mb-8">
           <h3 className="font-semibold mb-2">About</h3>
           <p className="text-muted-foreground leading-relaxed">
             Hey there! I'm your virtual companion for gaming and late-night chats.
             I love discussing RPGs, tech trends, and horror movies. Let's hang out!
           </p>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-4">
           <Link href={`/chat/${slug}`} className="w-full">
             <Button className="w-full h-12 text-lg gap-2" size="lg">
               <MessageCircle className="h-5 w-5" />
               Chat
             </Button>
           </Link>
           <Button variant="secondary" className="w-full h-12 text-lg gap-2" size="lg">
             <Phone className="h-5 w-5" />
             Call
           </Button>
        </div>
      </div>
    </div>
  )
}
