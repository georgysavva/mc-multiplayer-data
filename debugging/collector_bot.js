/*
 * Natural Mining Bot - Randomized mining with visible information only
 * Usage: node natural_mining_bot.js <host> <port> [username] [password]
 */

const mineflayer = require('mineflayer')
const { pathfinder, Movements } = require('mineflayer-pathfinder')
const {
  GoalNear, GoalBlock, GoalFollow, GoalXZ, GoalY
} = require('mineflayer-pathfinder').goals
const Vec3 = require('vec3')
const Lock = require('../utils/lock')

const bot = mineflayer.createBot({
  host: process.argv[2],
  port: parseInt(process.argv[3]),
  username: process.argv[4] ? process.argv[4] : 'TheCollector',
  password: process.argv[5]
})

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));


bot.loadPlugin(pathfinder)

const TASK_TIMEOUT_MS = 16000 // stop task after 8 seconds
const RANDOM_MOTION_TIMEOUT_MS = 4000 // wait 1 second to check if task is completed
const TASK_INTERVAL_MS = 500 // wait 8 seconds to check if task is completed

// Track last task specification for repetition
let lastTaskSpec = null
let taskRepeatCount = 0

// Global lock for task execution
const taskLock = new Lock()
let taskTimeoutHandle = null

// Valuable ore types (by block name)
const VALUABLE_ORES = [
  'cobblestone',
  'diamond_ore',
  'deepslate_diamond_ore',
  'emerald_ore',
  'deepslate_emerald_ore',
  'gold_ore',
  'deepslate_gold_ore',
  'iron_ore',
  'deepslate_iron_ore',
  'lapis_ore',
  'deepslate_lapis_ore',
  'redstone_ore',
  'deepslate_redstone_ore',
  'coal_ore',
  'deepslate_coal_ore',
  'copper_ore',
  'deepslate_copper_ore'
]

bot.once('spawn', () => {
  console.log('Natural Mining Bot spawned!')
  const mcData = require('minecraft-data')(bot.version)
  
  // Initialize pathfinder with custom movements
  const customMoves = new Movements(bot)
  customMoves.allow1by1towers = false
  customMoves.allowParkour = false
  customMoves.allowDigging = true
  customMoves.blocksToAvoid.add(bot.registry.blocksByName.water.id)
  customMoves.blocksToAvoid.add(bot.registry.blocksByName.lava.id)
  customMoves.blocksToAvoid.add(bot.registry.blocksByName.bedrock.id)
  bot.pathfinder.setMovements(customMoves)

  // Get ore block IDs
  const oreIds = VALUABLE_ORES.map(oreName => mcData.blocksByName[oreName]?.id).filter(id => id !== undefined)
  console.log('Looking for ores:', oreIds)

  // Function to check if a block is visible
  function isBlockVisible(block) {
    if (!block) return false
    return bot.canSeeBlock(block)
  }

  function canPlaceTorch(pos) {
    // Check for above, east, west, south, and north torches
    const directions = [
      new Vec3(0, 1, 0),
      new Vec3(1, 0, 0),
      new Vec3(-1, 0, 0),
      new Vec3(0, 0, 1),
      new Vec3(0, 0, -1)
    ]

    for (const dir of directions) {
      const neighborPos = pos.offset(dir.x, dir.y, dir.z)
      const neighbor = bot.blockAt(neighborPos)
      if (neighbor && isBlockVisible(neighbor) && neighbor.name === 'air') return [true, dir]
    }
    return [false, null]
  }

  // Function to find visible valuable ores
  function findVisibleOres() {
    const visibleOres = []
    const oreBlocks = bot.findBlocks({
      matching: oreIds,
      maxDistance: 16,
      count: 20
    })
    console.log(`Found ${oreBlocks.length} valuable ores nearby`)
    const botPosition = bot.entity.position
    for (const blockPos of oreBlocks) {
      const block = bot.blockAt(blockPos)
      if (block && isBlockVisible(block) && block.position.distanceTo(botPosition) < 16) {
        visibleOres.push(block)
        console.log(`Found visible ${block.name} at ${block.position}`)
      }
    }

    return visibleOres
  }

  // Function to place torch on nearby surface
  const MAX_TORCH_DISTANCE = 2
  async function placeTorch() {
    const isSolid = (b) => b && b.boundingBox === 'block' && !b.name.includes('leaves')
    try {
      const torchSlot = bot.inventory.findInventoryItem(mcData.itemsByName.torch.id)
      if (!torchSlot) {
        console.log('No torches available')
        return
      }
      
      // Find a suitable surface to place torch
      const torchBasePositions = bot.findBlocks({
        matching: (block) => {
          return isSolid(block)
        },
        maxDistance: MAX_TORCH_DISTANCE,
        count: 8
      })

      console.log(`Nearby blocks for torch placement: ${torchBasePositions.length}`)
      
      if (torchBasePositions.length === 0) {
        console.log('No suitable blocks found for torch placement')
        return
      }

      // Equip torch once at the beginning
      await bot.equip(torchSlot, 'hand')
      await bot.waitForTicks(2)

      const botPosition = bot.entity.position
      
      // Try placing torch sequentially until one succeeds
      for (const blockPos of torchBasePositions) {
        const distance = blockPos.distanceTo(botPosition)
        if (distance > MAX_TORCH_DISTANCE) {
          console.log(`Block at ${blockPos} is too far away (${distance.toFixed(2)} blocks)`)
          continue
        }
        
        const block = bot.blockAt(blockPos)
        if (!block) {
          console.log(`No block found at ${blockPos}`)
          continue
        }
        
        const [canPlace, faceVector] = canPlaceTorch(blockPos)
        if (!canPlace) {
          console.log(`Cannot place torch at ${blockPos}`)
          continue
        }
        
        // Check if chunk is loaded
        if (!bot.world.getBlock(blockPos)) {
          console.log(`Chunk at ${blockPos} is not loaded, skipping`)
          continue
        }
        
        // Try to place torch
        try {
          console.log(`Attempting to place torch at ${block.position}`)
          await bot.lookAt(blockPos.offset(faceVector.x, faceVector.y, faceVector.z))
          await bot.waitForTicks(2)
          await bot.placeBlock(block, faceVector)
          await bot.waitForTicks(2)
          console.log(`Successfully placed torch at ${block.position}`)
          return // Success, exit the function
        } catch (error) {
          console.log(`Failed to place torch at ${block.position}: ${error.message}`)
          // Continue to next position
        }
      }

      console.log('All torch placement attempts failed')
      
    } catch (error) {
      console.log('Error placing torch:', error.message)
    }
  }

  // Function to get random direction (north, south, east, west)
  function getRandomDirection() {
    const directions = [
      { name: 'north', offset: new Vec3(0, 0, -1) },
      { name: 'south', offset: new Vec3(0, 0, 1) },
      { name: 'east', offset: new Vec3(1, 0, 0) },
      { name: 'west', offset: new Vec3(-1, 0, 0) }
    ]
    return directions[Math.floor(Math.random() * directions.length)]
  }

  // Function to perform directional mining
  async function performDirectionalMining(direction, distance) {
    console.log('Starting directional mining...')
    console.log(`Mining towards ${direction.name} for ${distance} blocks`)
    
    const startPos = bot.entity.position
    const targetPos = startPos.plus(direction.offset.scaled(distance))
    
    // Set pathfinding goal
    bot.pathfinder.setGoal(new GoalNear(targetPos.x, targetPos.y, targetPos.z, 1))
    // stop task after 8 seconds
    setTimeout(() => {
      bot.pathfinder.setGoal(null)
    }, RANDOM_MOTION_TIMEOUT_MS)
  }

  // Function to perform staircase mining (45 degrees down)
  async function performStaircaseMining(direction, depth) {
    console.log('Starting staircase mining...')
    console.log(`Staircase mining towards ${direction.name} going down ${depth} blocks`)
    
    const startPos = bot.entity.position
    const targetY = Math.max(startPos.y - depth, 5) // Go down by depth, but not below y=5
    const horizontalDistance = depth // Same distance horizontally as vertically
    const targetX = startPos.x + direction.offset.x * horizontalDistance
    const targetZ = startPos.z + direction.offset.z * horizontalDistance
    
    // Set pathfinding goal
    bot.pathfinder.setGoal(new GoalNear(targetX, targetY, targetZ, 2))
    // stop task after 8 seconds
    setTimeout(() => {
      bot.pathfinder.setGoal(null)
    }, RANDOM_MOTION_TIMEOUT_MS)
  }

  // Function to release the task lock
  function releaseTaskLock() {
    if (taskTimeoutHandle) {
      clearTimeout(taskTimeoutHandle)
      taskTimeoutHandle = null
    }
    taskLock.release()
    console.log('Task lock released')
  }

  // Function to execute a random mining task
  async function executeRandomTask() {
    // Try to acquire the lock
    if (!taskLock.tryAcquire()) {
      console.log('Task lock already held, skipping execution')
      return
    }
    console.log('Task lock acquired')

    const startTime = Date.now()
    // place torch before mining
    await placeTorch()
    const endTime = Date.now()
    const placeTorchTime = endTime - startTime
    console.log(`Place torch took ${placeTorchTime}ms`)
    // synchronously get visible ores and collect each of them, with a timeout of 5 seconds for the first ore and 1 second for the rest
    const visibleOres = findVisibleOres()
    // Collect visible ores using pathfinder with toBreak
    if (visibleOres.length > 0) {
      console.log(`Attempting to collect ${visibleOres.length} visible ores`)
      
      for (let i = 0; i < visibleOres.length && i < 2; i++) {
        const ore = visibleOres[i]
        console.log(`Mining ore ${i + 1}/${visibleOres.length}: ${ore.name} at ${ore.position}`)
        
        // Use pathfinder to navigate to and break the ore
        // GoalBlock will make the bot move adjacent to the block, and with allowDigging=true,
        // the pathfinder will automatically break blocks in the way, including the ore itself
        bot.pathfinder.setGoal(new GoalBlock(ore.position.x, ore.position.y, ore.position.z))
        
        // Wait for the bot to reach the ore or timeout
        const oreTimeout = i === 0 ? 5000 : 1000 // 5 seconds for first ore, 1 second for rest
        const startOreTime = Date.now()
        
        // Wait for goal_reached or timeout
        await new Promise((resolve) => {
          const onGoalReached = () => {
            bot.removeListener('goal_reached', onGoalReached)
            bot.removeListener('path_reset', onPathReset)
            clearTimeout(timeoutHandle)
            console.log(`Successfully reached/mined ore at ${ore.position}`)
            resolve()
          }
          
          const onPathReset = (reason) => {
            bot.removeListener('goal_reached', onGoalReached)
            bot.removeListener('path_reset', onPathReset)
            clearTimeout(timeoutHandle)
            console.log(`Path reset while mining ore: ${reason}`)
            resolve()
          }
          
          const timeoutHandle = setTimeout(() => {
            bot.removeListener('goal_reached', onGoalReached)
            bot.removeListener('path_reset', onPathReset)
            bot.pathfinder.setGoal(null)
            console.log(`Timeout while mining ore at ${ore.position}`)
            resolve()
          }, oreTimeout)
          
          bot.once('goal_reached', onGoalReached)
          bot.once('path_reset', onPathReset)
        })
        
        await bot.waitForTicks(2)
      }
    } else {
      console.log('No visible ores found to collect')
    }
    const endTime2 = Date.now()
    const collectOresTime = endTime2 - endTime
    console.log(`Collect ores took ${collectOresTime}ms`)

    let taskSpec
    
    // Check if we need to repeat the last task
    if (lastTaskSpec && taskRepeatCount < 2) {
      // Reuse the same task specification
      taskSpec = lastTaskSpec
      taskRepeatCount++
      console.log(`Repeating ${taskSpec.type} mining task (${taskRepeatCount}/2) - direction: ${taskSpec.direction.name}, ${taskSpec.type === 'directional' ? 'distance' : 'depth'}: ${taskSpec.distance}`)
    } else {
      // Create new random task specification
      const taskType = Math.random() < 0.7 ? 'directional' : 'staircase' // 70% directional, 30% staircase
      const direction = getRandomDirection()
      const distance = taskType === 'directional' 
        ? Math.floor(Math.random() * 7) + 2  // Random distance between 2 and 8 for directional
        : Math.floor(Math.random() * 4) + 5  // Random depth between 5 and 8 for staircase
      
      taskSpec = {
        type: taskType,
        direction: direction,
        distance: distance
      }
      
      lastTaskSpec = taskSpec
      taskRepeatCount = 1
      console.log(`Starting new ${taskSpec.type} mining task (1/2) - direction: ${taskSpec.direction.name}, ${taskSpec.type === 'directional' ? 'distance' : 'depth'}: ${taskSpec.distance}`)
    }

    // Execute the task based on specification
    if (taskSpec.type === 'directional') {
        performDirectionalMining(taskSpec.direction, taskSpec.distance)
    } else {
        performStaircaseMining(taskSpec.direction, taskSpec.distance)
    }

    // Set timeout to release lock after TASK_TIMEOUT_MS
    taskTimeoutHandle = setTimeout(() => {
      console.log('Task timeout reached, releasing lock')
      releaseTaskLock()
    }, TASK_TIMEOUT_MS)

    // Search for visible ores
    // const visibleOres = findVisibleOres()
    // if (visibleOres.length > 0) {
    //   console.log(`Found ${visibleOres.length} visible valuable ores`)
    //   // Mine the closest visible ore
    //   const closestOre = visibleOres[0]
    //   await mineBlock(closestOre)
    // }
  }

  // Function to start the mining cycle
  function startMiningCycle() {
    console.log('Starting natural mining cycle...')
    
    // Execute first task immediately
    executeRandomTask()
    
    // Set up interval for subsequent tasks
    setInterval(() => {
      if (!taskLock._locked) {
        executeRandomTask()
      }
    }, TASK_INTERVAL_MS)
  }

  // Give ourselves tools and torches
  bot.chat('/clear')
  bot.chat('/give @s diamond_pickaxe 1')
  bot.chat('/give @s diamond_pickaxe 1')
  bot.chat('/give @s diamond_shovel 1')
  bot.chat('/give @s torch 256')
  bot.chat('/give @s minecraft:dirt 256')
  console.log('Requested mining tools and torches')

  // Start mining after a short delay
  setTimeout(() => {
    startMiningCycle()
  }, 3000)

  // Chat commands for manual control
  bot.on('chat', function (username, message) {
    if (username === bot.username) return

    if (message === 'mine') {
      if (bot.pathfinder.goal == null) {
        executeRandomTask()
      } else {
        bot.chat('Already mining!')
      }
    } else if (message === 'stop') {
      bot.pathfinder.setGoal(null)
      releaseTaskLock()
      console.log('Stopped mining')
    } else if (message === 'status') {
      bot.chat(`NaturalMiner: ${bot.pathfinder.goal != null ? 'Mining' : 'Idle'}`)
    } else if (message === 'ores') {
      const visibleOres = findVisibleOres()
      bot.chat(`Found ${visibleOres.length} visible valuable ores`)
    }
  })

  // Handle errors
  bot.on('error', (err) => {
    console.log('Natural Mining Bot error:', err)
  })

  // // Handle pathfinder events
  // bot.on('goal_reached', () => {
  //   console.log('Reached mining goal')
  //   // releaseTaskLock()
  // })
})
