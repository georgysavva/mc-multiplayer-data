"""
MVC test task generator.

Generates MVC test task episodes with randomized bot behavior parameters.
"""

from typing import Dict
from .base_task_generator import BaseTaskGenerator


class MVCTestTaskGenerator(BaseTaskGenerator):
    """
    Generates MVC test task episodes.
    
    The MVC test task involves testing the MVC (Mutual Visual Contact)
    coordination system with random movement patterns.
    """
    
    def __init__(self, *args, **kwargs):
        """Initialize MVC test task generator with task_name="mvcTest" """
        super().__init__(task_name="mvcTest", *args, **kwargs)
    
    def get_task_env_vars(self) -> Dict[str, str]:
        """Return MVC test-specific environment variables as a dictionary"""
        return {
            "MVC_TEST_DURATION_MS": "10000",
            "MVC_TEST_UPDATE_INTERVAL": "200",
            "MVC_TEST_RANDOM_MOVEMENT_INTERVAL": "2000",
            "MVC_TEST_FOV_MAX": "70",
            "MVC_TEST_D_MIN": "2.5",
            "MVC_TEST_D_MAX": "6.0",
            "MVC_TEST_CORRECTION_STRENGTH": "0.8"
        }
