import json
import os
import re
import random
import logging
from typing import Optional, Tuple, List

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class DynamicReferenceManager:
    """
    Manages reference audio selection with:
    - Per-user index.json loading from Supabase
    - LRU cache with size-based eviction (default 2GB)
    - Tag-based reference selection with priority support
    - Multi-version random selection for variety
    - Consistency bias to prefer recently used refs
    """
    def __init__(
        self, 
        cache_dir: str, 
        supabase_client=None, 
        bucket_name: str = "ref_audio", 
        max_cache_size_mb: int = 2048  # 2GB default
    ):
        """
        Args:
            cache_dir: Local directory to cache downloaded audio files (e.g. /tmp/ref_cache)
            supabase_client: Initialized Supabase client instance
            bucket_name: Supabase storage bucket name where references are stored
            max_cache_size_mb: Maximum size of the cache in MB (default 2GB)
        """
        self.cache_dir = cache_dir
        self.supabase = supabase_client
        self.bucket_name = bucket_name
        self.max_cache_size_bytes = max_cache_size_mb * 1024 * 1024
        
        # In-memory cache of user_id -> tag_map
        self.user_indexes = {} 
        self.user_data = {}  # user_id -> raw index list
        
        # Consistency tracking: last used ref per user
        self._last_used_ref = {}  # user_id -> (audio_filename, transcript)
        self._consistency_threshold = 0.3  # 30% chance to switch even if same emotion
        
        # Ensure cache dir exists
        os.makedirs(self.cache_dir, exist_ok=True)

    def _load_user_index(self, user_id: str) -> bool:
        """
        Loads index.json for a specific user.
        Tries memory -> disk cache -> supabase.
        """
        if user_id in self.user_indexes:
            return True
            
        local_index_path = os.path.join(self.cache_dir, user_id, "index.json")
        index_data = None
        
        # 1. Try Disk
        if os.path.exists(local_index_path):
            try:
                with open(local_index_path, 'r', encoding='utf-8') as f:
                    index_data = json.load(f)
            except Exception as e:
                logger.error(f"Failed to load cached index for {user_id}: {e}")
        
        # 2. Try Supabase if not on disk
        if not index_data and self.supabase:
            remote_path = f"{user_id}/index.json"
            logger.info(f"Downloading index for {user_id} from {remote_path}...")
            try:
                os.makedirs(os.path.dirname(local_index_path), exist_ok=True)
                with open(local_index_path, 'wb') as f:
                    response = self.supabase.storage.from_(self.bucket_name).download(remote_path)
                    f.write(response)
                
                with open(local_index_path, 'r', encoding='utf-8') as f:
                    index_data = json.load(f)
            except Exception as e:
                logger.error(f"Failed to download index for {user_id}: {e}")
                
        if index_data:
            # Build tag map with priority support
            tag_map = {}
            for entry in index_data:
                priority = entry.get('priority', 5)  # Default priority 5
                for tag in entry.get('tags', []):
                    key = tag.strip("[] ")
                    if key not in tag_map or tag_map[key].get('priority', 5) < priority:
                        tag_map[key] = entry
            
            self.user_indexes[user_id] = tag_map
            self.user_data[user_id] = index_data
            return True
            
        return False

    def get_reference(
        self, 
        text_chunk: str, 
        user_id: str = "user_1",
        prefer_consistency: bool = True
    ) -> Tuple[Optional[str], Optional[str]]:
        """
        Parses the text chunk for emotion tags and returns the best matching reference.
        
        Features:
        - Priority-based selection (higher priority refs preferred)
        - Consistency bias (prefers recently used ref)
        - Multi-version random selection for variety
        
        Args:
            text_chunk: Text with potential [EmotionTag] prefix
            user_id: User ID for per-user references
            prefer_consistency: If True, bias toward recently used ref
            
        Returns:
            (local_audio_path, transcript) tuple
        """
        if not self._load_user_index(user_id):
            logger.warning(f"Could not load index for user {user_id}")
            return None, None
            
        tag_map = self.user_indexes[user_id]
        raw_data = self.user_data[user_id]
        
        # 1. Find target based on emotion tag
        target_entry = None
        detected_tag = None
        matches = re.findall(r'\[(.*?)\]', text_chunk)
        for match in matches:
            clean_tag = match.strip()
            if clean_tag in tag_map:
                target_entry = tag_map[clean_tag]
                detected_tag = clean_tag
                break
        
        # 2. If no tag match, prefer highest priority entry (usually "Normal")
        if not target_entry and raw_data:
            # Sort by priority descending, pick highest
            sorted_entries = sorted(raw_data, key=lambda x: x.get('priority', 5), reverse=True)
            target_entry = sorted_entries[0] if sorted_entries else None
        
        if not target_entry:
            return None, None
        
        # 3. Check consistency preference
        last_ref = self._last_used_ref.get(user_id)
        if prefer_consistency and last_ref:
            last_audio, last_transcript = last_ref
            # If same tag or close enough, consider reusing
            if detected_tag is None or random.random() > self._consistency_threshold:
                # Check if last ref still valid
                last_path = os.path.join(self.cache_dir, f"{user_id}/{last_audio}")
                if os.path.exists(last_path):
                    logger.debug(f"Reusing last reference for consistency: {last_audio}")
                    return last_path, last_transcript

        # 4. Handle multi-version selection
        variants = target_entry.get('variants', [target_entry.get('audio_filename')])
        if not variants:
            variants = [target_entry.get('audio_filename')]
        
        # Random selection from variants for variety
        audio_filename = random.choice(variants) if variants else target_entry.get('audio_filename')
        
        if not audio_filename:
            return None, None
            
        # Construct full path: user_id/ref_0.wav
        full_audio_name = f"{user_id}/{audio_filename}"
        transcript = target_entry.get('transcript', '')
        local_path = os.path.join(self.cache_dir, full_audio_name)

        # 5. Check Cache
        if os.path.exists(local_path):
            try:
                os.utime(local_path, None)  # Touch for LRU
            except OSError:
                pass
            self._last_used_ref[user_id] = (audio_filename, transcript)
            return local_path, transcript

        # 6. Download from Supabase
        if self.supabase:
            logger.info(f"Downloading {full_audio_name}...")
            try:
                self._cleanup_cache()
                os.makedirs(os.path.dirname(local_path), exist_ok=True)

                with open(local_path, 'wb') as f:
                    response = self.supabase.storage.from_(self.bucket_name).download(full_audio_name)
                    f.write(response)
                
                logger.info(f"Downloaded {full_audio_name}")
                self._last_used_ref[user_id] = (audio_filename, transcript)
                return local_path, transcript
            except Exception as e:
                logger.error(f"Failed to download {full_audio_name}: {e}")
                if os.path.exists(local_path) and os.path.getsize(local_path) == 0:
                    os.remove(local_path)
                return None, None
        
        return None, None

    def _cleanup_cache(self):
        """
        Removes least recently used files if cache size exceeds limit.
        """
        try:
            files = []
            total_size = 0
            
            # Walk through all directories in cache
            for root, dirs, filenames in os.walk(self.cache_dir):
                for f in filenames:
                    path = os.path.join(root, f)
                    try:
                        stats = os.stat(path)
                        files.append((path, stats.st_mtime, stats.st_size))
                        total_size += stats.st_size
                    except OSError:
                        pass
            
            # If within limit, return
            if total_size <= self.max_cache_size_bytes:
                return

            # Sort by mtime (oldest first)
            files.sort(key=lambda x: x[1])
            
            # Target size: 90% of max limit (free up 10% buffer)
            target_size = self.max_cache_size_bytes * 0.9
            
            # Delete until under target size
            for path, mtime, size in files:
                if total_size <= target_size:
                    break
                
                try:
                    os.remove(path)
                    total_size -= size
                    logger.info(f"Evicted {os.path.basename(path)} from cache")
                except OSError as e:
                    logger.error(f"Error evicting {path}: {e}")

        except Exception as e:
            logger.error(f"Error during cache cleanup: {e}")

    def clear_consistency_state(self, user_id: Optional[str] = None):
        """
        Clear the consistency tracking state.
        Call this when switching reference audio to prevent style contamination.
        """
        if user_id:
            self._last_used_ref.pop(user_id, None)
        else:
            self._last_used_ref.clear()
