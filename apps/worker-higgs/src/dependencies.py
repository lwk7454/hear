from typing import Optional
from .smart_generation import HiggsGenerator
from .reference_manager import DynamicReferenceManager

# Global Instances (Singletons)
generator: Optional[HiggsGenerator] = None
reference_manager: Optional[DynamicReferenceManager] = None
startup_error: Optional[str] = None
