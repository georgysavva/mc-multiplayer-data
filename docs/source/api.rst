API reference
=============

Episode handlers index
~~~~~~~~~~~~~~~~~~~~~~

.. js:autofunction:: index.getOnSpawnFn

.. js:autofunction:: index.isEvalEpisode

.. js:autofunction:: index.saveEpisodeInfo

.. js:autofunction:: index.runSingleEpisode

.. js:autofunction:: index.notifyPeerErrorAndStop

.. js:autofunction:: index.setupBotAndWorldOnce

.. js:autofunction:: index.setupCameraPlayerOnce

.. js:autofunction:: index.setupBotAndCameraForEpisode

.. js:autofunction:: index.clearBotInventory

.. js:autofunction:: index.getOnTeleportPhaseFn

.. js:autofunction:: index.getOnPostTeleportPhaseFn

.. js:autofunction:: index.getOnSetupEpisodeFn

.. js:autofunction:: index.getOnStartRecordingFn

.. js:autofunction:: index.teleport

.. js:autofunction:: index.getOnPeerErrorPhaseFn


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
