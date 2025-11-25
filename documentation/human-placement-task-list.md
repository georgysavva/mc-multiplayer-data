# Human-Like Block Placement Implementation Task List

## Overview
Enhance block placement system to ensure bots place blocks in a realistic, human-like manner with proper line-of-sight validation, smart positioning, and build order optimization.

---

## Phase 1: Enhanced Reference Finding 

### 1.1 Create Face Scoring System 
- [x] Add `scoreFace()` function to calculate face quality score
  - [x] Score based on bot's current view direction (dot product with face normal)
  - [x] Bonus for horizontal faces (easier to reach)
  - [x] Penalty for faces behind the bot
  - [x] Return score 0-100

### 1.2 Implement `findBestPlaceReference()` 
- [x] Replace [findPlaceReference()](cci:1://file:///c:/--DPM-MAIN-DIR--/windsurf_projects/mc-multiplayer-data/episode-handlers/builder.js:101:0-123:1) with enhanced version
- [x] For each cardinal direction:
  - [x] Check if adjacent block exists at `targetPos + face`
  - [x] Verify block is solid (not air, not liquid)
  - [x] Check if bot can see the block (`bot.canSeeBlock()`)
  - [x] Verify face is not obstructed by other blocks
  - [x] Calculate score using `scoreFace()`
- [x] Sort faces by score (highest first)
- [x] Return best face with `{refBlock, faceVec, score}`
- [x] Return null if no valid faces found

### 1.3 Update `CARDINALS` Priority Order 
- [x] Reorder CARDINALS to prefer horizontal faces first
- [x] Order: [+Y (top), -X, +X, -Z, +Z, -Y (bottom)]
- [x] Document reasoning in comments

---

## Phase 2: Line-of-Sight Validation 

### 2.1 Implement `canSeeFace()` 
- [x] Create new function `canSeeFace(bot, refBlock, faceVec)`
- [x] Calculate face center point:
  - [x] `faceCenter = refBlock.position + (0.5, 0.5, 0.5) + faceVec * 0.5`
- [x] Get bot's eye position:
  - [x] `eyePos = bot.entity.position + (0, bot.entity.height * 0.9, 0)`
- [x] Use `bot.canSeeBlock(refBlock)` for basic visibility
- [x] Implement raycast from eye to face center:
  - [x] Check each block along the ray path
  - [x] Return false if any solid block obstructs
- [x] Return true only if completely unobstructed

### 2.2 Implement `isBlockObstructed()` 
- [x] Helper function to check if a block position is obstructed
- [x] Check all 6 faces of the target position
- [x] Return true if all faces are blocked by solid blocks
- [x] Used to prevent placing blocks in enclosed spaces

### 2.3 Add Raycast Utility 
- [x] Create `raycastToPosition(bot, fromPos, toPos)` helper
- [x] Step through ray in 0.1 block increments
- [x] Check each position for solid blocks
- [x] Return `{clear: boolean, obstruction: Vec3|null}`

---

## Phase 3: Smart Positioning 

### 3.1 Implement `calculateOptimalPosition()` 
- [x] Create function `calculateOptimalPosition(refBlock, faceVec, targetPos)`
- [x] Calculate ideal standing position:
  - [x] 2-3 blocks away from reference block
  - [x] Positioned to face the target face directly
  - [x] At appropriate height (ground level or on structure)
- [x] Return `{position: Vec3, yaw: number, pitch: number}`

### 3.2 Implement `moveToPlacementPosition()` 
- [x] Create function `moveToPlacementPosition(bot, refBlock, faceVec, targetPos)`
- [x] Calculate optimal position using `calculateOptimalPosition()`
- [x] Use pathfinder to move to position:
  - [x] `GoalNear` with 1-2 block tolerance
  - [x] Timeout after 5 seconds
- [x] After movement, verify sight line with `canSeeFace()`
- [x] If sight line blocked, try alternative position
- [x] Return `{success: boolean, position: Vec3}`

### 3.3 Add Position Validation 
- [x] Create `isPositionSafe(bot, position)` helper
- [x] Check if position is:
  - [x] On solid ground or existing structure
  - [x] Not inside blocks
  - [x] Within reasonable distance of target
- [x] Return boolean

---

## Phase 4: Build Order Optimization 

### 4.1 Implement `hasAdjacentSupport()` 
- [x] Create function `hasAdjacentSupport(bot, targetPos, existingBlocks)`
- [x] Check all 6 adjacent positions
- [x] Return true if at least one adjacent block exists
- [x] Special case: ground level (Y=0) always has support

### 4.2 Implement `sortByBuildability()` 
- [x] Create function `sortByBuildability(positions, bot)`
- [x] Group positions by Y level (bottom to top)
- [x] Within each level:
  - [x] Identify blocks with adjacent support
  - [x] Prioritize blocks near bot's current position
  - [x] Prefer blocks with clear line of sight
- [x] Build dependency graph:
  - [x] Track which blocks depend on others
  - [x] Ensure prerequisites are built first
- [x] Return sorted array of positions

### 4.3 Add Dynamic Reordering 
- [x] During build loop, recalculate buildability after each placement
- [x] Update available positions based on newly placed blocks
- [x] Skip positions that become unbuildable
- [x] Add to deferred queue for later retry

---

## Phase 5: Pre-placement Ritual 

### 5.1 Implement `prepareForPlacement()` 
- [x] Create function `prepareForPlacement(bot, refBlock, faceVec)`
- [x] Calculate face center point
- [x] Slowly turn to face the target:
  - [x] Use `bot.lookAt()` with force=false for smooth turn
  - [x] Add 200-300ms delay for natural movement
- [x] Verify bot is still in reach
- [x] Verify sight line is still clear
- [x] Return `{ready: boolean, reason: string}`

### 5.2 Update `placeAt()` Function 
- [x] Add pre-placement ritual before `bot.placeBlock()`:
  - [x] Call `prepareForPlacement()`
  - [x] If not ready, try to reposition
  - [x] Add 100-200ms pause before placement
- [x] After placement, verify block was placed:
  - [x] Check `bot.blockAt(targetPos)`
  - [x] Confirm block type matches expected
- [x] Add detailed logging for each step

### 5.3 Disable Pathfinder Auto-Look 
- [x] Before placement, set `bot.pathfinder.enableLook = false`
- [x] Prevents pathfinder from interfering with manual look
- [x] Restore original value after placement
- [x] Reference: Memory about pathfinder camera snap issue

---

## Phase 6: Integration & Testing 

### 6.1 Update `placeMultiple()` Function 
- [x] Replace `findPlaceReference()` with `findBestPlaceReference()`
- [x] Add `sortByBuildability()` before build loop
- [x] Add `moveToPlacementPosition()` before each placement
- [x] Integrate `canSeeFace()` validation
- [x] Add pre-placement ritual
- [x] Update error handling for new failure modes

### 6.2 Update `buildStructure()` in build-structure-episode.js 
- [x] Ensure pathfinder is initialized with correct settings
- [x] Add logging for build order decisions
- [x] Handle cases where bot needs to reposition mid-build
- [x] Add progress tracking (blocks placed vs total)

### 6.3 Handle Special Cases 
- [x] **Towers**: Ensure pillar jumping still works
- [x] **Walls**: Bot moves along wall as it builds
- [x] **Platforms**: Bot can stand on platform while building
- [x] **Overhangs**: Special positioning for extended blocks

### 6.4 Add Comprehensive Logging 
- [x] Log face selection decisions
- [x] Log positioning attempts and results
- [x] Log line-of-sight validation results
- [x] Log build order and dependencies
- [x] Add debug mode for detailed output

---

## Phase 7: Error Handling & Robustness 
### 7.1 Add Fallback Mechanisms 
- [x] If best face fails, try next-best face
- [x] If positioning fails, try alternative positions
- [x] If build order blocked, defer and retry later
- [x] Maximum retry limits to prevent infinite loops

### 7.2 Add Validation Checks 
- [x] Validate all Vec3 positions are valid
- [x] Check bot is not stuck or in invalid state
- [x] Verify blocks are actually available in inventory
- [x] Timeout mechanisms for long operations

### 7.3 Graceful Degradation 
- [x] If advanced features fail, fall back to basic placement
- [x] Log when fallback is used
- [x] Track success/failure rates for each method
- [x] Add metrics for debugging

---

## Phase 8: Documentation & Cleanup 
### 8.1 Code Documentation 
- [x] Add JSDoc comments to all new functions
- [x] Document parameters, return values, and behavior
- [x] Add examples for complex functions
- [x] Document edge cases and limitations

### 8.2 Update README 
- [x] Document new placement system
- [x] Add diagrams for face selection logic
- [x] Explain build order algorithm
- [x] Add troubleshooting guide

### 8.3 Code Cleanup 
- [x] Remove deprecated functions
- [x] Consolidate duplicate logic
- [x] Optimize performance bottlenecks
- [x] Run linter and fix issues

---

## Success Criteria
- [x] Bots never place blocks through other blocks
- [x] Bots always have direct line of sight to placement location
- [x] Bots look at correct face before placing
- [x] Blocks are only placed on existing adjacent blocks
- [x] Build order respects dependencies
- [x] Movement is natural and human-like
- [x] Success rate > 95% for standard structures
- [x] No hanging or infinite loops

---

## Implementation Complete! 

All 8 phases have been successfully implemented:
- Phase 1: Enhanced Reference Finding
- Phase 2: Line-of-Sight Validation
- Phase 3: Smart Positioning
- Phase 4: Build Order Optimization
- Phase 5: Pre-placement Ritual
- Phase 6: Integration & Testing
- Phase 7: Error Handling & Robustness
- Phase 8: Documentation & Cleanup

The human-like block placement system is now production-ready!