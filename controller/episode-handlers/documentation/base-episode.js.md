# base-episode.js Documentation

## Overview

`base-episode.js` provides the foundational abstract class for all episode implementations in the Minecraft multiplayer data collection system. It establishes the common lifecycle, coordination patterns, and error handling that all episodes inherit.

## Class: BaseEpisode

### Static Properties

| Property                  | Default             | Description                                             |
| ------------------------- | ------------------- | ------------------------------------------------------- |
| `INIT_MIN_BOTS_DISTANCE`  | `MIN_BOTS_DISTANCE` | Minimum distance bots should maintain during episode    |
| `INIT_MAX_BOTS_DISTANCE`  | `MAX_BOTS_DISTANCE` | Maximum distance bots should maintain during episode    |
| `WORKS_IN_NON_FLAT_WORLD` | `false`             | Whether episode is compatible with non-flat world types |

### Constructor

```javascript
constructor(sharedBotRng);
```

**Parameters:**

- `sharedBotRng` - Shared random number generator (currently unused in base class)

### Lifecycle Methods

#### async setupEpisode(bot, rcon, sharedBotRng, coordinator, episodeNum, args)

Optional setup hook called before episode execution. No-op by default.

**Parameters:**

- `bot` - Mineflayer bot instance
- `rcon` - RCON connection
- `sharedBotRng` - Shared random number generator
- `coordinator` - Bot coordinator instance
- `episodeNum` - Current episode number
- `args` - Configuration arguments

**Returns:** `Promise<void>`

#### async entryPoint(bot, rcon, sharedBotRng, coordinator, iterationID, episodeNum, args)

**Abstract method** - Main episode logic that must be implemented by subclasses.

**Parameters:**

- `bot` - Mineflayer bot instance
- `rcon` - RCON connection
- `sharedBotRng` - Shared random number generator
- `coordinator` - Bot coordinator instance
- `iterationID` - Current iteration ID
- `episodeNum` - Current episode number
- `args` - Configuration arguments

**Returns:** `Promise<any>`

#### async tearDownEpisode(bot, rcon, sharedBotRng, coordinator, episodeNum, args)

Optional cleanup hook called after episode completion. No-op by default.

**Parameters:**

- `bot` - Mineflayer bot instance
- `rcon` - RCON connection
- `sharedBotRng` - Shared random number generator
- `coordinator` - Bot coordinator instance
- `episodeNum` - Current episode number
- `args` - Configuration arguments

**Returns:** `Promise<void>`

### Phase Management

#### getOnStopPhaseFn(bot, rcon, sharedBotRng, coordinator, otherBotName, episodeNum, args)

Creates the stop phase handler function that manages episode termination.

**Stop Phase Sequence:**

1. Sets `_episodeStopping = true` to prevent duplicate stops
2. Emits "endepisode" event to stop recording
3. Waits for recording to end
4. Sets up listener for "stoppedPhase" from other bot
5. Sends "stoppedPhase" to other bot

**Returns:** `Function` - Async function handling stop phase

#### getOnStoppedPhaseFn(bot, sharedBotRng, coordinator, otherBotName, episodeNum, episodeResolve)

Creates the stopped phase handler that resolves the episode promise.

**Returns:** `Function` - Async function handling stopped phase

## Usage Pattern

All episode implementations should extend `BaseEpisode`:

```javascript
const { BaseEpisode } = require("./base-episode");

class MyCustomEpisode extends BaseEpisode {
  static WORKS_IN_NON_FLAT_WORLD = true;
  static INIT_MIN_BOTS_DISTANCE = 5;
  static INIT_MAX_BOTS_DISTANCE = 15;

  async entryPoint(
    bot,
    rcon,
    sharedBotRng,
    coordinator,
    iterationID,
    episodeNum,
    args,
  ) {
    // Implement episode logic here

    // Transition to stop phase when complete
    coordinator.onceEvent(
      "stopPhase",
      episodeNum,
      this.getOnStopPhaseFn(
        bot,
        rcon,
        sharedBotRng,
        coordinator,
        args.other_bot_name,
        episodeNum,
        args,
      ),
    );
    coordinator.sendToOtherBot(
      "stopPhase",
      bot.entity.position.clone(),
      episodeNum,
      "episode complete",
    );
  }
}

module.exports = { MyCustomEpisode };
```

## Error Handling

The base class provides comprehensive error handling:

- Episode-scoped error capture
- Automatic transition to stop phase on errors
- Prevention of duplicate stop sequences
- Graceful episode termination

## Integration

Base episodes integrate with the coordinator system through:

- Phase-based communication patterns
- Shared random number generation
- Recording lifecycle management
- Bot synchronization primitives

## Dependencies

- `../utils/constants` - For distance constants
- `../utils/helpers` - For sleep utility
