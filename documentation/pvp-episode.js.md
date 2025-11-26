# pvp-episode.js Documentation

## Overview

`pvp-episode.js` implements player versus player (PvP) combat episodes where bots engage in direct combat using the mineflayer-pvp plugin. This episode evaluates combat AI, attack patterns, and battle strategy in controlled scenarios.

## Class: PvpEpisode (Not Exported)

The file defines functions but doesn't export a class. PvP functionality is handled through phase functions.

## Configuration Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `PVP_DURATION_MS_MIN` | `10000` | Minimum combat duration (10 seconds) |
| `PVP_DURATION_MS_MAX` | `15000` | Maximum combat duration (15 seconds) |
| `ATTACK_COOLDOWN_MS` | `500` | Cooldown between attacks |
| `MELEE_RANGE` | `3` | Attack engagement range |
| `APPROACH_DISTANCE` | `2` | Pathfinder approach distance |
| `COMBAT_LOOP_INTERVAL_MS` | `100` | Combat monitoring frequency |
| `MIN_SPAWN_DISTANCE` | `8` | Minimum spawn separation |
| `MAX_SPAWN_DISTANCE` | `15` | Maximum spawn separation |
| `INITIAL_EYE_CONTACT_MS` | `500` | Initial eye contact duration |

## Core Combat Functions

### pvpCombatLoop(bot, targetBotName, durationMs)
Main PvP combat execution using mineflayer-pvp plugin.

**Features:**
- Attack tracking via playerHurt events
- Health monitoring and logging
- Combat duration control
- Death handling (continues episode)
- Target validation and recovery

**Combat Statistics:**
- Total attacks landed
- Combat duration
- Attacks per second
- Health tracking
- Distance monitoring

### Combat Flow
```javascript
// 1. Acquire target entity
const targetEntity = bot.nearestEntity(/* target validation */);

// 2. Start PvP plugin attack
bot.pvp.attack(targetEntity);

// 3. Monitor combat for duration
while (Date.now() - startTime < durationMs) {
  // Health logging every 3 seconds
  // Death detection
  // Target validation
}
```

## Episode Characteristics

**Combat Focus:**
- Direct player vs player engagement
- Mineflayer-pvp plugin integration
- Attack pattern analysis
- Health and damage tracking

**Key Features:**
- Randomized combat duration (10-15 seconds)
- Automatic weapon equipping
- Combat statistics collection
- Death continuation (episode doesn't end on death)

## Integration Points

### Fighting System Integration
- Uses `giveRandomSword()` for weapon distribution
- Leverages `equipSword()` for combat preparation
- Integrates with PvP attack systems

### Coordinator Integration
- Phase-based communication via `pvpPhase_${iterationID}`
- Proper stop phase transitions
- Episode recording lifecycle support

## Usage Examples

### Manual Combat
```javascript
// Direct PvP combat execution
await pvpCombatLoop(bot, "Bravo", 12000);
// Bot will fight Bravo for 12 seconds using PvP plugin
```

## Performance Characteristics

### Resource Usage
- **CPU**: High (combat calculations, entity tracking, PvP plugin)
- **Memory**: Moderate (attack tracking, entity references)
- **Network**: Moderate (PvP coordination, attack events)

### Combat Metrics
- **Duration**: 10-15 seconds per engagement
- **Attack Rate**: Variable based on PvP plugin behavior
- **Health Tracking**: Continuous monitoring
- **Success Rate**: Depends on bot positioning and PvP effectiveness

## Testing Considerations

### Deterministic Behavior
- Combat duration based on shared RNG
- Position calculations for spawn separation
- Weapon assignment consistency

### Edge Cases
- **Target Loss**: Handling when opponent becomes invalid
- **Bot Death**: Continued episode execution despite death
- **Combat Stalemates**: Timeout protection
- **Weapon Issues**: Fallback behavior without weapons

### Debug Features
- Comprehensive attack logging
- Health status monitoring
- Distance calculations
- Combat statistics reporting
