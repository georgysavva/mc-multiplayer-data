"""
Straight line task generator.

Generates straight line task episodes with randomized bot behavior parameters.
"""

from typing import Dict
from .base_task_generator import BaseTaskGenerator


class StraightLineTaskGenerator(BaseTaskGenerator):
    """
    Generates straight line task episodes.
    
    The straight line task involves one bot walking in a straight line
    while looking at the other bot, with the other bot staying in place.
    """
    
    def __init__(self, *args, **kwargs):
        """Initialize straight line task generator with task_name="straightLineWalk" """
        super().__init__(task_name="straightLineWalk", *args, **kwargs)
    
    def get_task_env_vars(self) -> Dict[str, str]:
        """Return straight line-specific environment variables as a dictionary"""
        return {
            "STRAIGHT_WALK_DISTANCE": "8",
            "STRAIGHT_LOOK_UPDATE_INTERVAL": "50",
            "STRAIGHT_CAMERA_SPEED": "180"
        }
