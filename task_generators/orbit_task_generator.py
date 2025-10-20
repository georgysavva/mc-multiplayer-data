"""
Orbit task generator.

Generates orbit task episodes with randomized bot behavior parameters.
"""

from typing import Dict
from .base_task_generator import BaseTaskGenerator


class OrbitTaskGenerator(BaseTaskGenerator):
    """
    Generates orbit task episodes.
    
    The orbit task involves both bots orbiting around a shared midpoint
    while maintaining eye contact and using MVC coordination.
    """
    
    def __init__(self, *args, **kwargs):
        """Initialize orbit task generator with task_name="orbit" """
        super().__init__(task_name="orbit", *args, **kwargs)
    
    def get_task_env_vars(self) -> Dict[str, str]:
        """Return orbit-specific environment variables as a dictionary"""
        return {
            "ORBIT_DURATION_MS": "15000",
            "ORBIT_UPDATE_INTERVAL": "200",
            "ORBIT_RADIUS": "5.0",
            "ORBIT_SPEED": "0.10",
            "ORBIT_CAMERA_SPEED": "90",
            "ORBIT_EYE_CONTACT_INTERVAL": "500",
            "ORBIT_FOV_MAX": "90",
            "ORBIT_D_MIN": "3.0",
            "ORBIT_D_MAX": "8.0",
            "ORBIT_CORRECTION_STRENGTH": "0.3"
        }
