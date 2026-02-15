Episode Types
=============

Episode handlers live in ``controller/episode-handlers/``. Episode type selection is
controlled via the ``EPISODE_TYPES`` environment variable:

- **Default**: if ``EPISODE_TYPES`` is unset (or set to ``all``), the controller samples
  from its built-in default list.
- **Custom list**: set ``EPISODE_TYPES`` to a comma-separated list of episode type
  strings, e.g. ``EPISODE_TYPES=walkLook,chase,pvp``.

Episode types are split into **Training** (default non-eval scenarios) and **Eval**
(episodes used for evaluation). Eval handlers live under ``controller/episode-handlers/eval/``.

.. _adding-new-episode-type:

Adding a new episode type
-------------------------

To add a new episode type:

1. **Create the handler module** in ``controller/episode-handlers/`` (or
   ``controller/episode-handlers/eval/`` for eval episodes). The module must export a
   class that extends ``BaseEpisode`` from ``./base-episode.js``.

2. **Implement the episode class**:

   - Override **``entryPoint(bot, rcon, sharedBotRng, coordinator, iterationID, episodeNum, args)``**
     (required). This is the main episode logic; use ``coordinator.onceEvent()`` and
     ``coordinator.sendToOtherBot()`` to synchronize phases between the two bots.
   - Override **``setupEpisode(...)``** and/or **``tearDownEpisode(...)``** if you need
     pre/post hooks (e.g. teleport, equip items, reset world state). Both receive
     ``botPosition`` and ``otherBotPosition``; return ``{ botPositionNew, otherBotPositionNew }``
     if you change positions.
   - Set **``static WORKS_IN_NON_FLAT_WORLD = true``** if the episode supports
     non-flat worlds (optional; default is ``false``).
   - Optionally override **``static INIT_MIN_BOTS_DISTANCE``** / **``INIT_MAX_BOTS_DISTANCE``**
     for spawn distance constraints.

3. **Register the episode in** ``controller/episodes-loop.js``:

   - Add a ``require()`` for your episode class.
   - Add an entry to **``episodeClassMap``** mapping the episode type string (e.g.
     ``myNewEpisode``) to your class.
   - For **eval** episodes only: add your class to the **``evalEpisodeClasses``** array
     (used for ``isEvalEpisode()``).
   - To include it in the default set when ``EPISODE_TYPES`` is unset, add the type
     string to **``defaultEpisodeTypes``**.

4. **Add a typical length** in ``controller/utils/episode-weights.js``: add your
   episode type key and a typical duration in seconds to **``episodeTypicalLengths``**.
   This is used for weighted sampling (shorter episodes are sampled more often). If
   the type is missing, ``selectWeightedEpisodeType()`` will throw.

5. **Use the new type** by setting ``EPISODE_TYPES`` to a comma-separated list that
   includes your type (e.g. ``EPISODE_TYPES=walkLook,myNewEpisode``), or leave
   ``EPISODE_TYPES`` unset and add the type to ``defaultEpisodeTypes``.

For phase synchronization, follow the pattern used in existing handlers: one bot
registers ``coordinator.onceEvent("phaseName", episodeNum, handlerFn)`` and both
call ``coordinator.sendToOtherBot("phaseName", position, episodeNum, message)`` so
the other bot’s handler runs. Use ``episodeInstance.getOnStopPhaseFn(...)`` for the
standard stop/teardown phase.

.. _training-episode-types:

Training
--------

Below are the **14 main training episode types** and what they do.

``straightLineWalk`` (``episode-handlers/straight-line-episode.js``)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

- **What**: One bot walks in a straight line *past* the other bot while keeping gaze;
  the other bot stays put and looks.
- **Roles**: Decided each phase using shared RNG; either the lexicographically
  lower-name bot walks, or the higher-name bot walks.
- **Notable parameters**:

  - Walk past target by **4–8 blocks**.
  - Pathfinding timeout: **20s**.

- **World support**: ``WORKS_IN_NON_FLAT_WORLD = true``.

``chase`` (``episode-handlers/chase-episode.js``)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

- **What**: One bot chases, the other runs away using pathfinder (with digging/placing
  allowed for the runner).
- **Roles**: ``decidePrimaryBot(...)`` picks chaser vs runner (shared RNG, symmetric).
- **Notable parameters**:

  - Chase duration: **5–15s**.
  - Runner sets a single deterministic escape goal **~100 blocks** away (directly away
    from the chaser's initial position).
  - Chaser updates ``GoalNear`` roughly once per second and keeps the runner in view
    periodically.

- **World support**: ``WORKS_IN_NON_FLAT_WORLD = true``.

``orbit`` (``episode-handlers/orbit-episode.js``)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

- **What**: Both bots "orbit" the shared midpoint by visiting checkpoints on a circle;
  at each checkpoint they stop and look at each other.
- **How it works**: Midpoint is computed from both bots' positions; radius is **half**
  their separation; checkpoints are generated from the bot's starting angle.
- **Notable parameters**:

  - Checkpoints: **8**.
  - Reach distance: **1.5 blocks**, per-checkpoint timeout **5s**.
  - Eye contact at each checkpoint: **1s**.

- **World support**: ``WORKS_IN_NON_FLAT_WORLD = true``.

``walkLook`` (``episode-handlers/walk-look-episode.js``)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

- **What**: Short random-walk bursts while looking at the partner at the start of each
  phase.
- **Roles**: Per-iteration mode is sampled with shared RNG:

  - Both bots walk, or only the lexicographically lower-name bot walks, or only the
    higher-name bot walks.

- **Notable parameters**:

  - Iterations per episode: **3**.
  - Random-walk actions per iteration: **2–4** (``primitives/random-movement.run``),
    with ``lookAway=false``.

- **World support**: ``WORKS_IN_NON_FLAT_WORLD = true``.

``walkLookAway`` (``episode-handlers/walk-look-away-episode.js``)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

- **What**: Similar to ``walkLook``, but the moving bot executes movement with "look
  away" behavior enabled.
- **Roles**: Only one bot walks per iteration (lower-name or higher-name), chosen via
  shared RNG.
- **Notable parameters**:

  - Iterations per episode: **3**.
  - Actions per iteration: **1** (fixed), with ``lookAway=true``.

- **World support**: ``WORKS_IN_NON_FLAT_WORLD = true``.

``pvp`` (``episode-handlers/pvp-episode.js``)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

- **What**: Player-vs-player melee combat using the ``mineflayer-pvp`` plugin
  (``bot.pvp.attack(...)``).
- **Setup**: Bots are provisioned with a random sword before the episode starts.
- **Notable parameters**:

  - Spawn distance constraints: **8–15 blocks** (``INIT_MIN_BOTS_DISTANCE`` /
    ``INIT_MAX_BOTS_DISTANCE``).
  - Combat duration: **10–15s**.

- **World support**: ``WORKS_IN_NON_FLAT_WORLD = true``.

``pve`` (``episode-handlers/pve-episode.js``)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

- **What**: Player-vs-environment fighting loop against hostile mobs (with symmetric
  coordination).
- **Setup**:

  - Temporarily sets server difficulty to **easy** during setup; resets back to
    **peaceful** in teardown.
  - Provisions a random sword.

- **Notable parameters**:

  - Spawn distance constraints: **15–25 blocks**.
  - Number of mobs per episode: **2–5**.
  - If no hostile mob is in forward FOV, a hostile mob may be spawned via RCON
    (``summon ...``) in front of the bot.

- **World support**: ``WORKS_IN_NON_FLAT_WORLD = true``.

``buildStructure`` (``episode-handlers/build-structure-episode.js``)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

- **What**: Builds one randomly chosen small structure type: ``wall``, ``tower``, or
  ``platform``.
- **Collaboration**:

  - ``wall`` / ``tower``: each bot builds its own structure at its spawn location.
  - ``platform``: bots build one shared platform at the midpoint; work is split by
    X-axis.

- **Notable parameters**:

  - Spawn distance constraints: **8–15 blocks**.
  - Block types sampled with shared RNG from: ``stone``, ``cobblestone``, ``oak_planks``,
    ``bricks``.
  - Placement delay: **300ms** per block.

- **World support**: ``WORKS_IN_NON_FLAT_WORLD = true``.

``buildTower`` (``episode-handlers/build-tower-episode.js``)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

- **What**: Each bot builds a vertical tower underneath itself (simple "pillar up"
  behavior).
- **Notable parameters**:

  - Spawn distance constraints: **8–15 blocks**.
  - Tower height: **8–12 blocks**.
  - Block type: ``oak_planks``.

- **World support**: ``WORKS_IN_NON_FLAT_WORLD = true``.

``mine`` (``episode-handlers/mine-episode.js``)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

- **What**: Both bots dig down a small depth, then tunnel towards a shared underground
  midpoint using pathfinder with mining enabled.
- **Setup**: Gives torches (for optional placement) and equips a ``diamond_pickaxe``
  during the episode.
- **Notable parameters**:

  - Initial dig-down depth: **1 block** (``UNDERGROUND_DEPTH``).
  - Pathfinder-with-mining timeout: **60s**.
  - Torch placement is effectively disabled for short runs
    (``TORCH_PLACEMENT_INTERVAL = 999`` blocks).

- **World support**: ``WORKS_IN_NON_FLAT_WORLD = true``.

``towerBridge`` (``episode-handlers/tower-bridge-episode.js``)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

- **What**: Each bot builds a fixed-height tower, then (while sneaking) builds a bridge
  towards a shared target point near the midpoint.
- **How it chooses the target**: Snaps to a shared cardinal axis (X or Z) based on
  which separation is larger, so both bots converge on the same line.
- **Notable parameters**:

  - Spawn distance constraints: **12–20 blocks**.
  - Tower height: **8 blocks**.
  - Bridge build timeout: **60s**.
  - Block type: ``oak_planks``.

- **World support**: ``WORKS_IN_NON_FLAT_WORLD = true``.

``buildHouse`` (``episode-handlers/build-house-episode.js``)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

- **What**: Collaborative **5×5** house build at the midpoint between bots, then both
  bots exit and "admire" the house.
- **Collaboration**: For each build phase (floor/walls/roof), targets are split by
  X-axis with a proximity-based tie-breaker.
- **Notable parameters**:

  - Spawn distance constraints: **10–20 blocks**.
  - Placement delay: **200ms** per block.
  - Setup provisions **2×** required materials to account for scaffolding consumption.

- **World support**: ``WORKS_IN_NON_FLAT_WORLD = true``.

``collector`` (``episode-handlers/collector-episode.js``)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

- **What**: Multi-cycle mining/collection behavior: mine visible ores, then perform a
  "directional" or "staircase" mining task, repeating tasks twice.
- **Modes**: Supports leader/follower vs independent; currently configured to always
  use **leader/follower** (``LEADER_FOLLOWER_PROBABILITY = 1.0``).

  - **Leader**: chooses and executes mining tasks.
  - **Follower**: follows the leader and periodically places torches.

- **Notable parameters**:

  - Spawn distance constraints: ``INIT_MIN_BOTS_DISTANCE = 0`` (teleport can place bots
    close).
  - Mining cycles: up to **10** (``MAX_MINING_CYCLES``).
  - Provisions torches: **128**.

- **World support**: ``WORKS_IN_NON_FLAT_WORLD = true``.

``placeAndMine`` (``episode-handlers/place-and-mine-episode.js``)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

- **What**: A structured "builder vs miner" interaction.

  - **Builder**: places 1–5 blocks per round in simple patterns around a build center.
  - **Miner**: watches the builder, then mines exactly the placed blocks.

- **Setup**: Searches for a suitable flat-enough build location near the midpoint and
  **repositions bots via RCON teleport** around the build center.
- **Notable parameters**:

  - Spawn distance constraints: **4–8 blocks**.
  - Rounds per episode: **7–10**.
  - Build center offset for roles: **2 blocks** from center.
  - Block types include: ``stone``, ``oak_planks``, ``bricks``, ``dirt``,
    ``smooth_sandstone``.

- **World support**: ``WORKS_IN_NON_FLAT_WORLD = true``.

.. _eval-episode-types:

Eval
----

Eval episode types are used for evaluation runs. Handlers live in
``controller/episode-handlers/eval/``.

``structureEval`` (``episode-handlers/eval/structureEval.js``)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

- **What**: Independent structure building and evaluation: one bot (builder) builds a
  small structure at its spawn; the other bot (observer) watches. Used to evaluate
  structure-building and observation.
- **Roles**: Builder vs observer chosen with shared RNG (``alpha_builds`` or
  ``bravo_builds``).
- **Notable parameters**:

  - Structure types: ``wall_2x2``, ``wall_4x1``, ``tower_2x1`` (from
    ``ALL_STRUCTURE_TYPES``).
  - Block type: **stone** only.
  - Spawn distance: **6 blocks** (``INIT_MIN_BOTS_DISTANCE`` / ``INIT_MAX_BOTS_DISTANCE``).
  - Minimum episode ticks: **300**.

- **World support**: ``WORKS_IN_NON_FLAT_WORLD = true``.

``translationEval`` (``episode-handlers/eval/translation-eval-episode.js``)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

- **What**: One bot (by episode number) aligns to the other along one principal axis,
  then walks using ``run()``; used to evaluate movement/translation.
- **Roles**: Which bot walks alternates by episode number (``lower_name_walks`` or
  ``bigger_name_walks``); the non-walking bot stays. One bot may align to the other
  before the phase (Bravo aligns to Alpha along X or Z).
- **Notable parameters**:

  - Spawn distance: **10–12 blocks**.
  - Walk: **1** action per iteration (``MIN_RUN_ACTIONS`` / ``MAX_RUN_ACTIONS``).
  - Movement: ``MIN_WALK_DISTANCE`` 6, ``MAX_WALK_DISTANCE`` 9, no jump.
  - Minimum episode ticks: **300**.

- **World support**: ``WORKS_IN_NON_FLAT_WORLD = true``.

``bothLookAwayEval`` (``episode-handlers/eval/both-look-away-eval-episode.js``)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

- **What**: Both bots look at each other, then both look away by the same random
  direction/offset; used to evaluate joint look-away behavior.
- **Roles**: Mode is fixed to ``both_look_away`` (both bots look away).
- **Notable parameters**:

  - Spawn distance: **10–12 blocks**.
  - Look-away duration: **1s** (``MIN_LOOK_AWAY_DURATION_SEC`` /
    ``MAX_LOOK_AWAY_DURATION_SEC``).
  - Look-away offset: **90° ± 22.5°** (left or right).
  - Iterations per episode: **1**.
  - Minimum episode ticks: **300**.

- **World support**: ``WORKS_IN_NON_FLAT_WORLD = true``.

``oneLooksAwayEval`` (``episode-handlers/eval/one-looks-away-eval-episode.js``)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

- **What**: One bot (lower or higher name, by episode number) looks away by a random
  offset after initial eye contact; the other keeps looking. Used to evaluate
  look-away behavior.
- **Roles**: Alternates by episode number: ``lower_name_looks_away`` or
  ``bigger_name_looks_away``.
- **Notable parameters**:

  - Spawn distance: **10–12 blocks**.
  - Look-away duration: **1s**.
  - Look-away offset: **90° ± 22.5°**.
  - Iterations per episode: **1**.
  - Minimum episode ticks: **300**.

- **World support**: ``WORKS_IN_NON_FLAT_WORLD = true``.

``rotationEval`` (``episode-handlers/eval/rotation-eval-episode.js``)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

- **What**: One bot (alpha or bravo, by episode number) rotates yaw by a fixed angle
  while the other stays; used to evaluate camera rotation.
- **Roles**: Which bot rotates is determined by ``episodeNum % 6``: cases 0–2 alpha
  rotates (+40°, -40°, or 180°), cases 3–5 bravo rotates (same angles).
- **Notable parameters**:

  - Spawn distance: **10–12 blocks**.
  - Rotation angles: **+40°, -40°, 180°** (per case).
  - Camera speed: **30°/s**.
  - Minimum episode ticks: **300**.

- **World support**: ``WORKS_IN_NON_FLAT_WORLD = true``.

``turnToLookEval`` (``episode-handlers/eval/turn-to-look-eval-episode.js``)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

- **What**: Bots look at each other, then one (by name order) faces sideways (90° left
  or right); used to evaluate turning to look at the other bot.
- **Roles**: Lexicographically lower-name bot rotates one direction, higher-name bot
  the opposite (``dir = bot.username < otherName ? 1 : -1``), so they face different
  sides.
- **Notable parameters**:

  - Camera speed: **30°/s** for initial look, **90°/s** for turn.
  - Minimum episode ticks: **300**.

- **World support**: ``WORKS_IN_NON_FLAT_WORLD = true``.

``turnToLookOppositeEval`` (``episode-handlers/eval/turn-to-look-opposite-eval-episode.js``)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

- **What**: Same as ``turnToLookEval`` but both bots rotate the same direction, so they
  end up facing opposite directions; used to evaluate turn-to-look in the opposite
  configuration.
- **Roles**: Both use the same rotation direction (``dir = 1``), resulting in
  opposite facing directions because their "toward each other" vectors are opposite.
- **Notable parameters**:

  - Camera speed: **30°/s** for initial look, **90°/s** for turn.
  - Minimum episode ticks: **300**.

- **World support**: ``WORKS_IN_NON_FLAT_WORLD = true``.
