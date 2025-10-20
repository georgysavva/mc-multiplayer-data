"""
Generic walk task generator.

Generates generic walk task episodes with randomized bot behavior parameters.
"""

from typing import Dict
from .base_task_generator import BaseTaskGenerator


class GenericWalkTaskGenerator(BaseTaskGenerator):
    """
    Generates generic walk task episodes.
    
    The generic walk task involves basic walking behavior with
    configurable action counts for testing purposes.
    """
    
    def __init__(self, *args, **kwargs):
        """Initialize generic walk task generator with task_name="genericWalk" """
        super().__init__(task_name="genericWalk", *args, **kwargs)
    
    def get_task_env_vars(self) -> Dict[str, str]:
        """Return generic walk-specific environment variables as a dictionary"""
        return {
            "GENERIC_MIN_RUN_ACTIONS": "3",
            "GENERIC_MAX_RUN_ACTIONS": "5"
        }
