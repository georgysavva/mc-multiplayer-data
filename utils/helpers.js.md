# helpers.js Documentation

## Overview

`helpers.js` provides general-purpose utility functions used throughout the Minecraft bot system. This module contains timing utilities, random number generation, array operations, and inventory management helpers that support consistent behavior across all episodes and utilities.

## Core Functions

### Timing Utilities

#### sleep(ms)
Asynchronous sleep function for delaying execution.

**Parameters:** `ms` - Milliseconds to wait

**Returns:** Promise that resolves after specified delay

**Usage:**
```javascript
// Wait 1 second
await sleep(1000);

// Delay between actions
await performAction();
await sleep(500);
await performNextAction();
```

### Random Number Generation

#### rand(min, max)
Generates a random floating-point number in a specified range.

**Parameters:**
- `min` - Minimum value (inclusive)
- `max` - Maximum value (exclusive)

**Returns:** Random number between min and max

**Formula:** `Math.random() * (max - min) + min`

**Examples:**
```javascript
rand(1, 10)    // Random number from 1.0 to 9.999...
rand(0, 1)     // Random number from 0.0 to 0.999...
rand(-5, 5)    // Random number from -5.0 to 4.999...
```

#### choice(arr)
Selects a random element from an array.

**Parameters:** `arr` - Array to choose from

**Returns:** Random element from the array

**Implementation:**
```javascript
arr[Math.floor(Math.random() * arr.length)]
```

**Examples:**
```javascript
choice(['red', 'blue', 'green'])     // Random color
choice([1, 2, 3, 4, 5])            // Random number 1-5
choice([])                          // undefined (empty array)
```

### Inventory Management

#### equipFirst(bot, itemName, dest)
Equips the first item of specified type found in inventory.

**Parameters:**
- `bot` - Mineflayer bot instance
- `itemName` - Exact item name to search for
- `dest` - Equipment destination slot

**Destination Slots:**
- `'hand'` - Main hand
- `'torso'` - Chest armor
- `'head'` - Helmet
- `'legs'` - Leggings
- `'feet'` - Boots

**Process:**
1. Search inventory for item with exact name match
2. Equip first matching item to specified slot
3. Silent failure if item not found

## Usage Patterns

### Timing Control
```javascript
const { sleep } = require('./utils/helpers');

// Sequential actions with delays
await bot.chat("Starting sequence");
await sleep(1000);
await performAction1();
await sleep(500);
await performAction2();
```

### Random Behavior Generation
```javascript
const { rand, choice } = require('./utils/helpers');

// Random movement distance
const distance = rand(1, 5);

// Random direction choice
const direction = choice(['north', 'south', 'east', 'west']);

// Random delay
await sleep(rand(200, 800));
```

### Equipment Management
```javascript
const { equipFirst } = require('./utils/helpers');

// Equip armor pieces
await equipFirst(bot, 'iron_chestplate', 'torso');
await equipFirst(bot, 'iron_helmet', 'head');
await equipFirst(bot, 'iron_leggings', 'legs');
await equipFirst(bot, 'iron_boots', 'feet');

// Equip weapon
await equipFirst(bot, 'diamond_sword', 'hand');
```

## Integration Points

### Episode System Integration
- **Timing**: Used in all episodes for action sequencing
- **Randomization**: Provides behavioral variation
- **Equipment**: Called during episode setup phases

### Movement System Integration
- **Delays**: Controls action pacing in movement sequences
- **Randomness**: Adds natural variation to locomotion

### Building System Integration
- **Timing**: Manages delays between block placements
- **Equipment**: Ensures proper tools are equipped

## Technical Implementation

### Sleep Implementation
- Uses native `setTimeout` wrapped in Promise
- Non-blocking, allows other operations to continue
- Precise timing within Node.js limitations

### Random Generation
- Relies on `Math.random()` for pseudo-random numbers
- Uniform distribution across specified ranges
- Suitable for behavioral variation (not cryptography)

### Inventory Search
- Linear search through `bot.inventory.items()` array
- Exact string matching for item names
- Equips first match found (not necessarily best)

## Performance Characteristics

### Resource Usage
- **sleep()**: Minimal CPU, blocks execution thread
- **rand()**: Negligible CPU, pure computation
- **choice()**: O(1) array access
- **equipFirst()**: O(n) inventory search, n ≤ 36

### Execution Time
- **sleep(ms)**: Exactly `ms` milliseconds ± timer precision
- **rand()**: < 1 microsecond
- **choice()**: < 1 microsecond
- **equipFirst()**: 1-10 milliseconds (network operation)

## Error Handling

### Edge Cases
- **choice([])**: Returns `undefined` for empty arrays
- **equipFirst()**: Silent failure if item not found
- **rand(min, max)**: Works with negative ranges
- **sleep(0)**: Immediate resolution

### Type Safety
- Functions accept flexible input types
- No explicit validation (trusts caller)
- Array bounds handled automatically

## Testing Considerations

### Deterministic Testing
- Random functions use `Math.random()` (not controllable)
- Consider mocking for reproducible tests
- Test edge cases explicitly

### Performance Testing
- Measure timing precision for `sleep()`
- Verify random distribution uniformity
- Test inventory search with full inventory

## Future Enhancements

### Potential Features
- **Seeded Random**: Deterministic random number generation
- **Weighted Choice**: Probability-based array selection
- **Smart Equip**: Best item selection instead of first
- **Async Choice**: Database-backed random selection
- **Timing Utilities**: More sophisticated delay patterns
