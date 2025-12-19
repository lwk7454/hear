from supabase import create_client, Client
from .config import SUPABASE_URL, SUPABASE_KEY

class LazySupabase:
    def __init__(self, url, key):
        self._client = None
        self.url = url
        self.key = key
        
    def _ensure_client(self):
        if self._client:
            return self._client
            
        try:
            self._client = create_client(self.url, self.key)
            print("--> Supabase Client Initialized.")
            return self._client
        except Exception as e:
            print(f"--> Failed to init Supabase: {e}")
            return None

    def __getattr__(self, name):
        client = self._ensure_client()
        if client is None:
            raise AttributeError(f"Supabase client not available. Cannot access '{name}'.")
        return getattr(client, name)
        
    def __bool__(self):
        return self._ensure_client() is not None

supabase = LazySupabase(SUPABASE_URL, SUPABASE_KEY)
