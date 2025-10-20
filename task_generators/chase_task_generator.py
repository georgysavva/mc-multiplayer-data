"""
Chase task generator.

Generates chase task episodes with randomized bot behavior parameters.
"""

from typing import Dict
from .base_task_generator import BaseTaskGenerator


class ChaseTaskGenerator(BaseTaskGenerator):
    """
    Generates chase task episodes.
    
    The chase task involves one bot chasing another bot while both record
    synchronized observations and actions.
    """
    
    def __init__(self, *args, **kwargs):
        """Initialize chase task generator with task_name="chase" """
        super().__init__(task_name="chase", *args, **kwargs)
    
    def get_task_env_vars(self) -> Dict[str, str]:
        """Return chase-specific environment variables as a dictionary"""
        return {
            "CHASE_DURATION_MS": "10000",
            "CHASE_POSITION_UPDATE_INTERVAL": "500",
            "CHASE_MIN_DISTANCE": "3.0",
            "CHASE_ESCAPE_DISTANCE": "8.0",
            "CHASE_DIRECTION_CHANGE_INTERVAL": "4000",
            "CHASE_CAMERA_SPEED": "90"
        }

