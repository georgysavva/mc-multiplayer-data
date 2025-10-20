#!/usr/bin/env python3
"""
Example usage of task generators.

This script demonstrates how to use the ChaseTaskGenerator to generate
single episodes with randomized configurations.
"""

from pathlib import Path
from task_generators import ChaseTaskGenerator


def main():
    """Run example task generation"""
    
    # Setup paths (adjust these to your actual data directories)
    output_dir = Path("/home/oscar/mc-multiplayer-data/output").absolute()
    data_dir = Path("/home/oscar/mc-multiplayer-data/data_tasks").absolute()
    camera_dir = Path("/home/oscar/mc-multiplayer-data/camera_tasks").absolute()
    
    print("=" * 60)
    print("Chase Task Generator Example")
    print("=" * 60)
    
    # Create a chase task generator for worker 0
    chase_gen = ChaseTaskGenerator(
        output_root=output_dir,
        data_root=data_dir,
        camera_root=camera_dir,
        base_port=25565,
        base_rcon_port=25575,
        base_vnc_display=99,
        base_vnc_port=5901,
        base_novnc_port=6901,
        worker_id=0,
        seed=42  # For reproducibility
    )
    
    print(f"\nCreated ChaseTaskGenerator:")
    print(f"  Worker ID: {chase_gen.worker_id}")
    print(f"  Task Name: {chase_gen.task_name}")
    print(f"  Output Dir: {chase_gen.output_root}")
    print(f"  Data Dir: {chase_gen.data_root}")
    print(f"  Camera Dir: {chase_gen.camera_root}")
    
    # Generate a single episode
    print(f"\n{'='*60}")
    print("Generating Episode 1")
    print(f"{'='*60}")
    result = chase_gen.run_task_episode()
    
    print(f"\nEpisode Result:")
    print(f"  Success: {result['success']}")
    print(f"  Episode ID: {result['episode_id']}")
    print(f"  Duration: {result['duration_seconds']:.1f}s")
    
    if result['success']:
        print(f"\n  Task Environment Variables:")
        task_vars = chase_gen.get_task_env_vars()
        for key, value in task_vars.items():
            print(f"    {key}: {value}")
        
        print(f"\n  Global Environment Variables:")
        global_vars = chase_gen.get_global_env_vars()
        for key, value in list(global_vars.items())[:5]:  # Show first 5
            print(f"    {key}: {value}")
        print(f"    ... and {len(global_vars) - 5} more")
    else:
        print(f"  Error: {result['error']}")
    
    print(f"\n{'='*60}")
    print("Example Complete!")
    print(f"{'='*60}")
    
    # To generate multiple episodes, simply call run_task_episode() multiple times:
    # for i in range(5):
    #     result = chase_gen.run_task_episode()
    #     print(f"Episode {i+1}: {result['success']}")


if __name__ == "__main__":
    main()

