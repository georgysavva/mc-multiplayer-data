#!/usr/bin/env python3
"""
Single episode test script to debug video generation issues.
"""

from pathlib import Path
from task_generators import ChaseTaskGenerator

def main():
    """Run a single chase episode to debug video generation"""
    
    base_output = Path("/home/oscar/mc-multiplayer-data/output").absolute()
    data_dir = Path("/home/oscar/mc-multiplayer-data/data_tasks").absolute()
    camera_dir = Path("/home/oscar/mc-multiplayer-data/camera_tasks").absolute()
    
    print("=" * 60)
    print("Single Episode Debug Test")
    print("=" * 60)
    
    # Create test output directory
    test_output_dir = base_output / "debug_test"
    test_output_dir.mkdir(parents=True, exist_ok=True)
    
    # Create generator with comparison enabled
    generator = ChaseTaskGenerator(
        output_root=test_output_dir,
        data_root=data_dir,
        camera_root=camera_dir,
        base_port=25565,
        base_rcon_port=25575,
        base_vnc_display=99,
        base_vnc_port=5901,
        base_novnc_port=6901,
        worker_id=0,
        seed=42,
        generate_comparison=True
    )
    
    print(f"Output directory: {test_output_dir}")
    print(f"Data directory: {data_dir}")
    print(f"Camera directory: {camera_dir}")
    
    # Generate single episode
    print(f"\n{'-'*60}")
    print("Generating single debug episode")
    print(f"{'-'*60}")
    
    result = generator.run_task_episode()
    
    print(f"\nEpisode Result:")
    print(f"  Success: {result['success']}")
    print(f"  Episode ID: {result['episode_id']}")
    print(f"  Duration: {result['duration_seconds']:.1f}s")
    
    if result['success']:
        # List all files in the episode directory
        episode_dir = test_output_dir / result['episode_id']
        if episode_dir.exists():
            print(f"\nFiles in episode directory {episode_dir}:")
            for item in sorted(episode_dir.rglob("*")):
                if item.is_file():
                    print(f"  {item.relative_to(episode_dir)}")
                elif item.is_dir():
                    print(f"  {item.relative_to(episode_dir)}/")
        else:
            print(f"\nEpisode directory {episode_dir} does not exist!")
    else:
        print(f"  Error: {result['error']}")

if __name__ == "__main__":
    main()
