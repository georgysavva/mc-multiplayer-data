# Video Post-Processing Utilities Documentation

This directory contains a suite of scripts for post-processing Minecraft bot video recordings. These scripts handle the complete workflow from raw camera footage to final annotated, aligned side-by-side videos.

## Overview

The post-processing workflow consists of four main scripts that work together:

1. **`post_process_videos.ps1`** - PowerShell orchestration script (main entry point)
2. **`batch_process_all.py`** - Python batch processor with file management
3. **`annotate_video.py`** - Video annotation with Minecraft action data
4. **`align_videos.py`** - Video alignment using timestamp synchronization

## Workflow Summary

```
Raw Camera Recordings → Episode Extraction → Video Annotation → Video Alignment → Final Products
     ↓                           ↓                ↓                ↓              ↓
   camera/                   output/           done/     aligned-annotated/    Research Data
   ├── output_alpha/
   │   └── camera_alpha.mp4
   └── output_bravo/
       └── camera_bravo.mp4
```

## Script Details

### 1. post_process_videos.ps1 (PowerShell)

**Purpose**: High-level orchestration script that runs the complete post-processing pipeline.

**Key Features**:
- Validates input directories and files
- Processes Alpha and Bravo camera recordings separately
- Runs batch processing with error handling
- Provides progress feedback and final statistics

**Usage**:
```powershell
# Basic usage (processes everything)
.\post_process_videos.ps1

# Custom directories
.\post_process_videos.ps1 -OutputDir "my_output" -CameraPrefix "my_camera"

# Partial processing
.\post_process_videos.ps1 -AnnotationOnly    # Skip alignment
.\post_process_videos.ps1 -AlignmentOnly     # Skip annotation
```

**Parameters**:
- `OutputDir`: Directory containing action JSON files (default: "output")
- `CameraPrefix`: Camera output directory prefix (default: "camera")
- `AnnotationOnly`: Only run annotation step
- `AlignmentOnly`: Only run alignment step

### 2. batch_process_all.py (Python)

**Purpose**: Comprehensive batch processor that handles episode extraction, annotation, and alignment with intelligent file management.

**Key Features**:
- Extracts individual episodes from camera recordings using `process_recordings.py`
- Finds complete Alpha-Bravo episode pairs
- Annotates videos with action data
- Moves processed files to organized directories
- Aligns annotated videos for side-by-side viewing
- Provides detailed progress and success/failure statistics

**Directory Structure Created**:
```
output/
├── (unprocessed episodes remain here)
├── done/
│   ├── raw videos, JSONs, and meta files
│   └── annotated videos
└── aligned-annotated/
    └── final side-by-side videos
```

**Usage**:
```bash
# Full processing pipeline
python batch_process_all.py --output-dir ../output --camera-prefix ../camera

# Partial processing
python batch_process_all.py --output-dir ../output --annotation-only
python batch_process_all.py --output-dir ../output --alignment-only

# Force reprocessing
python batch_process_all.py --output-dir ../output --force-reprocess

# Skip episode extraction (if already done)
python batch_process_all.py --output-dir ../output --skip-extraction
```

**Command Line Options**:
- `--output-dir`: Directory containing episode files (required)
- `--camera-prefix`: Directory containing camera recordings
- `--skip-extraction`: Skip episode extraction from camera recordings
- `--annotation-only`: Only annotate videos, skip alignment
- `--alignment-only`: Only align already annotated videos
- `--force-reprocess`: Reprocess episodes even if already done

### 3. annotate_video.py (Python)

**Purpose**: Overlays Minecraft action data onto video frames as text annotations.

**Key Features**:
- Reads JSON action data synchronized with video frames
- Displays active actions (movement, combat, interactions)
- Shows camera movement (yaw/pitch changes)
- Positions text in bottom-right corner with black outline for visibility
- Maintains exact frame-to-frame synchronization

**Supported Actions**:
- Movement: forward, back, left, right, jump, sprint, sneak
- Combat: attack, use
- Interactions: place_block, place_entity, mine, mount, dismount
- Hotbar: hotbar.1 through hotbar.9
- Camera: yaw and pitch values when moving

**Usage**:
```bash
python annotate_video.py video.mp4 actions.json --output-dir output/
```

**Requirements**:
- Input video and JSON must have identical frame counts
- JSON format: array of frame objects with "action" field
- Video format: MP4 with consistent framerate

### 4. align_videos.py (Python)

**Purpose**: Synchronizes and combines two videos into a single side-by-side view using timestamp data.

**Key Features**:
- Efficient two-pointer algorithm for timestamp alignment
- Configurable timestamp threshold (default: 50ms)
- Automatic FPS calculation from aligned frame timestamps
- Vertical concatenation with black separator strip
- Handles videos of different dimensions
- Robust error handling for missing/corrupted frames

**Alignment Algorithm**:
1. Load timestamps from both JSON files
2. Find frame pairs where timestamps differ by ≤ threshold
3. Compute output FPS from average time span of aligned frames
4. Read and combine aligned frames vertically
5. Write to output video with computed properties

**Usage**:
```bash
# Basic alignment
python align_videos.py video1.mp4 json1.json video2.mp4 json2.json output/

# Custom threshold
python align_videos.py video1.mp4 json1.json video2.mp4 json2.json output/ --threshold 30
```

**Parameters**:
- `video1`, `json1`: First video and timestamp file
- `video2`, `json2`: Second video and timestamp file
- `output_dir`: Directory for output video
- `--threshold`: Max timestamp difference in ms (default: 50.0)
- `--verbose`: Enable verbose output

## Dependencies

### Python Requirements
```
opencv-python
numpy
```

Install with:
```bash
pip install opencv-python numpy
```

### System Requirements
- Python 3.6+
- FFmpeg (for video encoding/decoding)
- PowerShell 5.1+ (for .ps1 scripts on Windows)

## File Naming Conventions

### Input Files
```
{YYYYMMDD_HHMMSS}_{episode_id}_{bot_name}_instance_{instance_id}[_camera].{extension}
```

Examples:
- `20241125_143022_000012_Alpha_instance_000_camera.mp4`
- `20241125_143022_000012_Alpha_instance_000.json`
- `20241125_143022_000012_Alpha_instance_000_meta.json`

### Output Files
- Annotated: `{original_name}_annotated.mp4`
- Aligned: `{alpha_name}_{bravo_name}_aligned.mp4`

## Error Handling

All scripts include comprehensive error handling:

- **File validation**: Checks for existence and format of input files
- **Frame synchronization**: Verifies JSON/video frame count matching
- **Process monitoring**: Captures stdout/stderr from subprocess calls
- **Graceful degradation**: Continues processing other episodes if one fails
- **Detailed logging**: Progress updates and error diagnostics

## Performance Notes

- **Video processing**: Time scales with video length and resolution
- **Annotation**: ~1-2 minutes per video
- **Alignment**: ~3-5 minutes per video pair
- **Batch processing**: ~30-60 minutes for 8 episodes
- **Memory usage**: O(n) where n = number of video frames

## Troubleshooting

### Common Issues

1. **"No episodes found"**
   - Verify camera recordings exist in expected directories
   - Check file naming matches expected patterns
   - Ensure both Alpha and Bravo recordings are present

2. **"Frame count mismatch"**
   - JSON and video must have identical frame counts
   - Check that `process_recordings.py` completed successfully
   - Verify camera recording didn't get interrupted

3. **"Annotation failed"**
   - Ensure JSON files contain valid action data
   - Check video file integrity
   - Verify output directory is writable

4. **"Alignment failed"**
   - Confirm annotated videos exist
   - Check timestamp data in JSON files
   - Try increasing `--threshold` value

### Debug Mode

Enable verbose output for detailed diagnostics:
```bash
python align_videos.py video1.mp4 json1.json video2.mp4 json2.json output/ --verbose
```

## Integration with Main System

These scripts integrate with the main Minecraft data collection system:

1. **Camera recordings** are created by the receiver services
2. **Action JSONs** are generated by the bot coordination system
3. **Post-processing** runs after episode collection completes
4. **Final videos** are used for ML training and analysis

## Examples

### Complete Workflow
```powershell
# 1. Run episodes (main system)
# 2. Process recordings
.\post_process_videos.ps1

# Result: Videos in output/aligned-annotated/
```

### Individual Processing
```bash
# Annotate single video
python annotate_video.py episode_001_Alpha.mp4 episode_001_Alpha.json --output-dir done/

# Align annotated pair
python align_videos.py episode_001_Alpha_annotated.mp4 episode_001_Alpha.json episode_001_Bravo_annotated.mp4 episode_001_Bravo.json aligned-annotated/
```

## Version History

- **v1.0**: Initial implementation with basic annotation and alignment
- **v2.0**: Added batch processing with file management
- **v2.1**: Enhanced error handling and PowerShell automation
- **v2.2**: Improved timestamp alignment algorithm and performance

## Contributing

When modifying these scripts:
1. Maintain backward compatibility
2. Add comprehensive error handling
3. Update documentation for new features
4. Test with various video formats and sizes
5. Validate against existing episode data
