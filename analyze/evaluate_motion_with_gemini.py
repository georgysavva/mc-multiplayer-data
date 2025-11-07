#!/usr/bin/env python3
"""
Evaluate bot motion consistency using Gemini 2.5 Pro.
Queries Gemini to judge if the observed motion matches expected movement.
"""

import json
import os
import sys
from pathlib import Path
from typing import Dict, List, Tuple, Optional
import argparse
from tqdm import tqdm

from google import genai
from google.genai import types


def parse_action_for_expected_motion(action_str: str) -> Dict[str, str]:
    """
    Parse action string to determine expected motion from each perspective,
    given ground truth WASD movement command.
    
    Returns dict with:
        'from_mover': how other should appear to move from the mover's perspective
        'from_other': how the mover should appear to move from other's perspective
    """
    # For strafing movements
    if 'A' in action_str and 'D' not in action_str:
        # Moving left
        return {
            'from_mover': 'right',
            'from_other': 'right'
        }
    elif 'D' in action_str and 'A' not in action_str:
        # Moving right
        return {
            'from_mover': 'left',
            'from_other': 'left'
        }
    elif 'W' in action_str and 'S' not in action_str:
        # Moving forward
        return {
            'from_mover': 'closer',
            'from_other': 'closer'
        }
    elif 'S' in action_str and 'W' not in action_str:
        # Moving backward
        return {
            'from_mover': 'farther',
            'from_other': 'farther'
        }
    else:
        # Complex movement or no clear direction
        raise ValueError(f"Unknown action: {action_str}")


def query_gemini(client, image_path_1: str, image_path_2: str) -> str:
    """
    Query Gemini to judge motion between two frames.
    
    Returns one of: 'closer', 'farther', 'left', 'right', or 'error'
    """
    try:
        with open(image_path_1, 'rb') as f:
            image_bytes_1 = f.read()
        with open(image_path_2, 'rb') as f:
            image_bytes_2 = f.read()
        
        response = client.models.generate_content(
            # I found that gemini-2.5-flash with no thinking is as accurate as gemini-2.5-pro with
            # default thinking (dynamic). But gemini-2.5-pro with short thinking is worse than both.
            model='gemini-2.5-flash',
            contents=[
                types.Part.from_bytes(
                    data=image_bytes_1,
                    mime_type='image/png',
                ),
                types.Part.from_bytes(
                    data=image_bytes_2,
                    mime_type='image/png',
                ),
                'Here are Minecraft screenshots showing another player on the screen. Between the first frame and the second frame, did the player being shown move closer, farther, to the left, or to the right on-screen? Answer with a single word from "closer", "farther", "left", or "right". If you cannot determine the motion, answer "unclear".'
            ],
            config=types.GenerateContentConfig(
                system_instruction='You are a helpful assistant that evaluates on-screen motion of Minecraft characters between two screenshots.',
                thinking_config=types.ThinkingConfig(thinking_budget=0) # Disables thinking
            ),
        )
        
        # Parse response - extract just the motion word
        response_text = response.text.strip().lower()
        
        # Extract the key word
        for keyword in ['closer', 'farther', 'left', 'right', 'unclear']:
            if keyword in response_text:
                return keyword
        
        return 'error'
        
    except Exception as e:
        print(f"\nError querying Gemini: {e}")
        return 'error'


def evaluate_episode(
    client,
    episode_folder: Path,
    use_annotated: bool = True,
    comparison_frame: int = 8
) -> Dict:
    """
    Evaluate a single episode folder.
    
    Returns dict with results for both alpha and bravo perspectives.
    """
    # Load metadata
    metadata_path = episode_folder / "metadata.json"
    if not metadata_path.exists():
        return None
    
    with open(metadata_path, 'r') as f:
        metadata = json.load(f)
    
    # Determine subfolder
    subfolder = "annotated" if use_annotated else "raw"
    
    # Get first action
    first_action = metadata.get('first_action', '')
    first_bot = metadata.get('first_movement_bot', '')
    
    # Parse expected motion
    expected_motion = parse_action_for_expected_motion(first_action)
    
    results = {
        'episode_id': metadata['episode_id'],
        'first_action': first_action,
        'first_bot': first_bot,
        'alpha': None,
        'bravo': None
    }
    
    # Evaluate from Alpha's perspective
    # Find frame 0 (might have different action/video indices)
    alpha_frame_0 = None
    for f in sorted((episode_folder / subfolder).glob("alpha_frame_0000_*.png")):
        alpha_frame_0 = f
        break
    
    # Find comparison frame (might have different action/video indices)
    alpha_frame_n = None
    frame_pattern = f"alpha_frame_{comparison_frame:04d}_*.png"
    for f in sorted((episode_folder / subfolder).glob(frame_pattern)):
        alpha_frame_n = f
        break
    
    if alpha_frame_0 and alpha_frame_n:
        gemini_response = query_gemini(client, str(alpha_frame_0), str(alpha_frame_n))
        
        # Determine expected motion from Alpha's perspective
        if first_bot == 'Alpha':
            # Alpha is moving, so Bravo appears to move from mover's perspective
            expected = expected_motion['from_mover']
        else:
            # Bravo is moving, so Bravo appears to move from other's perspective
            expected = expected_motion['from_other']
        
        results['alpha'] = {
            'expected': expected,
            'observed': gemini_response,
            'correct': gemini_response == expected if expected != 'unknown' else None
        }
    
    # Evaluate from Bravo's perspective
    # Find frame 0 (might have different action/video indices)
    bravo_frame_0 = None
    for f in sorted((episode_folder / subfolder).glob("bravo_frame_0000_*.png")):
        bravo_frame_0 = f
        break
    
    # Find comparison frame (might have different action/video indices)
    bravo_frame_n = None
    frame_pattern = f"bravo_frame_{comparison_frame:04d}_*.png"
    for f in sorted((episode_folder / subfolder).glob(frame_pattern)):
        bravo_frame_n = f
        break
    
    if bravo_frame_0 and bravo_frame_n:
        gemini_response = query_gemini(client, str(bravo_frame_0), str(bravo_frame_n))
        
        # Determine expected motion from Bravo's perspective
        if first_bot == 'Bravo':
            # Bravo is moving, so Alpha appears to move from mover's perspective
            expected = expected_motion['from_mover']
        else:
            # Alpha is moving, so Alpha appears to move from other's perspective
            expected = expected_motion['from_other']
        
        results['bravo'] = {
            'expected': expected,
            'observed': gemini_response,
            'correct': gemini_response == expected if expected != 'unknown' else None
        }
    
    return results


def main():
    parser = argparse.ArgumentParser(
        description='Evaluate motion consistency using Gemini 2.5 Pro'
    )
    parser.add_argument(
        '--motion-frames-dir',
        type=str,
        default='analyze/motion_frames',
        help='Directory containing motion frame folders'
    )
    parser.add_argument(
        '--use-raw',
        action='store_true',
        help='Use raw (non-annotated) frames instead of annotated ones'
    )
    parser.add_argument(
        '--output',
        type=str,
        default='analyze/gemini_evaluation_results.json',
        help='Output file for results'
    )
    parser.add_argument(
        '--comparison-frame',
        type=int,
        default=8,
        help='Frame number to compare against frame 0 (default: 8)'
    )
    
    args = parser.parse_args()
    
    # Check for API key
    api_key = os.environ.get('GEMINI_API_KEY')
    if not api_key:
        print("Error: GEMINI_API_KEY environment variable not set")
        print("Please set it with: export GEMINI_API_KEY=your_api_key")
        sys.exit(1)
    
    # Initialize Gemini client
    client = genai.Client(api_key=api_key)
    
    # Find all episode folders
    motion_frames_dir = Path(args.motion_frames_dir)
    episode_folders = sorted([d for d in motion_frames_dir.iterdir() if d.is_dir()])
    
    print(f"Found {len(episode_folders)} episode folders")
    print(f"Using {'raw' if args.use_raw else 'annotated'} frames")
    print(f"Comparing frame 0 vs frame {args.comparison_frame}")
    print("=" * 60)
    
    # Track statistics
    all_results = []
    alpha_correct = 0
    alpha_total = 0
    bravo_correct = 0
    bravo_total = 0
    
    # Process each episode
    for episode_folder in tqdm(episode_folders, desc="Evaluating episodes"):
        result = evaluate_episode(
            client, 
            episode_folder, 
            use_annotated=not args.use_raw,
            comparison_frame=args.comparison_frame
        )
        
        if result:
            all_results.append(result)
            
            # Update statistics and report errors
            if result['alpha'] and result['alpha']['correct'] is not None:
                alpha_total += 1
                if result['alpha']['correct']:
                    alpha_correct += 1
                else:
                    # Print error details
                    tqdm.write(f"  ❌ MISMATCH - {episode_folder.name} (Alpha): "
                              f"Expected '{result['alpha']['expected']}', "
                              f"Gemini answered '{result['alpha']['observed']}'")
            
            if result['bravo'] and result['bravo']['correct'] is not None:
                bravo_total += 1
                if result['bravo']['correct']:
                    bravo_correct += 1
                else:
                    # Print error details
                    tqdm.write(f"  ❌ MISMATCH - {episode_folder.name} (Bravo): "
                              f"Expected '{result['bravo']['expected']}', "
                              f"Gemini answered '{result['bravo']['observed']}'")
            
            # Update progress bar with running accuracy
            alpha_acc = (alpha_correct / alpha_total * 100) if alpha_total > 0 else 0
            bravo_acc = (bravo_correct / bravo_total * 100) if bravo_total > 0 else 0
            tqdm.write(f"  Running accuracy - Alpha: {alpha_acc:.1f}% ({alpha_correct}/{alpha_total}), "
                      f"Bravo: {bravo_acc:.1f}% ({bravo_correct}/{bravo_total})")
    
    print("\n" + "=" * 60)
    print("FINAL RESULTS")
    print("=" * 60)
    
    if alpha_total > 0:
        alpha_accuracy = alpha_correct / alpha_total * 100
        print(f"Alpha perspective: {alpha_correct}/{alpha_total} correct ({alpha_accuracy:.2f}%)")
    else:
        print("Alpha perspective: No valid evaluations")
    
    if bravo_total > 0:
        bravo_accuracy = bravo_correct / bravo_total * 100
        print(f"Bravo perspective: {bravo_correct}/{bravo_total} correct ({bravo_accuracy:.2f}%)")
    else:
        print("Bravo perspective: No valid evaluations")
    
    total_correct = alpha_correct + bravo_correct
    total_evaluations = alpha_total + bravo_total
    
    if total_evaluations > 0:
        overall_accuracy = total_correct / total_evaluations * 100
        print(f"\nOverall: {total_correct}/{total_evaluations} correct ({overall_accuracy:.2f}%)")
    
    # Save detailed results
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    summary = {
        'statistics': {
            'alpha': {
                'correct': alpha_correct,
                'total': alpha_total,
                'accuracy': (alpha_correct / alpha_total * 100) if alpha_total > 0 else 0
            },
            'bravo': {
                'correct': bravo_correct,
                'total': bravo_total,
                'accuracy': (bravo_correct / bravo_total * 100) if bravo_total > 0 else 0
            },
            'overall': {
                'correct': total_correct,
                'total': total_evaluations,
                'accuracy': (total_correct / total_evaluations * 100) if total_evaluations > 0 else 0
            }
        },
        'results': all_results
    }
    
    with open(output_path, 'w') as f:
        json.dump(summary, f, indent=2)
    
    print(f"\nDetailed results saved to: {output_path}")


if __name__ == '__main__':
    main()

