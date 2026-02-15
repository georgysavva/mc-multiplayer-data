API reference
=============

Episodes loop
~~~~~~~~~~~~~

.. js:autofunction:: episodes-loop.getOnSpawnFn

.. js:autofunction:: episodes-loop.isEvalEpisode

.. js:autofunction:: episodes-loop.saveEpisodeInfo

.. js:autofunction:: episodes-loop.runSingleEpisode

.. js:autofunction:: episodes-loop.notifyPeerErrorAndStop

.. js:autofunction:: episodes-loop.setupBotAndWorldOnce

.. js:autofunction:: episodes-loop.setupCameraPlayerOnce

.. js:autofunction:: episodes-loop.setupBotAndCameraForEpisode

.. js:autofunction:: episodes-loop.clearBotInventory

.. js:autofunction:: episodes-loop.getOnTeleportPhaseFn

.. js:autofunction:: episodes-loop.getOnPostTeleportPhaseFn

.. js:autofunction:: episodes-loop.getOnSetupEpisodeFn

.. js:autofunction:: episodes-loop.getOnStartRecordingFn

.. js:autofunction:: episodes-loop.teleport

.. js:autofunction:: episodes-loop.getOnPeerErrorPhaseFn


Episode classes
~~~~~~~~~~~~~~~

All episode handlers extend :js:class:`base-episode.BaseEpisode` and implement
:js:meth:`base-episode.BaseEpisode.entryPoint` (and optionally
:js:meth:`base-episode.BaseEpisode.setupEpisode` and
:js:meth:`base-episode.BaseEpisode.tearDownEpisode`).

base
^^^^

.. js:autoclass:: base-episode.BaseEpisode
   :members:

Training episodes
^^^^^^^^^^^^^^^^^

.. js:autoclass:: build-house-episode.BuildHouseEpisode
   :members:

.. js:autoclass:: build-structure-episode.BuildStructureEpisode
   :members:

.. js:autoclass:: build-tower-episode.BuildTowerEpisode
   :members:

.. js:autoclass:: chase-episode.ChaseEpisode
   :members:

.. js:autoclass:: collector-episode.CollectorEpisode
   :members:

.. js:autoclass:: mine-episode.MineEpisode
   :members:

.. js:autoclass:: orbit-episode.OrbitEpisode
   :members:

.. js:autoclass:: place-and-mine-episode.PlaceAndMineEpisode
   :members:

.. js:autoclass:: pve-episode.PveEpisode
   :members:

.. js:autoclass:: pvp-episode.PvpEpisode
   :members:

.. js:autoclass:: straight-line-episode.StraightLineEpisode
   :members:

.. js:autoclass:: tower-bridge-episode.TowerBridgeEpisode
   :members:

.. js:autoclass:: walk-look-episode.WalkLookEpisode
   :members:

.. js:autoclass:: walk-look-away-episode.WalkLookAwayEpisode
   :members:

Eval episodes
^^^^^^^^^^^^^

.. js:autoclass:: both-look-away-eval-episode.BothLookAwayEvalEpisode
   :members:

.. js:autoclass:: one-looks-away-eval-episode.OneLooksAwayEvalEpisode
   :members:

.. js:autoclass:: rotation-eval-episode.RotationEvalEpisode
   :members:

.. js:autoclass:: structureEval.StructureEvalEpisode
   :members:

.. js:autoclass:: translation-eval-episode.TranslationEvalEpisode
   :members:

.. js:autoclass:: turn-to-look-eval-episode.TurnToLookEvalEpisode
   :members:

.. js:autoclass:: turn-to-look-opposite-eval-episode.TurnToLookOppositeEvalEpisode
   :members:


Primitives
~~~~~~~~~~

building
^^^^^^^^

.. js:autofunction:: building.makeHouseBlueprint5x5

.. js:autofunction:: building.rotateLocalToWorld

.. js:autofunction:: building.splitWorkByXAxis

.. js:autofunction:: building.calculateMaterialCounts

.. js:autofunction:: building.buildPhase

.. js:autofunction:: building.buildBridge

.. js:autofunction:: building.cleanupScaffolds

.. js:autofunction:: building.admireHouse

.. js:autofunction:: building.calculateFloorPlacementOrder

.. js:autofunction:: building.getPerimeterPosition

.. js:autofunction:: building.calculateWallPlacementOrder

.. js:autofunction:: building.calculateRoofPlacementOrder

.. js:autofunction:: building.isBotCollidingWithBlock

.. js:autofunction:: building.placeAt

.. js:autofunction:: building.placeMultiple

.. js:autofunction:: building.isAirLike

.. js:autofunction:: building.inReach

.. js:autofunction:: building.findPlaceReference

.. js:autofunction:: building.ensureReachAndSight

.. js:autofunction:: building.fastPlaceBlock

.. js:autofunction:: building.buildTowerUnderneath

.. js:autofunction:: building.scoreFace

.. js:autofunction:: building.findBestPlaceReference

.. js:autofunction:: building.raycastToPosition

.. js:autofunction:: building.isBlockObstructed

.. js:autofunction:: building.canSeeFace

.. js:autofunction:: building.isPositionSafe

.. js:autofunction:: building.calculateOptimalPosition

.. js:autofunction:: building.moveToPlacementPosition

.. js:autofunction:: building.hasAdjacentSupport

.. js:autofunction:: building.sortByBuildability

.. js:autofunction:: building.prepareForPlacement

.. js:autofunction:: building.buildStructure

.. js:autofunction:: building.getBlockPlaceDelayTicks

digging
^^^^^^^

.. js:autofunction:: digging.digWithTimeout

.. js:autofunction:: digging.digBlock

.. js:autofunction:: digging.placeTorchOnFloor

.. js:autofunction:: digging.placeTorch

.. js:autofunction:: digging.findVisibleOres

.. js:autofunction:: digging.isBlockVisible

fighting
^^^^^^^^

.. js:autofunction:: fighting.giveRandomSword

.. js:autofunction:: fighting.equipSword

.. js:autofunction:: fighting.isInForwardFOV

items
^^^^^

.. js:autofunction:: items.unequipHand

.. js:autofunction:: items.ensureBotHasEnough

.. js:autofunction:: items.ensureItemInHand

movement
^^^^^^^^

.. js:autofunction:: movement.stopAll

.. js:autofunction:: movement.setControls

.. js:autofunction:: movement.enableSprint

.. js:autofunction:: movement.disableSprint

.. js:autofunction:: movement.initializePathfinder

.. js:autofunction:: movement.stopPathfinder

.. js:autofunction:: movement.gotoWithTimeout

.. js:autofunction:: movement.moveDirection

.. js:autofunction:: movement.moveToward

.. js:autofunction:: movement.moveAway

.. js:autofunction:: movement.lookAtSmooth

.. js:autofunction:: movement.lookSmooth

.. js:autofunction:: movement.lookAtBot

.. js:autofunction:: movement.lookDirection

.. js:autofunction:: movement.sleep

.. js:autofunction:: movement.distanceTo

.. js:autofunction:: movement.horizontalDistanceTo

.. js:autofunction:: movement.getDirectionTo

.. js:autofunction:: movement.isNearPosition

.. js:autofunction:: movement.isNearBot

.. js:autofunction:: movement.land_pos

.. js:autofunction:: movement.jump

.. js:autofunction:: movement.sneak

.. js:autofunction:: movement.directTeleport

.. js:autofunction:: movement.getScaffoldingBlockIds

random-movement
^^^^^^^^^^^^^^^

.. js:autofunction:: random-movement.walk

.. js:autofunction:: random-movement.run

.. js:autofunction:: random-movement.getRandomDirection
