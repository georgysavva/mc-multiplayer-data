# Build Structure Episode Refactor - Task List

**Goal:** Port enhanced building logic from `build-house-episode.js` to `build-structure-episode.js`

**Date Started:** 2025-12-01

---

## 📋 Task Overview

This refactor will add the following capabilities to `build-structure-episode.js`:
- ✅ Terrain clearing (dig obstacles before placement)
- ✅ Smart placement order (bottom-up, optimized sequences)
- ✅ Better work division (proximity-based assignment)
- ✅ Robust error handling (graceful failures)
- ✅ Scaffolding support (auto-place support blocks)
- ✅ Abort handling (can stop mid-build)
- ✅ Random terrain compatibility

---

## 🎯 Tasks

### ☐ TASK 1: Create Blueprint Generation Functions
**Status:** Not Started  
**File:** `episode-handlers/build-structure-episode.js`

**Objective:** Replace inline position generation with structured blueprints (like house episode)

**Sub-tasks:**
- [ ] Create `generateWallBlueprint(startPos, length, height, blockType)` function
  - Returns array of objects: `{x, y, z, block, phase, placementOrder, worldPos}`
  - Add placement order: bottom-up, left-to-right
  - Phase: "wall"
  
- [ ] Create `generateTowerBlueprint(basePos, height, blockType)` function
  - Returns array of objects: `{x, y, z, block, phase, placementOrder, worldPos}`
  - Add placement order: bottom-up (0, 1, 2...)
  - Phase: "tower"
  
- [ ] Create `generatePlatformBlueprint(startPos, width, depth, blockType)` function
  - Returns array of objects: `{x, y, z, block, phase, placementOrder, worldPos}`
  - Add placement order: edge-to-center spiral (reuse `calculateFloorPlacementOrder` logic)
  - Phase: "platform"

**Expected Changes:**
- Replace `generateWallPositions()` → `generateWallBlueprint()`
- Replace `generateTowerPositions()` → `generateTowerBlueprint()`
- Replace `generatePlatformPositions()` → `generatePlatformBlueprint()`
- Each blueprint includes `worldPos` property (Vec3 object)

**Success Criteria:**
- Blueprints return structured objects with all required properties
- Placement order is optimized for each structure type
- worldPos is properly set for each block

---

### ☐ TASK 2: Add Work Division Logic
**Status:** Not Started  
**File:** `episode-handlers/build-structure-episode.js`

**Objective:** Split work between bots intelligently using proximity-based assignment

**Sub-tasks:**
- [ ] Import `splitWorkByXAxis()` from `utils/building.js`
- [ ] Add proximity-based assignment logic in `getOnBuildPhaseFn()`
  - Calculate `botIsOnWestSide` and `otherBotIsOnWestSide`
  - Use proximity to determine which bot builds which half
  - Add tie-breaker: if both on same side, use alphabetical order
- [ ] Add logging for work assignment decisions
- [ ] Test with both bots on same side (tie-breaker scenario)

**Expected Changes:**
- Lines ~200-260: Replace simple bot name comparison with proximity logic
- Add position reconstruction from phaseData (like house lines 156-165)
- Calculate structure midpoint/origin for proximity checks

**Success Criteria:**
- Bots build the side closer to their spawn position
- Tie-breaker works when both bots on same side
- Clear logging shows which bot builds which half

---

### ☐ TASK 3: Replace buildStructure() with buildPhase()
**Status:** Not Started  
**File:** `episode-handlers/build-structure-episode.js`

**Objective:** Use enhanced building logic with terrain clearing and scaffolding

**Sub-tasks:**
- [ ] Import `buildPhase` from `utils/building.js`
- [ ] Remove local `buildStructure()` function (lines 81-134)
- [ ] Update call site (line 267) to use `buildPhase()` instead
- [ ] Pass proper options to `buildPhase()`:
  - `args: args`
  - `delayMs: BLOCK_PLACE_DELAY_MS`
  - `shouldAbort: () => bot._episodeStopping`
- [ ] Update result handling to use `{success, failed, aborted}` format

**Expected Changes:**
- Remove `buildStructure()` function entirely
- Update imports at top of file
- Change line 267 from `buildStructure(bot, positions, blockType, args)` to `buildPhase(bot, myTargets, options)`

**Success Criteria:**
- Terrain clearing works (digs obstacles before placement)
- Scaffolding auto-places when needed
- Abort handling works mid-build
- Returns proper statistics object

---

### ☐ TASK 4: Add Try-Catch Error Handling
**Status:** Not Started  
**File:** `episode-handlers/build-structure-episode.js`

**Objective:** Add robust error handling like house episode

**Sub-tasks:**
- [ ] Wrap building logic in try-catch block (around line 265)
- [ ] Add failure threshold check: `if (result.failed > myTargets.length * 0.5)`
- [ ] Add pathfinder cleanup on error: `bot.pathfinder.setGoal(null)`
- [ ] Ensure proper stop phase transition on error
- [ ] Add abort flag checking: `if (bot._episodeStopping)`
- [ ] Add detailed error logging

**Expected Changes:**
- Add try-catch around building call (like house lines 208-312)
- Add error handling before stop phase transition
- Ensure pathfinder is stopped on all error paths

**Success Criteria:**
- Episode doesn't hang on build failures
- Proper transition to stop phase on errors
- Pathfinder is cleaned up on all exit paths
- Clear error messages in logs

---

### ☐ TASK 5: Add Material Calculation
**Status:** Not Started  
**File:** `episode-handlers/build-structure-episode.js`

**Objective:** Calculate and provision correct amount of blocks based on structure

**Sub-tasks:**
- [ ] Import `calculateMaterialCounts` from `utils/building.js`
- [ ] Update `setupEpisode()` to generate blueprint first
- [ ] Calculate material counts from blueprint
- [ ] Add 50% safety margin: `Math.ceil(count * 1.5)`
- [ ] Use `ensureBotHasEnough()` for each material type
- [ ] Remove hardcoded 64-block provisioning

**Expected Changes:**
- Lines 324-328: Replace hardcoded loop with dynamic calculation
- Generate blueprint in setupEpisode to know material needs
- Calculate exact needs per structure type

**Success Criteria:**
- Bots receive correct amount of materials for their structure
- No over-provisioning (except 50% safety margin)
- Works for all structure types (wall, tower, platform)

---

### ☐ TASK 6: Update Episode Metadata
**Status:** Not Started  
**File:** `episode-handlers/build-structure-episode.js`

**Objective:** Mark episode as compatible with random terrain

**Sub-tasks:**
- [ ] Change `WORKS_IN_NON_FLAT_WORLD` from `false` to `true` (line 317)
- [ ] Verify distance constants are appropriate:
  - `INIT_MIN_BOTS_DISTANCE = 8`
  - `INIT_MAX_BOTS_DISTANCE = 15`
- [ ] Add comment explaining terrain compatibility
- [ ] Update any related documentation

**Expected Changes:**
- Line 317: `static WORKS_IN_NON_FLAT_WORLD = true;`
- Add comment: `// Auto-scaffolding and terrain clearing enabled`

**Success Criteria:**
- Episode is selected for random world generation
- Episode runs successfully on hills and uneven terrain
- No errors related to terrain incompatibility

---

## 📊 Progress Tracker

- **Total Tasks:** 6
- **Completed:** 0
- **In Progress:** 0
- **Not Started:** 6
- **Progress:** 0%

---

## 🔄 Task Completion Template

When completing a task, update it like this:

```markdown
### ✅ TASK X: Task Name
**Status:** Completed  
**Completed Date:** YYYY-MM-DD  
**Time Taken:** X minutes

**Changes Made:**
- List of actual changes
- Files modified
- Any deviations from plan

**Testing Notes:**
- What was tested
- Any issues encountered
- Resolution steps
```

---

## 📝 Notes

- Each task should be completed and tested before moving to the next
- User will confirm after each task completion
- If issues arise, document them in the task section
- Keep this file updated as the single source of truth for refactor progress
