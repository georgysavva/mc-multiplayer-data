# Batch Processing Guide for NYU MC Data Mineflayer Enhanced

This guide explains how to use the batch processing scripts to automatically annotate and align all episodes in your output directory.

## Overview

The batch processing system consists of:

1. **`batch_process_all.py`** - Main script that processes all episodes
2. **`annotate_video.py`** - Individual video annotation (existing)
3. **`align_videos.py`** - Video alignment for Alpha-Bravo pairs (existing)

## Quick Start

### Process All Episodes (Annotation + Alignment)

```bash
cd output-post-processing-utils
python batch_process_all.py --output-dir ../output
```

This will:
1. Find all Alpha-Bravo episode pairs in the output directory
2. Annotate each video with its corresponding JSON data
3. Align each Alpha-Bravo pair into a combined video

### Command Line Options

```bash
# Basic usage
python batch_process_all.py

# Specify custom output directory
python batch_process_all.py --output-dir /path/to/your/output

# Force reprocessing of already processed episodes
python batch_process_all.py --force-reprocess

# Only run annotation (skip alignment)
python batch_process_all.py --annotation-only

# Only run alignment (skip annotation)
python batch_process_all.py --alignment-only

# Get help
python batch_process_all.py --help
```

## File Structure

### Input Files (Expected in Output Directory)

The script expects files following this naming pattern:
```
{episode_id:06d}_{bot_name}_instance_{instance_id:03d}.{extension}
```

Example:
```
000000_Alpha_instance_000.mp4
000000_Alpha_instance_000.json
000000_Bravo_instance_000.mp4
000000_Bravo_instance_000.json
000001_Alpha_instance_000.mp4
000001_Alpha_instance_000.json
000001_Bravo_instance_000.mp4
000001_Bravo_instance_000.json
```

### Output Files

After processing, you'll have:

1. **Annotated Videos**: `done/{original_name}_annotated.mp4`
   ```
   done/000000_Alpha_instance_000_annotated.mp4
   done/000000_Bravo_instance_000_annotated.mp4
   ```

2. **Aligned Videos**: `done/{alpha_name}_{bravo_name}_aligned.mp4`
   ```
   done/000000_Alpha_instance_000_annotated_000000_Bravo_instance_000_annotated_aligned.mp4
   ```

## Directory Structure

The script automatically creates a clean directory structure:

```
output/
├── 000000_Alpha_instance_000.mp4          # Original raw videos
├── 000000_Alpha_instance_000.json         # Original JSON metadata
├── 000000_Bravo_instance_000.mp4
├── 000000_Bravo_instance_000.json
├── 000001_Alpha_instance_000.mp4
├── 000001_Alpha_instance_000.json
├── ... (more episodes)
└── done/                                   # Processed files subdirectory
    ├── 000000_Alpha_instance_000_annotated.mp4
    ├── 000000_Bravo_instance_000_annotated.mp4
    ├── 000000_Alpha_instance_000_annotated_000000_Bravo_instance_000_annotated_aligned.mp4
    ├── 000001_Alpha_instance_000_annotated.mp4
    ├── 000001_Bravo_instance_000_annotated.mp4
    ├── 000001_Alpha_instance_000_annotated_000001_Bravo_instance_000_annotated_aligned.mp4
    └── ... (more processed files)
```

**Benefits of this structure:**
- **Clean separation**: Raw episodes stay in main directory, processed files in `done/`
- **Easy management**: Can easily archive or move processed files
- **Scalable**: Works well even with hundreds of episodes
- **Clear organization**: Immediately see what's been processed vs. raw data

## Processing Pipeline

### Step 1: Episode Discovery
- Scans output directory for Alpha-Bravo pairs
- Only processes complete pairs (both bots with both .mp4 and .json files)
- Reports found episodes and any missing files

### Step 2: Annotation
- Uses `annotate_video.py` to overlay action data on videos
- Processes both Alpha and Bravo videos for each episode
- Skips already annotated videos (unless `--force-reprocess`)

### Step 3: Alignment
- Uses `align_videos.py` to create synchronized side-by-side videos
- Aligns Alpha and Bravo annotated videos using timestamp data
- Creates vertically concatenated output with separator

## Example Output

```
Processing episodes in: /path/to/output
Using scripts from: /path/to/scripts

Found 8 complete episode pairs:
  Episode 000000
  Episode 000001
  Episode 000002
  Episode 000003
  Episode 000004
  Episode 000005
  Episode 000006
  Episode 000007

Already annotated episodes: ['000000']
Already aligned episodes: ['000000']

============================================================
Processing Episode 000001
============================================================
Step 1: Annotating videos...
  Annotating Alpha video for episode 000001
  Running: python annotate_video.py 000001_Alpha_instance_000.mp4 000001_Alpha_instance_000.json --output-dir /output
  Annotating Bravo video for episode 000001
  Running: python annotate_video.py 000001_Bravo_instance_000.mp4 000001_Bravo_instance_000.json --output-dir /output
  ✓ Annotation completed for episode 000001
Step 2: Aligning videos...
  Aligning Alpha and Bravo videos for episode 000001
  Running: python align_videos.py 000001_Alpha_instance_000_annotated.mp4 000001_Alpha_instance_000.json 000001_Bravo_instance_000_annotated.mp4 000001_Bravo_instance_000.json /output
  ✓ Alignment completed for episode 000001

============================================================
BATCH PROCESSING SUMMARY
============================================================
Total episodes found: 8
Annotation successes: 7
Alignment successes: 7

Final output files in /output:
  Annotated videos: 16
    done/000000_Alpha_instance_000_annotated.mp4
    done/000000_Bravo_instance_000_annotated.mp4
    done/000001_Alpha_instance_000_annotated.mp4
    done/000001_Bravo_instance_000_annotated.mp4
    ...
  Aligned videos: 8
    done/000000_Alpha_instance_000_annotated_000000_Bravo_instance_000_annotated_aligned.mp4
    done/000001_Alpha_instance_000_annotated_000001_Bravo_instance_000_annotated_aligned.mp4
    ...
```

## Troubleshooting

### Common Issues

1. **"No complete episode pairs found"**
   - Check that your output directory contains matching Alpha-Bravo pairs
   - Verify file naming follows the expected pattern
   - Ensure both .mp4 and .json files exist for each bot

2. **"Annotated video not found"**
   - Run annotation step first: `python batch_process_all.py --annotation-only`
   - Check for annotation errors in the output

3. **"Alignment failed"**
   - Verify that annotated videos exist
   - Check that JSON files contain valid timestamp data
   - Try processing a single pair manually to debug

### Manual Processing

If you need to process individual episodes:

```bash
# Annotate single video
python annotate_video.py 000001_Alpha_instance_000.mp4 000001_Alpha_instance_000.json --output-dir ../output

# Align single pair
python align_videos.py 000001_Alpha_instance_000_annotated.mp4 000001_Alpha_instance_000.json 000001_Bravo_instance_000_annotated.mp4 000001_Bravo_instance_000.json ../output
```

## Performance Notes

- Processing time depends on video length and resolution
- Annotation typically takes 1-2 minutes per video
- Alignment can take 3-5 minutes per pair
- Total processing time for 8 episodes: ~30-60 minutes
- The script provides progress updates and can be interrupted/resumed

## Dependencies

Make sure you have the required Python packages:
```bash
pip install opencv-python numpy
```

Or use the project's requirements.txt:
```bash
pip install -r requirements.txt
