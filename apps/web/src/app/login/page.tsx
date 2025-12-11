
"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function LoginPage() {
  const handleGoogleLogin = async () => {
    // Fetch Google Login URL from Backend
    const res = await fetch('http://localhost:8000/auth/login/google');
    const { url } = await res.json();
    window.location.href = url;
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Welcome Back</CardTitle>
          <CardDescription>Login to your Creator Studio</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button 
            className="w-full flex items-center gap-2" 
            variant="outline"
            onClick={handleGoogleLogin}
          >
            <img src="/assets/google.svg" className="w-5 h-5" alt="G" />
            Login with Google
          </Button>
           <Button 
            className="w-full flex items-center gap-2" 
            variant="outline"
            disabled
          >
            <img src="/assets/facebook.svg" className="w-5 h-5" alt="F" />
            Login with Meta (Coming Soon)
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
