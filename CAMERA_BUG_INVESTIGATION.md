# Camera Bug Investigation Checklist
## structureEval.js - Builder Bot Looking "Off to the Side" During Block Placement

---

## Bug Description

**Observed Behavior**: When the builder bot places blocks, it looks at the correct reference block face, but then the camera moves "off to the side" before looking back at where the next block should be placed.

**Expected Behavior**: Bot should look directly at the correct face of the reference block and maintain that view during placement, then smoothly transition to the next block's face without unnecessary camera movement.

**Location**: `episode-handlers/structureEval.js`, specifically in the `placeMultipleWithDelay()` function (lines 112-247)

---

## Current Code Flow (Builder Bot - STEP 4)

### Block Placement Loop (Lines 155-239)

For each block in the sorted positions array:

1. **Lines 179-190**: Pathfind to adjacent position
   - Bot moves to stand next to where the block will be placed
   - ⚠️ Pathfinder may implicitly adjust camera during movement

2. **Lines 193-215**: Find reference block and look at it
   - `findPlaceReference(bot, pos)` - finds existing block to click on
   - Calculate face position: `refBlock.position.offset(0.5 + faceVec.x * 0.5, ...)`
   - **Line 206**: `allowLookAt = true` - Enable lookAt override
   - **Line 208**: `await bot.lookAt(lookAtFacePos)` - Look at reference block face ✅
   - **Line 140**: Wait 500ms for smooth camera rotation to settle

3. **Line 218**: `allowLookAt = false` - Disable lookAt to prevent camera reset

4. **Line 219**: `await placeAt(bot, pos, itemName, options)` ⚠️ **BUG OCCURS HERE**

5. **Lines 236-238**: Delay before next block (1000ms)

---

## Override Mechanism (Lines 130-144)

```javascript
const originalLookAt = bot.lookAt.bind(bot);
bot.lookAt = async function(position, forceLook) {
  if (allowLookAt) {
    await originalLookAt(position, false);
    await sleep(LOOK_SETTLE_DELAY_MS); // 500ms
  }
  // When disabled: do nothing, maintain current camera angle
};
```

**Purpose**: Prevent `placeAt()` internal retry logic from moving camera
**Problem**: May not be catching all camera movements

---

## Three Hypotheses to Investigate

---

### ✅ HYPOTHESIS 1: placeAt() Uses bot.look(yaw, pitch) Instead of bot.lookAt(position)

**Theory**: The `bot.lookAt` override only catches `bot.lookAt(position)` calls. If `placeAt()` uses the lower-level `bot.look(yaw, pitch, force)` method, the override won't catch it.

**Evidence**:
- Override only replaces `bot.lookAt` function (line 134)
- Minecraft bots have TWO camera methods:
  - `bot.lookAt(position)` - high-level, looks at a Vec3 position
  - `bot.look(yaw, pitch, force)` - low-level, sets angles directly

**Test Plan**:
1. Read `episode-handlers/builder.js` to see what `placeAt()` calls internally
2. Search for `bot.look(` calls in builder.js
3. If found, add override for `bot.look()` as well

**Code Change to Test**:
```javascript
// Add this alongside the bot.lookAt override (after line 134)
const originalLook = bot.look.bind(bot);
bot.look = function(yaw, pitch, force) {
  if (allowLookAt) {
    originalLook(yaw, pitch, force);
  }
  // When disabled: do nothing, maintain current angles
};

// Restore in finally block (after line 242)
bot.look = originalLook;
```

**Expected Result**: If this is the issue, camera should no longer move during placement

**Status**: ⬜ NOT TESTED

---

### ✅ HYPOTHESIS 2: placeAt() Recalculates Reference Block with Different Face

**Theory**: `placeAt()` internally calls `findPlaceReference()` again and calculates a different face position than what we looked at in line 208. This causes the camera to snap to a different position.

**Evidence**:
- Line 193: We call `findPlaceReference(bot, pos)` 
- Line 208: We look at the face we calculated
- Line 219: `placeAt()` might call `findPlaceReference()` AGAIN internally
- Different face calculation = different look position = camera movement

**Why Different Face?**:
- `findPlaceReference()` may return different faces based on:
  - Bot's current position (which changed after pathfinding)
  - Line of sight checks
  - Block state changes
  - Priority order of faces (top, sides, bottom)

**Test Plan**:
1. Read `episode-handlers/builder.js` `placeAt()` function
2. Check if it calls `findPlaceReference()` internally
3. Add logging to see if face vectors differ between our call and placeAt's call

**Code Change to Test**:
```javascript
// After line 215, add detailed logging
console.log(`[${bot.username}] 🎯 PRE-PLACEMENT: Looking at face (${faceVec.x}, ${faceVec.y}, ${faceVec.z}) at position ${lookAtFacePos}`);
console.log(`[${bot.username}] 🎯 PRE-PLACEMENT: Camera yaw=${bot.entity.yaw.toFixed(3)}, pitch=${bot.entity.pitch.toFixed(3)}`);

// After line 219, add:
console.log(`[${bot.username}] 🎯 POST-PLACEMENT: Camera yaw=${bot.entity.yaw.toFixed(3)}, pitch=${bot.entity.pitch.toFixed(3)}`);
const yawDiff = Math.abs(bot.entity.yaw - preYaw);
const pitchDiff = Math.abs(bot.entity.pitch - prePitch);
console.log(`[${bot.username}] 🎯 CAMERA CHANGE: Δyaw=${yawDiff.toFixed(3)}, Δpitch=${pitchDiff.toFixed(3)}`);
```

**Alternative Solution**: Pass the reference block to `placeAt()` to avoid recalculation
```javascript
// Modify placeAt call to pass reference block
await placeAt(bot, pos, itemName, {
  ...options,
  referenceBlock: refBlock,
  faceVector: faceVec
});
```

**Expected Result**: Logging will show if camera angles change during placeAt

**Status**: ✅ **CONFIRMED**

---

### ✅ HYPOTHESIS 3: Race Condition or Timing Issue with Override

**Theory**: There's a timing issue where:
- The override is set up correctly
- But `placeAt()` somehow executes `originalLookAt` before the override takes effect
- Or `placeAt()` caches a reference to the original function
- Or there's async timing causing the override to be bypassed

**Evidence**:
- Override is set at line 134 (before loop starts)
- But JavaScript function binding can be tricky
- If `placeAt()` was loaded/compiled before the override, it might have cached the original reference

**Test Plan**:
1. Add extensive logging around the override
2. Check if `placeAt()` is somehow calling the original function
3. Try setting override INSIDE the loop (right before placeAt call)

**Code Change to Test**:
```javascript
// Move override setup INSIDE the loop (before line 206)
// This ensures it's set right before each placeAt call

for (const pos of sorted) {
  try {
    // Set up override fresh for each block
    const originalLookAt = bot.lookAt.bind(bot);
    let lookAtCallCount = 0;
    
    bot.lookAt = async function(position, forceLook) {
      lookAtCallCount++;
      console.log(`[${bot.username}] 🎥 lookAt called (${lookAtCallCount}), allowLookAt=${allowLookAt}`);
      
      if (allowLookAt) {
        await originalLookAt(position, false);
        await sleep(LOOK_SETTLE_DELAY_MS);
      } else {
        console.log(`[${bot.username}] 🚫 lookAt BLOCKED by override`);
      }
    };
    
    // ... rest of placement code ...
    
    // Restore after each block
    bot.lookAt = originalLookAt;
    
  } catch (error) {
    // ...
  }
}
```

**Expected Result**: Logging will show if lookAt is being called when it shouldn't be

**Status**: ⬜ NOT TESTED

---

## Additional Investigation: Read builder.js

Before testing hypotheses, we should read the `placeAt()` function to understand what it does internally.

**File to Read**: `episode-handlers/builder.js`

**Questions to Answer**:
1. Does `placeAt()` call `bot.lookAt()`? How many times?
2. Does `placeAt()` call `bot.look(yaw, pitch)`?
3. Does `placeAt()` call `findPlaceReference()` internally?
4. Does `placeAt()` have retry logic? What does it do on each retry?
5. What parameters does `placeAt()` accept? Can we pass reference block info?

**Status**: ✅ **READ - FINDINGS BELOW**

---

## 🔍 CRITICAL FINDINGS from builder.js

### Answer 1: Does placeAt() call bot.lookAt()?
**YES!** Line 144 in `ensureReachAndSight()`:
```javascript
await bot.lookAt(lookAtPos, true); // true = instant snap, false = smooth looking
```

### Answer 2: Does placeAt() call bot.look()?
**NO** - Only uses `bot.lookAt()`, not `bot.look(yaw, pitch)`

### Answer 3: Does placeAt() call findPlaceReference() internally?
**YES! MULTIPLE TIMES!** This is the bug!
- Line 189: Initial call to `findPlaceReference()`
- Line 202: Retry with different face if reach/sight fails
- Line 210: Retry with different face if placeBlock fails

### Answer 4: Does placeAt() have retry logic?
**YES!** Lines 196-220: Loops up to `tries` times (default 5)
- Each retry can recalculate the reference block
- Each retry calls `ensureReachAndSight()` which calls `bot.lookAt()`

### Answer 5: Can we pass reference block info?
**NO** - Current signature doesn't accept pre-calculated reference blocks

---

## 🎯 ROOT CAUSE IDENTIFIED: **HYPOTHESIS 2 CONFIRMED**

### The Bug Explained

**In structureEval.js (lines 193-219)**:
1. Line 193: We call `findPlaceReference(bot, pos)` → Get face A
2. Line 208: We look at face A's position
3. Line 218: We disable `allowLookAt = false`
4. Line 219: We call `placeAt(bot, pos, itemName, options)`

**Inside placeAt() (builder.js lines 176-226)**:
1. Line 189: Calls `findPlaceReference(bot, pos)` → **Gets face B** (might differ!)
2. Line 198: Calls `ensureReachAndSight(bot, refBlock, faceVec, 2)`
3. Inside `ensureReachAndSight()` line 144: Calls `bot.lookAt(lookAtPos, true)`
4. **Our override blocks this** because `allowLookAt = false`
5. Line 202: If reach/sight fails, calls `findPlaceReference()` AGAIN → **Gets face C**
6. Tries `ensureReachAndSight()` again with face C
7. **Our override blocks this too**
8. Line 210: If placeBlock fails, calls `findPlaceReference()` AGAIN → **Gets face D**

### Why Faces Differ

`findPlaceReference()` (lines 109-124) tries faces in this order:
1. +X (east)
2. -X (west)  
3. +Z (south)
4. -Z (north)
5. +Y (top)
6. -Y (bottom)

**The face returned depends on**:
- Which adjacent blocks exist (changes as blocks are placed)
- Bot's current position (changes after pathfinding)
- Line of sight (changes as bot moves)

### The Camera Movement Sequence

1. **structureEval.js line 208**: Bot looks at face A (e.g., top face)
2. **builder.js line 144**: `placeAt()` tries to look at face B (e.g., side face) with `instant snap = true`
3. **Override blocks it** → Camera doesn't move
4. **Placement might fail** because bot isn't looking at the right face
5. **builder.js line 202**: Retry finds face C, tries to look again
6. **Override blocks it** → Camera still doesn't move
7. **Eventually placement succeeds** (or fails)
8. **Next block**: structureEval.js looks at new face → Camera snaps to new position

**The "off to the side" movement** is actually the camera snapping from face A (where we looked) to the next block's face, but it LOOKS wrong because `placeAt()` was trying to look at faces B/C/D in between (which were blocked).

---

## 🔧 HYPOTHESIS 2: CONFIRMED ✅

**Theory**: placeAt() recalculates reference block with different face → **CONFIRMED**

**Evidence**:
- `placeAt()` calls `findPlaceReference()` at lines 189, 202, 210
- Each call can return a different face based on current world state
- `ensureReachAndSight()` tries to look at the recalculated face
- Our override blocks these lookAt calls
- Camera appears to move "off to the side" between blocks

**Impact**: 
- Override is working TOO WELL - blocking necessary camera adjustments
- `placeAt()` can't look at the faces it needs to click
- Placement might fail or succeed by luck
- Camera movement looks jerky and unnatural

---

## Testing Checklist

### Phase 1: Investigation
- [ ] Read `episode-handlers/builder.js` file
- [ ] Document what `placeAt()` does internally
- [ ] Document what `findPlaceReference()` returns
- [ ] Identify all camera movement calls in builder.js

### Phase 2: Test Hypothesis 1 (bot.look override)
- [ ] Add `bot.look()` override alongside `bot.lookAt()` override
- [ ] Test with builder bot
- [ ] Record camera behavior
- [ ] Check logs for camera angle changes
- [ ] ✅ CONFIRMED or ❌ REJECTED

### Phase 3: Test Hypothesis 2 (face recalculation)
- [ ] Add detailed logging before/after placeAt
- [ ] Log camera angles (yaw/pitch) before and after
- [ ] Log face vectors from both calls
- [ ] Test with builder bot
- [ ] Check if angles/faces differ
- [ ] ✅ CONFIRMED or ❌ REJECTED

### Phase 4: Test Hypothesis 3 (timing/race condition)
- [ ] Move override setup inside loop
- [ ] Add call counting and logging
- [ ] Test with builder bot
- [ ] Check if lookAt is called when blocked
- [ ] ✅ CONFIRMED or ❌ REJECTED

### Phase 5: Solution Implementation
- [ ] Based on confirmed hypothesis, implement proper fix
- [ ] Test fix with multiple structure types
- [ ] Verify smooth camera movement
- [ ] Document solution in code comments

---

## Success Criteria

**Bug is FIXED when**:
1. Builder bot looks at reference block face
2. Builder bot places block WITHOUT camera moving "off to the side"
3. Builder bot smoothly transitions to next block's face
4. No unnecessary camera movements between blocks
5. Camera only moves when intentionally looking at next target

---

## Notes and Observations

### Current Override Behavior
- Override is set ONCE at start of function (line 134)
- Override is restored ONCE at end of function (line 242)
- `allowLookAt` flag controls whether lookAt is allowed
- 500ms settle delay after each allowed lookAt

### Potential Issues
1. Override doesn't catch `bot.look(yaw, pitch)` calls
2. Override doesn't prevent pathfinder camera adjustments
3. `placeAt()` might have its own camera logic
4. Face calculation might differ between our code and placeAt

### Related Code Locations
- `episode-handlers/structureEval.js` lines 112-247: `placeMultipleWithDelay()`
- `episode-handlers/builder.js`: `placeAt()` function (need to read)
- `episode-handlers/builder.js`: `findPlaceReference()` function (need to read)
- `utils/movement.js`: `lookAtSmooth()` function (used elsewhere)

---

## Investigation Log

### Session 1: Initial Analysis
- **Date**: 2025-11-10
- **Findings**: Identified 3 hypotheses for camera movement bug
- **Next Steps**: Read builder.js, then test each hypothesis

### Session 2: [TO BE FILLED]
- **Date**: 
- **Hypothesis Tested**: 
- **Results**: 
- **Next Steps**: 

### Session 3: [TO BE FILLED]
- **Date**: 
- **Hypothesis Tested**: 
- **Results**: 
- **Next Steps**: 

### Session 4: Root Cause Discovery - Pathfinder Camera Control
- **Date**: 2025-11-10
- **Findings**: Pathfinder was controlling camera during movement
- **Solution**: Disable pathfinder camera control during block placement phase
- **Next Steps**: Test solution and document findings

### Session 4: Partial Success - Towers Fixed, Walls Still Broken
- **Date**: 2025-11-10
- **Findings**: 
  - Towers (2 blocks high): ✅ FIXED - Camera smooth, no snaps!
  - Walls (2x2): ❌ STILL BROKEN - Camera overshoots then corrects
- **Solution**: 
  - Replaced `bot.lookAt()` with `lookAtSmooth()` to prevent instant snaps
  - Added additional logging to track camera angles and face vectors
- **Next Steps**: Test with more structure types, document solution

---

## Quick Reference: Key Code Sections

### Override Setup (Lines 130-144)
```javascript
const originalLookAt = bot.lookAt.bind(bot);
bot.lookAt = async function(position, forceLook) {
  if (allowLookAt) {
    await originalLookAt(position, false);
    await sleep(LOOK_SETTLE_DELAY_MS);
  }
};
```

### Face Position Calculation (Lines 197-202)
```javascript
const lookAtFacePos = refBlock.position.offset(
  0.5 + faceVec.x * 0.5,
  0.5 + faceVec.y * 0.5,
  0.5 + faceVec.z * 0.5
);
```

### Critical Placement Section (Lines 206-219)
```javascript
allowLookAt = true;
await lookAtSmooth(bot, lookAtFacePos, 90);  // Smooth 90°/s rotation
allowLookAt = false;
const placed = await placeAt(bot, pos, itemName, options);  // BUG HERE
```

### Solution Implementation
```javascript
// utils/movement.js - initializePathfinder()
function initializePathfinder(bot, options = {}) {
  // ... existing code ...
  
  // Disable camera control if requested
  if (options.disableCamera) {
    bot.pathfinder.enablePathfinding = true; // Keep pathfinding enabled
    bot.pathfinder.enableLook = false; // Disable automatic camera control
    console.log(`[${bot.username}] Pathfinder camera control DISABLED`);
  } else {
    bot.pathfinder.enableLook = true; // Enable automatic camera control (default)
  }
}

// structureEval.js - placeMultipleWithDelay()
initializePathfinder(bot, {
  allowSprinting: false,
  allowParkour: false,
  canDig: false,
  allowEntityDetection: true,
  disableCamera: true, // Disable pathfinder camera control for smooth manual control
});

// structureEval.js - placeMultipleWithDelay()
// Replace bot.lookAt() with lookAtSmooth()
await lookAtSmooth(bot, lookAtFacePos, 90);  // Smooth 90°/s rotation
```

Follow these instructions to make the following change to my code document.

Instruction: Add Session 4 test results showing partial success with towers but continued issues with walls, and the additional fix needed to replace bot.lookAt with lookAtSmooth.

Code Edit:
```
### Next Steps

1. Test with `disableCamera: true`
2. Monitor logs for any remaining camera snaps
3. If placeAt() still causes snaps, we may need to override bot.lookAt() temporarily

---

## 📊 SESSION 4 TEST RESULTS (2025-11-10)

### ✅ Partial Success - Towers Fixed, Walls Still Broken

**Test Results:**
- **Towers (2 blocks high)**: ✅ FIXED - Camera smooth, no snaps!
- **Walls (2x2)**: ❌ STILL BROKEN - Camera overshoots then corrects

### Why Towers Worked But Walls Didn't

**Tower Placement:**
- Blocks placed vertically at same X/Z position
- Minimal horizontal camera movement needed
- Pathfinder camera disable was sufficient

**Wall Placement:**
- Blocks placed horizontally at different X/Z positions
- Requires significant horizontal camera rotation
- Additional camera snap source discovered!

### 🔍 The Second Camera Snap Source

Found on **line 216** in `structureEval.js`:
```javascript
await bot.lookAt(lookAtFacePos);  // ← INSTANT SNAP! 🚨
```

This is OUR code calling `bot.lookAt()` directly, causing instant camera snaps when looking at the reference block face before placement.

### The Complete Picture

**Two sources of camera snaps:**
1. ✅ **Pathfinder camera control** ← FIXED with `bot.pathfinder.enableLook = false`
2. ❌ **Our own bot.lookAt() call** ← Still using instant snap on line 216

### The Final Fix

Replace `bot.lookAt()` with `lookAtSmooth()`:

```javascript
// BEFORE (line 216):
await bot.lookAt(lookAtFacePos);  // Instant snap

// AFTER:
await lookAtSmooth(bot, lookAtFacePos, 90);  // Smooth 90°/s rotation
```

### Why This Completes The Solution

1. **Pathfinder disabled** → No snaps during movement ✅
2. **lookAtSmooth used** → No snaps when looking at block face ✅
3. **placeAt() override** → No snaps during placement (allowLookAt=false) ✅

### Expected Behavior After Both Fixes

**Tower (vertical placement):**
```
Move up → Camera stays → Smooth look at top face → Place → Smooth transition
```

**Wall (horizontal placement):**
```
Move sideways → Camera stays → Smooth look at side face → Place → Smooth transition
```

All camera movements should now be gradual and smooth for video recording! 🎥✨

---
