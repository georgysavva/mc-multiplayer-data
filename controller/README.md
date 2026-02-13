# Controller

- forked repos
- inner working of controller
  - the loop
  - phases
  - communication
  - episode types
  - primitives
  - eval

The `controller/` package is the **Mineflayer-based agent runtime** that joins a Minecraft server as a bot (e.g. `Alpha` / `Bravo`), coordinates with its peer bot, and executes scripted “episodes” while emitting recording events and metadata.

This document explains:

- the controller process model and entrypoint,
- how Alpha/Bravo coordinate phases,
- how episodes are selected and executed,
- what files get written to disk,
- how to add a new episode type.

## Entry point and process model

In Docker Compose, each controller service runs:

- `controller/entrypoint.sh`: starts `Xvfb` (virtual display) and then `node controller/main.js ...`
- `controller/main.js`: parses args, creates the Mineflayer bot, creates a `BotCoordinator`, and registers the spawn handler.

Key files:

- `main.js`: wires together `parseArgs()` + `makeBot()` + `BotCoordinator` + `getOnSpawnFn()`.
- `config/args.js`: CLI arg parsing (`minimist`) and defaults.
- `utils/bot-factory.js`: Mineflayer bot + plugins (pathfinder, pvp, tool).

### Configuration sources

The controller reads configuration from two places:

- **CLI args**: passed by `controller/entrypoint.sh` and parsed by `config/args.js`.
- **Environment variables**: some behavior is gated by env vars directly in code (notably `EPISODE_TYPES`).

Important settings you’ll see in generated compose files:

- **Minecraft connection**: `MC_HOST`, `MC_PORT`, `MC_VERSION`
- **RCON**: `RCON_HOST`, `RCON_PORT`, `RCON_PASSWORD`
- **Coordination TCP**: `COORD_PORT`, `OTHER_COORD_HOST`, `OTHER_COORD_PORT`
- **Act recorder**: `ACT_RECORDER_HOST`, `ACT_RECORDER_PORT`
- **Outputs**: `OUTPUT_DIR`, `INSTANCE_ID`, `EPISODE_START_ID`
- **Episode selection**: `EPISODES_NUM`, `EPISODE_TYPES`, `SMOKE_TEST`, `WORLD_TYPE`
- **Recording / performance**: `VIEWER_RENDERING_DISABLED`, `VIEWER_RECORDING_INTERVAL`

## Coordination: Alpha/Bravo phase protocol

Alpha and Bravo coordinate via TCP sockets using `utils/coordination.js`:

- Each bot starts a TCP **server** on `coord_port`.
- Each bot also starts a TCP **client** that connects to the peer (`other_coord_host:other_coord_port`).
- Messages are newline-delimited JSON objects: `{ eventName, eventParams }`.
- Event names are **scoped by episode number**:

`episode_<episodeNum>_<phaseName>`

The coordinator provides:

- `sendToOtherBot(phaseName, params, episodeNum, locationTag)`
- `onceEvent(phaseName, episodeNum, handler)` (wraps the handler and tracks in-flight phase handlers)
- `waitForAllPhasesToFinish()` (used to ensure all asynchronous phase handlers settle before teardown)
- `syncBots(episodeNum)` (a simple barrier at end of episode)

### Typical phase order (per episode)

The main episode orchestration lives in `episode-handlers/index.js` and follows a repeated phase pattern:

1. **teleportPhase**  
   One bot (deterministically: `bot.username < other_bot_name`) performs teleporting via RCON commands (primarily `spreadplayers`).

2. **postTeleportPhase**  
   Post-TP synchronization and state capture.

3. **setupEpisodePhase**  
   Episode-specific setup runs via `episodeInstance.setupEpisode(...)` (optional override).

4. **startRecordingPhase**  
   The controller signals episode start by emitting `bot.emit("startepisode", episodeNum)`, then calls `episodeInstance.entryPoint(...)`.

5. **stopPhase / stoppedPhase**  
   On normal completion or error, the episode stop handler triggers `bot.emit("endepisode")` and waits for an `episodeended` signal before resolving the episode’s promise.

Errors are handled by notifying the peer (`peerErrorPhase_<episodeNum>`) and forcing both bots into a coordinated stop.

## Episode selection and execution

Episodes are implemented as classes in `episode-handlers/` and `episode-handlers/eval/`.

### Episode type lists

`episode-handlers/index.js` maintains:

- `episodeClassMap`: mapping from string type → class implementation
- `defaultEpisodeTypes`: the default list

Episode types can be restricted at runtime via the **environment variable**:

- `EPISODE_TYPES=all` (default behavior)
- `EPISODE_TYPES=walkLook,chase,orbit` (comma-separated explicit list)

### Sampling behavior

For non-smoke-test runs, episode types are sampled by `utils/episode-weights.js`:

- Default weight is \(1/\sqrt{\text{typical length}}\) so short episodes are sampled more often.
- When the default episode list is used, eval episodes are typically filtered out for training-style runs.

For smoke tests (`SMOKE_TEST=1`), the controller cycles deterministically through eligible episode types in alphabetical order.

### Flat vs normal world

Eligibility depends on `WORLD_TYPE`:

- in a **flat** world, all configured types are eligible
- in a **normal** world, only episode classes with:

`static WORKS_IN_NON_FLAT_WORLD = true`

are eligible (see `episode-handlers/base-episode.js`).

## Recording and outputs

The controller produces several artifacts.

### Action trace + prismarine-rendered video (act recorder)

The controller uses a headless prismarine viewer (`prismarine-viewer-colalab`) to stream per-frame state to the act recorder:

- `controller/act_recorder/act_recorder.py` listens on a TCP port and writes:
  - `<timestamp>_<episode>_<bot>_instance_<id>.json` (per-frame state with timestamps)
  - `<timestamp>_<episode>_<bot>_instance_<id>_meta.json` (timing/fps metadata)
  - `<timestamp>_<episode>_<bot>_instance_<id>.mp4` (only if `VIEWER_RENDERING_DISABLED=0`)

All act-recorder outputs go into the compose-mounted `OUTPUT_DIR` (typically the batch `.../output/` directory).

### Episode info metadata (controller)

After each episode, the controller writes an `*_episode_info.json` file into `output_dir` containing:

- episode number/type, instance id, world type
- error flags (`encountered_error`, `peer_encountered_error`, `bot_died`)
- whether recording started
- optional eval metadata for eval episodes

### Camera readiness gating

If `ENABLE_CAMERA_WAIT=1`, controllers will block until both `CameraAlpha` and `CameraBravo` have joined the server (checked via RCON `list`), using `utils/camera-ready.js`.

## Adding a new episode

To add a new episode type end-to-end:

1. **Create an episode class**
   - Add a new file under `episode-handlers/` (or `episode-handlers/eval/` for eval episodes).
   - Implement `entryPoint(...)` (required).
   - Optionally implement `setupEpisode(...)` and/or `tearDownEpisode(...)`.
   - If it works in non-flat worlds, set:
     - `static WORKS_IN_NON_FLAT_WORLD = true`

2. **Register it**
   - Import the class in `episode-handlers/index.js`.
   - Add it to `episodeClassMap`.
   - Add its string name to `defaultEpisodeTypes` if you want it enabled by default.

3. **Add typical length**
   - Add the type to `utils/episode-weights.js` (`episodeTypicalLengths`) so sampling works.

4. **(If eval episode) include in eval detection**
   - Add the class to `evalEpisodeClasses` in `episode-handlers/index.js` if it should be treated as an eval episode for eval-specific behavior (like `EVAL_TIME_SET_DAY`).
