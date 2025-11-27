# Intelligent Placement Sequencing Implementation

## 🎯 Goal
Fix the build-house episode by implementing intelligent placement ordering that ensures bots never stand on blocks they need to place.

## 📋 Implementation Task List

---

### **Phase 1: Add Helper Functions to `utils/building.js`**

#### ✅ Task 1.1: Add `calculateFloorPlacementOrder()` function
**Status:** ✅ Complete

**Location:** `utils/building.js` (after line 8, after `scaffoldBlocks` declaration)

**What to add:**
```javascript
/**
 * Calculate placement order for floor blocks (edge-to-center spiral)
 * Strategy: Place perimeter first, then work inward layer by layer
 * This ensures bots never stand on unplaced blocks
 * @param {number} width - Width of floor (default 5)
 * @param {number} depth - Depth of floor (default 5)
 * @returns {Array<{x: number, z: number, order: number}>} Ordered positions
 */
function calculateFloorPlacementOrder(width = 5, depth = 5) {
  const positions = [];
  let order = 0;
  
  // Work from outside edge inward (layer by layer)
  let minX = 0, maxX = width - 1;
  let minZ = 0, maxZ = depth - 1;
  
  while (minX <= maxX && minZ <= maxZ) {
    // Top edge (left to right)
    for (let x = minX; x <= maxX; x++) {
      positions.push({ x, z: minZ, order: order++ });
    }
    minZ++;
    
    // Right edge (top to bottom)
    for (let z = minZ; z <= maxZ; z++) {
      positions.push({ x: maxX, z, order: order++ });
    }
    maxX--;
    
    // Bottom edge (right to left)
    if (minZ <= maxZ) {
      for (let x = maxX; x >= minX; x--) {
        positions.push({ x, z: maxZ, order: order++ });
      }
      maxZ--;
    }
    
    // Left edge (bottom to top)
    if (minX <= maxX) {
      for (let z = maxZ; z >= minZ; z--) {
        positions.push({ x: minX, z, order: order++ });
      }
      minX++;
    }
  }
  
  return positions;
}
```

**Expected result:** Floor blocks will be placed in a spiral pattern from edges to center.

---

#### ✅ Task 1.2: Add `getPerimeterPosition()` helper function
**Status:** ✅ Complete

**Location:** `utils/building.js` (after `calculateFloorPlacementOrder()`)

**What to add:**
```javascript
/**
 * Helper: Get perimeter position for clockwise ordering
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate
 * @returns {number} Position along perimeter
 */
function getPerimeterPosition(x, z) {
  // South wall (z=0): positions 0-4
  if (z === 0) return x;
  // East wall (x=4): positions 5-8
  if (x === 4) return 5 + (z - 1);
  // North wall (z=4): positions 9-12
  if (z === 4) return 9 + (4 - x);
  // West wall (x=0): positions 13-15
  if (x === 0) return 13 + (4 - z - 1);
  return 999; // Should never happen
}
```

**Expected result:** Helper function for wall ordering.

---

#### ✅ Task 1.3: Add `calculateWallPlacementOrder()` function
**Status:** ✅ Complete

**Location:** `utils/building.js` (after `getPerimeterPosition()`)

**What to add:**
```javascript
/**
 * Calculate placement order for wall blocks
 * Strategy: Bottom-up, corners first, then edges
 * @param {Array<{x: number, y: number, z: number}>} wallBlocks - Wall block positions
 * @returns {Map<string, number>} Map of "x,y,z" -> order
 */
function calculateWallPlacementOrder(wallBlocks) {
  const orderMap = new Map();
  let order = 0;
  
  // Group by Y level (bottom to top)
  const byLevel = {};
  for (const block of wallBlocks) {
    const key = block.y;
    if (!byLevel[key]) byLevel[key] = [];
    byLevel[key].push(block);
  }
  
  // Process each level
  const levels = Object.keys(byLevel).map(Number).sort((a, b) => a - b);
  
  for (const y of levels) {
    const levelBlocks = byLevel[y];
    
    // Sort by distance from corners (corners first)
    // Corners are at (0,0), (4,0), (0,4), (4,4)
    const sorted = levelBlocks.slice().sort((a, b) => {
      const isCornerA = (a.x === 0 || a.x === 4) && (a.z === 0 || a.z === 4);
      const isCornerB = (b.x === 0 || b.x === 4) && (b.z === 0 || b.z === 4);
      
      if (isCornerA && !isCornerB) return -1;
      if (!isCornerA && isCornerB) return 1;
      
      // Then by perimeter position (clockwise from south-west)
      const perimeterA = getPerimeterPosition(a.x, a.z);
      const perimeterB = getPerimeterPosition(b.x, b.z);
      return perimeterA - perimeterB;
    });
    
    // Assign orders
    for (const block of sorted) {
      orderMap.set(`${block.x},${block.y},${block.z}`, order++);
    }
  }
  
  return orderMap;
}
```

**Expected result:** Walls will be placed bottom-up, corners first.

---

#### ✅ Task 1.4: Add `calculateRoofPlacementOrder()` function
**Status:** ✅ Complete

**Location:** `utils/building.js` (after `calculateWallPlacementOrder()`)

**What to add:**
```javascript
/**
 * Calculate placement order for roof blocks
 * Strategy: Similar to floor (edge-to-center) but bots are below
 * @param {number} width - Width of roof (default 5)
 * @param {number} depth - Depth of roof (default 5)
 * @returns {Array<{x: number, z: number, order: number}>} Ordered positions
 */
function calculateRoofPlacementOrder(width = 5, depth = 5) {
  // Roof can use same strategy as floor since bots are below
  // But we might want to place from edges inward for stability
  return calculateFloorPlacementOrder(width, depth);
}
```

**Expected result:** Roof blocks will be placed edge-to-center.

---

### **Phase 2: Update `makeHouseBlueprint5x5()` in `utils/building.js`**

#### ✅ Task 2.1: Update function JSDoc comment
**Status:** ✅ Complete

**Location:** Line 11 in `utils/building.js`

**Change:**
```javascript
// FROM:
 * @returns {Array<Object>} Array of {x, y, z, block, phase, data}

// TO:
 * @returns {Array<Object>} Array of {x, y, z, block, phase, placementOrder, data}
```

**Expected result:** Documentation reflects new `placementOrder` field.

---

#### ✅ Task 2.2: Update FLOOR phase to use placement order
**Status:** ✅ Complete

**Location:** Lines 157-177 in `utils/building.js`

**Replace:**
```javascript
// PHASE 1: FLOOR (y=0, 5x5 grid)
for (let x = 0; x < 5; x++) {
  for (let z = 0; z < 5; z++) {
    blueprint.push({
      x,
      y: 0,
      z,
      block: materials.floor,
      phase: "floor",
      data: null,
    });
  }
}
```

**With:**
```javascript
// PHASE 1: FLOOR (y=0, 5x5 grid) with edge-to-center placement order
const floorOrder = calculateFloorPlacementOrder(5, 5);
const floorOrderMap = new Map();
for (const pos of floorOrder) {
  floorOrderMap.set(`${pos.x},${pos.z}`, pos.order);
}

for (let x = 0; x < 5; x++) {
  for (let z = 0; z < 5; z++) {
    const placementOrder = floorOrderMap.get(`${x},${z}`);
    blueprint.push({
      x,
      y: 0,
      z,
      block: materials.floor,
      phase: "floor",
      placementOrder: placementOrder !== undefined ? placementOrder : 999,
      data: null,
    });
  }
}
```

**Expected result:** Floor blocks have `placementOrder` field with spiral pattern.

---

#### ✅ Task 2.3: Update WALLS phase to use placement order
**Status:** ✅ Complete

**Location:** Lines 179-224 in `utils/building.js`

**Replace the entire PHASE 2 section with:**
```javascript
// PHASE 2: WALLS (y=1 to y=3, hollow ring)
// Collect all wall blocks first, then assign orders
const wallBlocks = [];

// Door will be at (x=2, z=0) so we skip those positions
for (let y = 1; y <= 3; y++) {
  // South wall (z=0) - skip door positions
  for (let x = 0; x < 5; x++) {
    if (!(x === 2 && (y === 1 || y === 2))) {
      wallBlocks.push({ x, y, z: 0 });
    }
  }

  // North wall (z=4)
  for (let x = 0; x < 5; x++) {
    wallBlocks.push({ x, y, z: 4 });
  }

  // West wall (x=0, skip corners already done)
  for (let z = 1; z < 4; z++) {
    wallBlocks.push({ x: 0, y, z });
  }

  // East wall (x=4, skip corners already done)
  for (let z = 1; z < 4; z++) {
    wallBlocks.push({ x: 4, y, z });
  }
}

// Calculate wall placement order
const wallOrderMap = calculateWallPlacementOrder(wallBlocks);

// Add walls to blueprint with placement order
for (const wall of wallBlocks) {
  const orderKey = `${wall.x},${wall.y},${wall.z}`;
  const placementOrder = wallOrderMap.get(orderKey);
  blueprint.push({
    x: wall.x,
    y: wall.y,
    z: wall.z,
    block: materials.walls,
    phase: "walls",
    placementOrder: placementOrder !== undefined ? placementOrder : 999,
    data: null,
  });
}
```

**Expected result:** Wall blocks have `placementOrder` field with bottom-up, corners-first pattern.

---

#### ✅ Task 2.4: Update DOOR phase to add placement order
**Status:** ✅ Complete

**Location:** Lines 226-245 in `utils/building.js`

**Add `placementOrder` field to both door blocks:**
```javascript
// PHASE 3: DOOR (south wall, centered at x=2, z=0)
// Doors placed after walls, order doesn't matter much
blueprint.push({
  x: 2,
  y: 1,
  z: 0,
  block: materials.door,
  phase: "door",
  placementOrder: 0, // Lower door first
  data: { half: "lower", facing: "south" },
});
blueprint.push({
  x: 2,
  y: 2,
  z: 0,
  block: materials.door,
  phase: "door",
  placementOrder: 1, // Upper door second
  data: { half: "upper", facing: "south" },
});
```

**Expected result:** Door blocks have sequential `placementOrder`.

---

#### ✅ Task 2.5: Update WINDOWS phase to add placement order
**Status:** ✅ Complete

**Location:** Lines 247-289 in `utils/building.js`

**Add counter and `placementOrder` field:**
```javascript
// PHASE 4: WINDOWS (glass panes at y=2)
// Windows can be placed in any order after walls
let windowOrder = 0;

// South windows flanking door
blueprint.push({
  x: 1,
  y: 2,
  z: 0,
  block: materials.windows,
  phase: "windows",
  placementOrder: windowOrder++,
  data: null,
});
blueprint.push({
  x: 3,
  y: 2,
  z: 0,
  block: materials.windows,
  phase: "windows",
  placementOrder: windowOrder++,
  data: null,
});
// West window
blueprint.push({
  x: 0,
  y: 2,
  z: 2,
  block: materials.windows,
  phase: "windows",
  placementOrder: windowOrder++,
  data: null,
});
// East window
blueprint.push({
  x: 4,
  y: 2,
  z: 2,
  block: materials.windows,
  phase: "windows",
  placementOrder: windowOrder++,
  data: null,
});
```

**Expected result:** Window blocks have sequential `placementOrder`.

---

#### ✅ Task 2.6: Update ROOF phase to use placement order
**Status:** ✅ Complete

**Location:** Lines 291-311 in `utils/building.js`

**Replace:**
```javascript
// PHASE 5: ROOF (flat roof at y=4, 5x5 grid)
for (let x = 0; x < 5; x++) {
  for (let z = 0; z < 5; z++) {
    blueprint.push({
      x,
      y: 4,
      z,
      block: materials.roof,
      phase: "roof",
      data: null,
    });
  }
}
```

**With:**
```javascript
// PHASE 5: ROOF (flat roof at y=4, 5x5 grid) with edge-to-center order
const roofOrder = calculateRoofPlacementOrder(5, 5);
const roofOrderMap = new Map();
for (const pos of roofOrder) {
  roofOrderMap.set(`${pos.x},${pos.z}`, pos.order);
}

for (let x = 0; x < 5; x++) {
  for (let z = 0; z < 5; z++) {
    const placementOrder = roofOrderMap.get(`${x},${z}`);
    blueprint.push({
      x,
      y: 4,
      z,
      block: materials.roof,
      phase: "roof",
      placementOrder: placementOrder !== undefined ? placementOrder : 999,
      data: null,
    });
  }
}
```

**Expected result:** Roof blocks have `placementOrder` field with edge-to-center pattern.

---

### **Phase 3: Update `buildPhase()` in `utils/building.js`**

#### ✅ Task 3.1: Update sorting logic to respect `placementOrder`
**Status:** ⬜ Not Started

**Location:** Lines 357-364 in `utils/building.js`

**Replace:**
```javascript
// Sort positions: bottom-up (Y), then near-to-far
const botPos = bot.entity.position;
const sorted = targets.slice().sort((a, b) => {
  if (a.worldPos.y !== b.worldPos.y) return a.worldPos.y - b.worldPos.y;
  const distA = botPos.distanceTo(a.worldPos);
  const distB = botPos.distanceTo(a.worldPos);
  return distA - distB;
});
```

**With:**
```javascript
// Sort positions: Use placementOrder if available, otherwise fallback to Y-level then distance
const botPos = bot.entity.position;
const sorted = targets.slice().sort((a, b) => {
  // Primary sort: placementOrder (if both have it)
  if (a.placementOrder !== undefined && b.placementOrder !== undefined) {
    return a.placementOrder - b.placementOrder;
  }
  
  // Fallback sort: Y-level (bottom-up), then distance (near-to-far)
  if (a.worldPos.y !== b.worldPos.y) return a.worldPos.y - b.worldPos.y;
  const distA = botPos.distanceTo(a.worldPos);
  const distB = botPos.distanceTo(b.worldPos);
  return distA - distB;
});
```

**Expected result:** Blocks are sorted by `placementOrder` when available, with fallback to existing logic.

---

### **Phase 4: Add Bot Pre-Positioning in `build-house-episode.js`**

#### ✅ Task 4.1: Add mineflayer-pathfinder import
**Status:** ⬜ Not Started

**Location:** Line 19 in `build-house-episode.js` (after other imports)

**Add:**
```javascript
const { goals } = require("mineflayer-pathfinder");
```

**Expected result:** `goals.GoalNear` is available for pathfinding.

---

#### ✅ Task 4.2: Add Step 3a - Bot pre-positioning
**Status:** ⬜ Not Started

**Location:** After line 174 in `build-house-episode.js` (after logging house origin)

**Add:**
```javascript
// STEP 3a: Move bots to starting positions OUTSIDE house footprint
console.log(`[${bot.username}] 🚶 STEP 3a: Moving to starting position outside house...`);

// Calculate starting position based on bot assignment
// Alpha goes WEST of house, Bravo goes EAST of house
// This ensures bots are not standing on floor blocks that need to be placed
const startingPos = bot.username === "Alpha" 
  ? worldOrigin.offset(-3, 0, 2)  // 3 blocks west of house, centered on Z
  : worldOrigin.offset(8, 0, 2);   // 3 blocks east of house (5 wide + 3), centered on Z

console.log(
  `[${bot.username}]    Starting position: (${startingPos.x}, ${startingPos.y}, ${startingPos.z})`
);

// Use pathfinder to move to starting position
bot.pathfinder.setGoal(new goals.GoalNear(startingPos.x, startingPos.y, startingPos.z, 1));
await sleep(3000); // Wait for movement
bot.pathfinder.setGoal(null);

console.log(`[${bot.username}] ✅ Moved to starting position`);
```

**Expected result:** Bots move outside the house footprint before building starts.

---

## ✅ Testing Checklist

After all tasks are complete, test the implementation:

- [ ] Run `.\build_and_deploy_windows.ps1`
- [ ] Verify bots move to starting positions (Step 3a logs)
- [ ] Verify floor blocks placed in spiral order (check logs for sequence)
- [ ] Verify no "Lost line of sight after looking" errors
- [ ] Verify floor phase success rate > 90%
- [ ] Verify walls built bottom-up, corners first
- [ ] Verify episode completes successfully
- [ ] Verify house is fully built (all 102 blocks)

---

## 📊 Expected Behavior

### Floor Placement Pattern (Edge-to-Center):
```
    0   1   2   3   4  (X-axis)
  ┌───┬───┬───┬───┬───┐
0 │ 0 │ 1 │ 2 │ 3 │ 4 │  ← Perimeter (orders 0-15)
  ├───┼───┼───┼───┼───┤
1 │15 │16 │17 │18 │ 5 │  ← Inner ring (orders 16-23)
  ├───┼───┼───┼───┼───┤
2 │14 │23 │24 │19 │ 6 │  ← Center (order 24)
  ├───┼───┼───┼───┼───┤
3 │13 │22 │21 │20 │ 7 │
  ├───┼───┼───┼───┼───┤
4 │12 │11 │10 │ 9 │ 8 │
  └───┴───┴───┴───┴───┘
```

### Bot Starting Positions:
```
     Alpha                House (5x5)              Bravo
(-3, 64, 2)          (0-4, 64, 0-4)           (8, 64, 2)
     ●                  ▓▓▓▓▓                     ●
                       ▓   ▓
                       ▓ D ▓
                       ▓   ▓
                       ▓▓▓▓▓
```

---

## 🎯 Success Criteria

✅ All 102 blocks placed successfully  
✅ No placement failures due to line-of-sight issues  
✅ Bots never stand on unplaced blocks  
✅ Episode completes without errors  
✅ House is structurally complete with floor, walls, door, windows, and roof
