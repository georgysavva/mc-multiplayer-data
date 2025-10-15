# Migration Notes - NYU MC Data Mineflayer Enhanced

## Batch Processing System Migration

### ✅ **New System (Recommended)**
**Location**: `output-post-processing-utils/batch_process_all.py`

**Usage**:
```bash
cd output-post-processing-utils
python batch_process_all.py --output-dir ../output
```

**Features**:
- ✅ Processes **ALL episodes** (not just the first one)
- ✅ Organized output with `done/` subdirectory
- ✅ Smart skip logic (avoids reprocessing)
- ✅ Flexible options (annotation-only, alignment-only, force-reprocess)
- ✅ Progress tracking and detailed reporting
- ✅ Windows Unicode encoding compatibility
- ✅ Comprehensive error handling and recovery

### ❌ **Old System (Deprecated)**
**Location**: `auto_process_DEPRECATED.py`

**Issues**:
- ❌ **Bug**: Only processes the first episode pair found
- ❌ Limited error handling
- ❌ No progress tracking
- ❌ Unicode encoding issues on Windows
- ❌ No organized output structure

### **Migration Steps**

1. **Stop using** `auto_process.py` (now renamed to `auto_process_DEPRECATED.py`)
2. **Start using** `output-post-processing-utils/batch_process_all.py`
3. **Existing processed files** will be automatically detected and skipped
4. **New processed files** will be organized in the `output/done/` directory

### **Directory Structure After Migration**

```
output/
├── 000000_Alpha_instance_000.mp4          # Raw episodes (unchanged)
├── 000000_Alpha_instance_000.json         # Raw metadata (unchanged)
├── 000000_Bravo_instance_000.mp4
├── 000000_Bravo_instance_000.json
├── ... (more raw episodes)
└── done/                                   # New: All processed files
    ├── 000000_Alpha_instance_000_annotated.mp4
    ├── 000000_Bravo_instance_000_annotated.mp4
    ├── 000000_Alpha_..._aligned.mp4
    └── ... (all processed files organized here)
```

### **Benefits of Migration**

1. **Complete Processing**: All episodes get processed, not just the first one
2. **Clean Organization**: Processed files separated from raw data
3. **Scalability**: Works efficiently with hundreds of episodes
4. **Reliability**: Better error handling and recovery
5. **Flexibility**: Multiple processing modes available
6. **Progress Tracking**: Clear visibility into processing status

---

**Date**: 2025-10-06  
**Migrated by**: Batch processing system implementation
