"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { LayoutDashboard, MessageSquareText, LogOut, Settings } from "lucide-react"
import { API_BASE_URL } from "@/lib/api"

export function CreatorNav() {
  const pathname = usePathname()

  const links = [
    {
      href: "/creator",
      label: "Dashboard",
      icon: LayoutDashboard,
      active: pathname === "/creator"
    },
    {
      href: "/creator/twin",
      label: "Test Twin",
      icon: MessageSquareText,
      active: pathname === "/creator/twin"
    }
  ]

  return (
    <nav className="flex items-center justify-between p-4 border-b bg-background">
      <div className="flex items-center gap-6">
        <Link href="/creator" className="font-bold text-xl tracking-tight">
          Hear<span className="text-primary">.</span>Creator
        </Link>
        <div className="flex items-center gap-2">
          {links.map((link) => (
            <Link key={link.href} href={link.href}>
              <Button
                variant={link.active ? "secondary" : "ghost"}
                size="sm"
                className="gap-2"
              >
                <link.icon className="w-4 h-4" />
                {link.label}
              </Button>
            </Link>
          ))}
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        <Button 
            variant="ghost" 
            size="sm" 
            className="text-muted-foreground hover:text-foreground gap-2"
            onClick={async () => {
                  try {
                    await fetch(`${API_BASE_URL}/auth/logout`, { method: 'POST', credentials: 'include' });
                  } catch (e) {
                      console.error("Logout failed", e)
                  }
                  window.location.href = '/';
            }}
        >
            <LogOut className="w-4 h-4" />
            Logout
        </Button>
      </div>
    </nav>
  )
}
