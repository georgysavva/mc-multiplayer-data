Controller
================

The Controller component of ``SolarisEngine`` is JavaScript program built on top of
`Mineflayer <https://github.com/PrismarineJS/mineflayer>`_. It connects via TCP to the
controller bots of other players and through communication and the high level API of
Mineflayer makes the bots engage in collaborative gameplay. To ensure diversity and
good coverage of various game mechanics, it has a collection of 14 programmed episode
types defined in ``episode-handlers/``. It currently supports only two players.

Design
------

Through out the life of the controller program, it establishes a connection with the
server and creates a ``mineflayer.Bot()`` instance just once at startup. After that,
it reuses the same ``bot`` instance to collect as many episodes as specified in the
``--episodes_num`` CLI arg. The entry point to the controller is the
:js:func:`index.getOnSpawnFn` function (defined in
``episode-handlers/index.js``) which Mineflayer calls when the bot has
connected to the server. The function runs in a loop sampling random episodes,
executing them, and sending actions to the separate ``action_recorder`` process to be
saved as json files on disk.


Controllers of player share the same random generator, ``sharedBotRng`` that they use
to sample the same episode type randomly on every loop iteration. To ensure that the
episode starts in a clean state and in a new terrain, the controller teleports the
players to a new random location and resets their inventories before starting to record
the episode.

The episode loop has a error handling mechanism where it catches any error the might
occur during the episode execution and notifies other players about it. They
collectively abort the current episode and progress to the next one.

To ensure the data collection doesn't get interrupted with the player dying, the
controller gives the players infinite resistance, water breathing, and no fall damage
via RCON at the program startup.

All episode types inherit ``BaseEpisode`` defined in ``episode-handlers/base-episode.js``.
An episode consists of multiple phases. At the beginning and end of a phase all players
wait for each other an exchange arbitrary values needed for the phase progression. This
phasing mechanism, combined with the ``sharedBotRng`` ensure the bots progress through
the episode in synchronization. All episodes types are an instance of a concrete game
scenario that runs from start to finish. They are build on top of primitives that
provide reusable API like ``building``, ``digging``, ``fighting``, or ``moving``. They
are defined in ``primitives/``.

Episode types
-------------

Episode handlers live in ``controller/episode-handlers/``. Episode type selection is
controlled via the ``EPISODE_TYPES`` environment variable:

- **Default**: if ``EPISODE_TYPES`` is unset (or set to ``all``), the controller samples
  from its built-in default list.
- **Custom list**: set ``EPISODE_TYPES`` to a comma-separated list of episode type
  strings, e.g. ``EPISODE_TYPES=walkLook,chase,pvp``.

Below are the **14 main episode types** (the default “non-eval” scenarios) and what
they do.

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
    from the chaser’s initial position).
  - Chaser updates ``GoalNear`` roughly once per second and keeps the runner in view
    periodically.

- **World support**: ``WORKS_IN_NON_FLAT_WORLD = true``.

``orbit`` (``episode-handlers/orbit-episode.js``)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

- **What**: Both bots “orbit” the shared midpoint by visiting checkpoints on a circle;
  at each checkpoint they stop and look at each other.
- **How it works**: Midpoint is computed from both bots’ positions; radius is **half**
  their separation; checkpoints are generated from the bot’s starting angle.
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

- **What**: Similar to ``walkLook``, but the moving bot executes movement with “look
  away” behavior enabled.
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

- **What**: Each bot builds a vertical tower underneath itself (simple “pillar up”
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
  bots exit and “admire” the house.
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
  “directional” or “staircase” mining task, repeating tasks twice.
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

- **What**: A structured “builder vs miner” interaction.

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
