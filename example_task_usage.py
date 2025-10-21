#!/usr/bin/env python3
"""
Example usage of task generators - runs all 6 tasks with comparison videos.
"""

from pathlib import Path
from task_generators import (
    ChaseTaskGenerator,
    OrbitTaskGenerator,
    StraightLineTaskGenerator,
    MVCTestTaskGenerator,
    BridgeBuilderTaskGenerator,
    GenericWalkTaskGenerator
)

def main():
    """Run all task types with 3 episodes each"""
    
    base_output = Path("/home/oscar/mc-multiplayer-data/output").absolute()
    data_dir = Path("/home/oscar/mc-multiplayer-data/data_tasks").absolute()
    camera_dir = Path("/home/oscar/mc-multiplayer-data/camera_tasks").absolute()
    
    # All 6 task generators
    task_generators = [
        ("chase", ChaseTaskGenerator),
        ("orbit", OrbitTaskGenerator),
        ("straightLineWalk", StraightLineTaskGenerator),
        ("mvcTest", MVCTestTaskGenerator),
        ("bridgeBuilder", BridgeBuilderTaskGenerator),
        ("genericWalk", GenericWalkTaskGenerator),
    ]
    
    for task_name, GeneratorClass in task_generators:
        print("\n" + "=" * 60)
        print(f"Task: {task_name.upper()}")
        print("=" * 60)
        
        # Create task-specific output directory
        task_output_dir = base_output / task_name
        task_output_dir.mkdir(parents=True, exist_ok=True)
        
        # Create generator with comparison enabled
        generator = GeneratorClass(
            output_root=task_output_dir,
            data_root=data_dir,
            camera_root=camera_dir,
            base_port=25565,
            base_rcon_port=25575,
            base_vnc_display=99,
            base_vnc_port=5901,
            base_novnc_port=6901,
            worker_id=0,
            seed=42,
            generate_comparison=True  # Enable comparison videos
        )
        
        # Generate 3 episodes for this task
        for episode_num in range(3):
            print(f"\n{'-'*60}")
            print(f"Generating {task_name} Episode {episode_num + 1}/3")
            print(f"{'-'*60}")
            
            result = generator.run_task_episode()
            
            if result['success']:
                print(f"✓ Success: {result['episode_id']}")
                print(f"  Duration: {result['duration_seconds']:.1f}s")
            else:
                print(f"✗ Failed: {result['error']}")
    
    print("\n" + "=" * 60)
    print("All tasks complete!")
    print("=" * 60)

if __name__ == "__main__":
    main()