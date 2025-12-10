#!/usr/bin/env python3
"""
Filter water episodes by detecting the oxygen bar HUD element in video frames.

This script uses multiprocessing to sample frames from episode video recordings
and checks for the presence of Minecraft's oxygen bar (bubbles) which indicates
the player is underwater.
"""

import numpy as np
from PIL import Image
from pathlib import Path
import cv2
import matplotlib.pyplot as plt
from typing import Tuple, List
import os


# Crop coordinates for the oxygen bar region
CROP_X = 670
CROP_Y = 573


def load_oxygen_bar_template() -> Tuple[np.ndarray, np.ndarray]:
    """
    Load the oxygen bar template and return RGB values and alpha mask.
    
    Returns:
        rgb_template: RGB values of the template (H, W, 3)
        alpha_mask: Boolean mask where alpha == 255 (H, W)
    """
    asset_path = Path(__file__).parent / "assets" / "minecraft-hud-oxygen-bar-rgba.png"
    img = Image.open(asset_path)
    img_array = np.array(img)
    
    rgb_template = img_array[:, :, :3]  # RGB channels
    alpha_mask = img_array[:, :, 3] == 255  # Boolean mask where alpha is 255
    
    return rgb_template, alpha_mask


def compute_cosine_similarity_masked(
    frame_crop: np.ndarray, 
    template_rgb: np.ndarray, 
    alpha_mask: np.ndarray
) -> float:
    """
    Compute cosine similarity between cropped frame and template,
    only using pixels where alpha mask is True.
    
    Args:
        frame_crop: Cropped region from video frame (H, W, 3)
        template_rgb: RGB template (H, W, 3)
        alpha_mask: Boolean mask (H, W)
    
    Returns:
        Cosine similarity score between -1 and 1
    """
    # Extract only the masked pixels and flatten
    frame_masked = frame_crop[alpha_mask].flatten().astype(np.float32)
    template_masked = template_rgb[alpha_mask].flatten().astype(np.float32)
    
    # Compute cosine similarity
    dot_product = np.dot(frame_masked, template_masked)
    norm_frame = np.linalg.norm(frame_masked)
    norm_template = np.linalg.norm(template_masked)
    
    if norm_frame == 0 or norm_template == 0:
        return 0.0
    
    return dot_product / (norm_frame * norm_template)


def sample_frames_from_video(
    video_path: str, 
    template_rgb: np.ndarray, 
    alpha_mask: np.ndarray,
    max_frames: int = 1000
) -> Tuple[List[float], List[int], np.ndarray, int]:
    """
    Sample frames from a video and compute cosine similarity for each.
    
    Returns:
        similarities: List of cosine similarity scores
        frame_indices: List of frame indices that were sampled
        best_frame_crop: The cropped region with highest similarity
        best_frame_idx: Index of the best frame
    """
    cap = cv2.VideoCapture(video_path)
    
    if not cap.isOpened():
        raise ValueError(f"Could not open video: {video_path}")
    
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    template_h, template_w = template_rgb.shape[:2]
    
    # Determine which frames to sample (uniformly distributed)
    if total_frames <= max_frames:
        frame_indices = list(range(total_frames))
    else:
        frame_indices = np.linspace(0, total_frames - 1, max_frames, dtype=int).tolist()
    
    similarities = []
    best_similarity = -1
    best_frame_crop = None
    best_frame_idx = 0
    
    for frame_idx in frame_indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
        ret, frame = cap.read()
        
        if not ret:
            similarities.append(0.0)
            continue
        
        # Convert BGR to RGB
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        
        # Crop the oxygen bar region
        crop = frame_rgb[CROP_Y:CROP_Y + template_h, CROP_X:CROP_X + template_w]
        
        # Check if crop is valid
        if crop.shape[0] != template_h or crop.shape[1] != template_w:
            similarities.append(0.0)
            continue
        
        # Compute similarity
        sim = compute_cosine_similarity_masked(crop, template_rgb, alpha_mask)
        similarities.append(sim)
        
        if sim > best_similarity:
            best_similarity = sim
            best_frame_crop = crop.copy()
            best_frame_idx = frame_idx
    
    cap.release()
    return similarities, frame_indices, best_frame_crop, best_frame_idx


def debug_analyze_videos():
    """Debug function to analyze water vs non-water videos."""
    
    # Load template
    template_rgb, alpha_mask = load_oxygen_bar_template()
    print(f"Template shape: {template_rgb.shape}")
    print(f"Masked pixels: {alpha_mask.sum()} / {alpha_mask.size}")
    
    base_path = "/mnt/data/dl3957/mc_multiplayer_v2_gpu/batch2_split_4/aligned"
    
    # Water videos (positive cases)
    water_videos = [
        "20251207_141853_000076_Alpha_instance_002_camera.mp4",
        "20251207_141853_000076_Bravo_instance_002_camera.mp4",
    ]
    
    # Control videos (negative cases - should NOT have oxygen bar)
    control_videos = [
        "20251207_141915_000083_Alpha_instance_001_camera.mp4",  # night
        "20251207_141755_000084_Bravo_instance_003_camera.mp4",  # night
        "20251207_130828_000000_Alpha_instance_003_camera.mp4",  # ice
        "20251207_130856_000001_Alpha_instance_003_camera.mp4",  # day
    ]
    
    all_videos = water_videos + control_videos
    labels = ["Water: Alpha_076", "Water: Bravo_076", 
              "Control: Night_083", "Control: Night_084", 
              "Control: Ice_000", "Control: Day_001"]
    colors = ["blue", "cyan", "gray", "darkgray", "lightblue", "orange"]
    
    # Create figure for bar charts
    fig, axes = plt.subplots(len(all_videos), 1, figsize=(14, 3 * len(all_videos)))
    
    best_water_crop = None
    best_water_similarity = -1
    best_water_label = ""
    best_water_frame_idx = 0
    
    all_max_similarities = []
    
    for idx, (video_name, label, color) in enumerate(zip(all_videos, labels, colors)):
        video_path = os.path.join(base_path, video_name)
        print(f"\nProcessing: {label}")
        print(f"  Path: {video_path}")
        
        if not os.path.exists(video_path):
            print(f"  ERROR: Video not found!")
            all_max_similarities.append(0)
            continue
        
        similarities, frame_indices, best_crop, best_idx = sample_frames_from_video(
            video_path, template_rgb, alpha_mask, max_frames=500
        )
        
        max_sim = max(similarities) if similarities else 0
        mean_sim = np.mean(similarities) if similarities else 0
        all_max_similarities.append(max_sim)
        
        print(f"  Frames sampled: {len(similarities)}")
        print(f"  Max similarity: {max_sim:.4f}")
        print(f"  Mean similarity: {mean_sim:.4f}")
        print(f"  Best frame index: {best_idx}")
        
        # Track best water video crop
        if idx < len(water_videos) and max_sim > best_water_similarity:
            best_water_similarity = max_sim
            best_water_crop = best_crop
            best_water_label = label
            best_water_frame_idx = best_idx
        
        # Plot bar chart
        ax = axes[idx]
        ax.bar(range(len(similarities)), similarities, color=color, alpha=0.7, width=1.0)
        ax.set_ylabel("Cosine Sim")
        ax.set_title(f"{label} - Max: {max_sim:.4f}, Mean: {mean_sim:.4f}")
        ax.set_ylim(0, 1)
        ax.axhline(y=0.9, color='red', linestyle='--', alpha=0.5, label='Threshold 0.9')
        ax.axhline(y=0.8, color='orange', linestyle='--', alpha=0.5, label='Threshold 0.8')
        ax.legend()
    
    plt.tight_layout()
    output_chart = Path(__file__).parent / "assets" / "debug_similarity_chart.png"
    plt.savefig(output_chart, dpi=150)
    print(f"\nSaved similarity chart to: {output_chart}")
    plt.close()
    
    # Create side-by-side comparison of best water frame
    if best_water_crop is not None:
        fig2, axes2 = plt.subplots(1, 3, figsize=(12, 4))
        
        # Template RGB (with alpha mask overlay)
        template_display = template_rgb.copy()
        axes2[0].imshow(template_display)
        axes2[0].set_title("Template (RGB)")
        axes2[0].axis('off')
        
        # Alpha mask
        axes2[1].imshow(alpha_mask, cmap='gray')
        axes2[1].set_title("Alpha Mask (white = used)")
        axes2[1].axis('off')
        
        # Best water frame crop
        axes2[2].imshow(best_water_crop)
        axes2[2].set_title(f"Best Water Crop\n{best_water_label}, Frame {best_water_frame_idx}\nSim: {best_water_similarity:.4f}")
        axes2[2].axis('off')
        
        plt.tight_layout()
        output_comparison = Path(__file__).parent / "assets" / "debug_best_match_comparison.png"
        plt.savefig(output_comparison, dpi=150)
        print(f"Saved best match comparison to: {output_comparison}")
        plt.close()
    
    # Summary
    print("\n" + "="*60)
    print("SUMMARY - Max Cosine Similarities")
    print("="*60)
    for label, max_sim in zip(labels, all_max_similarities):
        marker = "🌊" if "Water" in label else "  "
        print(f"{marker} {label}: {max_sim:.4f}")
    
    print("\n" + "="*60)
    print("ANALYSIS")
    print("="*60)
    water_max = max(all_max_similarities[:2]) if len(all_max_similarities) >= 2 else 0
    control_max = max(all_max_similarities[2:]) if len(all_max_similarities) > 2 else 0
    print(f"Water videos max similarity: {water_max:.4f}")
    print(f"Control videos max similarity: {control_max:.4f}")
    print(f"Gap: {water_max - control_max:.4f}")
    
    if water_max > control_max + 0.1:
        suggested_threshold = (water_max + control_max) / 2
        print(f"\n✓ Good separation! Suggested threshold: {suggested_threshold:.3f}")
    else:
        print(f"\n⚠ Warning: May have false positives. Consider adjusting crop region or threshold.")


def debug_check_image_channels():
    """Debug function to check if the oxygen bar image has RGBA channels."""
    asset_path = Path(__file__).parent / "assets" / "minecraft-hud-oxygen-bar-rgba.png"
    
    print(f"Loading image from: {asset_path}")
    
    # Load the image
    img = Image.open(asset_path)
    
    print(f"Image mode: {img.mode}")
    print(f"Image size (W x H): {img.size}")
    
    # Convert to numpy array to check shape
    img_array = np.array(img)
    print(f"Array shape: {img_array.shape}")
    print(f"Array dtype: {img_array.dtype}")
    
    if img.mode == "RGBA":
        print("\n✓ Image has RGBA channels!")
        
        # Separate channels
        r, g, b, a = img.split()
        
        # Save RGB composite
        rgb_img = Image.merge("RGB", (r, g, b))
        rgb_output = asset_path.parent / "debug_rgb_only.png"
        rgb_img.save(rgb_output)
        print(f"\nSaved RGB-only image to: {rgb_output}")
        
        # Save alpha channel as grayscale
        alpha_output = asset_path.parent / "debug_alpha_channel.png"
        a.save(alpha_output)
        print(f"Saved alpha channel to: {alpha_output}")
        
        # Print some stats about the alpha channel
        alpha_array = np.array(a)
        print(f"\nAlpha channel stats:")
        print(f"  Min: {alpha_array.min()}")
        print(f"  Max: {alpha_array.max()}")
        print(f"  Mean: {alpha_array.mean():.2f}")
        print(f"  Unique values: {len(np.unique(alpha_array))}")
        
        # Count fully transparent vs opaque pixels
        fully_transparent = np.sum(alpha_array == 0)
        fully_opaque = np.sum(alpha_array == 255)
        total_pixels = alpha_array.size
        print(f"  Fully transparent (alpha=0): {fully_transparent} ({100*fully_transparent/total_pixels:.1f}%)")
        print(f"  Fully opaque (alpha=255): {fully_opaque} ({100*fully_opaque/total_pixels:.1f}%)")
        
    elif img.mode == "RGB":
        print("\n✗ Image only has RGB channels (no alpha)")
    elif img.mode == "L":
        print("\n✗ Image is grayscale (single channel)")
    elif img.mode == "LA":
        print("\n✓ Image is grayscale with alpha")
    else:
        print(f"\nImage has mode: {img.mode}")
    
    return img


if __name__ == "__main__":
    debug_analyze_videos()
