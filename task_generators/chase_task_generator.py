"""
Chase task generator.

Generates chase task episodes with randomized bot behavior parameters.
"""

from .base_task_generator import BaseTaskGenerator, TaskConfig


class ChaseTaskGenerator(BaseTaskGenerator):
    """
    Generates chase task episodes.
    
    The chase task involves one bot chasing another bot while both record
    synchronized observations and actions.
    """
    
    def __init__(self, *args, **kwargs):
        """Initialize chase task generator with task_name="chase" """
        super().__init__(task_name="chase", *args, **kwargs)
    
    def sample_task_config(self) -> TaskConfig:
        """
        Sample randomized parameters for a chase task episode.
        
        Returns:
            TaskConfig with randomized bot behavior parameters
        """
        config = TaskConfig()
        
        # Randomize bot behavior
        config.bot_rng_seed = self.rng.randint(0, 2**31 - 1)
        config.iterations_per_episode = self.rng.randint(3, 6)
        config.min_run_actions = self.rng.randint(2, 4)
        config.max_run_actions = self.rng.randint(config.min_run_actions, 6)
        config.bootstrap_wait_time = self.rng.randint(55, 65)
        
        # World seed (for future world randomization)
        config.world_seed = self.rng.randint(0, 2**31 - 1)
        
        # World config placeholder (for future world type randomization)
        config.world_config = None
        
        return config

