"""
Bridge builder task generator.

Generates bridge builder task episodes with randomized bot behavior parameters.
"""

from typing import Dict
from .base_task_generator import BaseTaskGenerator


class BridgeBuilderTaskGenerator(BaseTaskGenerator):
    """
    Generates bridge builder task episodes.
    
    The bridge builder task involves both bots cooperatively building
    a bridge while maintaining eye contact and coordination.
    """
    
    def __init__(self, *args, **kwargs):
        """Initialize bridge builder task generator with task_name="bridgeBuilder" """
        super().__init__(task_name="bridgeBuilder", *args, **kwargs)
    
    def get_task_env_vars(self) -> Dict[str, str]:
        """Return bridge builder-specific environment variables as a dictionary"""
        return {
            "BRIDGE_BUILD_DURATION_MS": "20000",
            "BRIDGE_LENGTH": "8",
            "BRIDGE_BLOCK_PLACE_INTERVAL": "2000",
            "BRIDGE_EYE_CONTACT_DURATION": "1000",
            "BRIDGE_COORDINATION_CHECK_INTERVAL": "500",
            "BRIDGE_FOV_MAX": "120",
            "BRIDGE_D_MIN": "2.0",
            "BRIDGE_D_MAX": "10.0",
            "BRIDGE_CORRECTION_STRENGTH": "0.3"
        }
