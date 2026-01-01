import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ""
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ""

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

serve(async (req) => {
  const url = new URL(req.url)
  let path = url.pathname.replace('/static-proxy', '')
  
  if (path === '/' || path === '') {
    path = '/index.html'
  }

  // Next.js static export often produces /login.html
  // Try direct path first, then with .html
  let filePath = path
  if (!filePath.includes('.')) {
    filePath += '.html'
  }

  // Remove leading slash for storage
  const storagePath = filePath.startsWith('/') ? filePath.slice(1) : filePath

  try {
    const { data, error } = await supabase.storage
      .from('web')
      .download(storagePath)

    if (error) {
      // If .html failed, maybe it's a real folder/index.html
      if (storagePath.endsWith('.html')) {
        const indexPath = storagePath.replace('.html', '/index.html')
        const { data: indexData, error: indexError } = await supabase.storage
          .from('web')
          .download(indexPath)
        
        if (!indexError) {
          return new Response(indexData, {
            headers: { "Content-Type": "text/html" }
          })
        }
      }
      
      return new Response("Not Found", { status: 404 })
    }

    const contentType = getContentType(storagePath)
    return new Response(data, {
      headers: { "Content-Type": contentType }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    })
  }
})

function getContentType(path: string): string {
  if (path.endsWith('.html')) return 'text/html'
  if (path.endsWith('.js')) return 'application/javascript'
  if (path.endsWith('.css')) return 'text/css'
  if (path.endsWith('.png')) return 'image/png'
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg'
  if (path.endsWith('.svg')) return 'image/svg+xml'
  if (path.endsWith('.json')) return 'application/json'
  return 'application/octet-stream'
}
