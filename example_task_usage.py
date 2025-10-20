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
        print(f"\n  Configuration:")
        print(f"    Bot RNG Seed: {result['config']['bot_rng_seed']}")
        print(f"    Iterations: {result['config']['iterations_per_episode']}")
        print(f"    Min Actions: {result['config']['min_run_actions']}")
        print(f"    Max Actions: {result['config']['max_run_actions']}")
        print(f"    Bootstrap Wait: {result['config']['bootstrap_wait_time']}s")
        print(f"    MC Port: {result['config']['mc_port']}")
        print(f"    RCON Port: {result['config']['rcon_port']}")
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

