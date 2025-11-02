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

const RANDOM_MOTION_TIMEOUT_MS = 8000 // stop task after 8 seconds
const ORE_MINING_TIMEOUT_MS = 8000 // wait 8 seconds to mine an ore
const TASK_INTERVAL_MS = 500 // wait 8 seconds to check if task is completed

// Track last task specification for repetition
let lastTaskSpec = null
let taskRepeatCount = 0

// Global lock for task execution
const taskLock = new Lock()
let taskTimeoutHandle = null
let isMiningOres = false // Flag to prevent auto-release during ore collection

// Valuable ore types (by block name)
const VALUABLE_ORES = [
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
      new Vec3(0, 1, 0),   // up
      new Vec3(1, 0, 0),   // east
      new Vec3(-1, 0, 0),  // west
      new Vec3(0, 0, 1),   // south
      new Vec3(0, 0, -1)   // north
    ]

    // Calculate direction from block to bot
    const eyePosition = bot.entity.position.offset(0, 1.8, 0)  // hardcode to ignore sneaking
    const toBot = new Vec3(
      eyePosition.x - pos.x,
      eyePosition.y - pos.y,
      eyePosition.z - pos.z
    )

    // Sort directions by how well they point towards the bot
    // (using dot product: higher = more aligned)
    const sortedDirections = directions.slice().sort((a, b) => {
      const dotA = a.x * toBot.x + a.y * toBot.y + a.z * toBot.z
      const dotB = b.x * toBot.x + b.y * toBot.y + b.z * toBot.z
      return dotB - dotA // Higher dot product first
    })

    for (const dir of sortedDirections) {
      const neighborPos = pos.offset(dir.x, dir.y, dir.z)
      const neighbor = bot.blockAt(neighborPos)
      if (neighbor && neighbor.name === 'air') return [true, dir]
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
      if (block && block.position.distanceTo(botPosition) < 16 && isBlockVisible(block)) {
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
      if (!torchSlot) return
      
      // Find a suitable surface to place torch
      const torchBasePositions = bot.findBlocks({
        matching: (block) => isSolid(block),
        maxDistance: MAX_TORCH_DISTANCE,
        count: 20
      })
      
      if (torchBasePositions.length === 0) return

      await bot.equip(torchSlot, 'hand')
      await bot.waitForTicks(2)

      const botPosition = bot.entity.position
      const eyeLevel = botPosition.y + 1.8  // hardcode to ignore sneaking
      
      // Sort blocks by proximity to head level (prioritize head-level blocks)
      const sortedPositions = torchBasePositions.sort((a, b) => {
        const distA = Math.abs(a.y - eyeLevel)
        const distB = Math.abs(b.y - eyeLevel)
        return distA - distB
      })
      
      // Try placing torch sequentially until one succeeds
      for (const blockPos of sortedPositions) {
        const distance = blockPos.distanceTo(botPosition)
        if (distance > MAX_TORCH_DISTANCE) continue
        
        const block = bot.blockAt(blockPos)
        // if it's an ore block, continue
        if (!block || oreIds.includes(block.type)) continue
        
        const [canPlace, faceVector] = canPlaceTorch(blockPos)
        if (!canPlace) continue
        
        if (!bot.world.getBlock(blockPos)) continue
        
        try {
          // await bot.lookAt(blockPos.offset(faceVector.x, faceVector.y, faceVector.z))
          await bot.waitForTicks(2)
          await bot.placeBlock(block, faceVector)
          await bot.waitForTicks(2)
          console.log('Torch placed')
          return
        } catch (error) {
          // Continue to next position
        }
      }
    } catch (error) {
      // Silent failure
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
    console.log(`Directional mining: ${direction.name}, distance ${distance}`)
    
    const startPos = bot.entity.position
    const targetPos = startPos.plus(direction.offset.scaled(distance))
    
    // Set pathfinding goal
    bot.pathfinder.setGoal(new GoalNear(targetPos.x, targetPos.y, targetPos.z, 1))
  }

  // Function to perform staircase mining (45 degrees down)
  async function performStaircaseMining(direction, depth) {
    console.log(`Staircase mining: ${direction.name}, depth ${depth}`)
    
    const startPos = bot.entity.position
    const targetY = Math.max(startPos.y - depth, 5) // Go down by depth, but not below y=5
    const horizontalDistance = depth // Same distance horizontally as vertically
    const targetX = startPos.x + direction.offset.x * horizontalDistance
    const targetZ = startPos.z + direction.offset.z * horizontalDistance
    
    // Set pathfinding goal
    bot.pathfinder.setGoal(new GoalNear(targetX, targetY, targetZ, 2))
  }

  // Function to release the task lock
  function releaseTaskLock(reason = '') {
    if (!taskLock._locked) return // Already released
    
    if (taskTimeoutHandle) {
      clearTimeout(taskTimeoutHandle)
      taskTimeoutHandle = null
    }
    taskLock.release()
    console.log(`Task complete ${reason ? '(' + reason + ')' : ''}`)
  }

  // Function to execute a random mining task
  async function executeRandomTask() {
    // Try to acquire the lock
    if (!taskLock.tryAcquire()) {
      return
    }
    console.log('=== Starting new task ===')

    // Place torch before mining
    await placeTorch()
    
    // Collect visible ores
    const visibleOres = findVisibleOres()
    if (visibleOres.length > 0) {
      const maxOresToMine = Math.min(visibleOres.length, 8) // Mine up to 5 visible ores
      console.log(`Collecting ${maxOresToMine} visible ores`)
      
      // Disable auto-release during ore collection
      isMiningOres = true
      
      for (let i = 0; i < maxOresToMine; i++) {
        const ore = visibleOres[i]
        console.log(`Mining ${ore.name} at (${ore.position.x.toFixed(1)}, ${ore.position.y.toFixed(1)}, ${ore.position.z.toFixed(1)})`)
        
        bot.pathfinder.setGoal(new GoalBlock(ore.position.x, ore.position.y, ore.position.z))
        
        // Wait for goal_reached or timeout
        await Promise.race([
          new Promise((resolve) => bot.once('goal_reached', resolve)),
          sleep(ORE_MINING_TIMEOUT_MS)
        ])
        
        bot.pathfinder.setGoal(null)
        await bot.waitForTicks(4)
      }
      
      // Re-enable auto-release after ore collection
      isMiningOres = false
    }

    let taskSpec
    
    // Check if we need to repeat the last task
    if (lastTaskSpec && taskRepeatCount < 2) {
      taskSpec = lastTaskSpec
      taskRepeatCount++
      console.log(`Task ${taskRepeatCount}/2: ${taskSpec.type} ${taskSpec.direction.name}`)
    } else {
      // Create new random task specification
      const taskType = Math.random() < 0.7 ? 'directional' : 'staircase'
      const direction = getRandomDirection()
      const distance = taskType === 'directional' 
        ? Math.floor(Math.random() * 7) + 2
        : Math.floor(Math.random() * 4) + 5
      
      taskSpec = { type: taskType, direction: direction, distance: distance }
      lastTaskSpec = taskSpec
      taskRepeatCount = 1
      console.log(`Task 1/2: ${taskSpec.type} ${taskSpec.direction.name}`)
    }

    // Execute the task based on specification
    if (taskSpec.type === 'directional') {
      performDirectionalMining(taskSpec.direction, taskSpec.distance)
    } else {
      performStaircaseMining(taskSpec.direction, taskSpec.distance)
    }

    // Set timeout to release lock after TASK_TIMEOUT_MS
    taskTimeoutHandle = setTimeout(() => {
      releaseTaskLock('random motion timeout')
    }, RANDOM_MOTION_TIMEOUT_MS)
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

  // Handle pathfinder events
  bot.on('goal_reached', () => {
    // Don't auto-release the lock if we're in the middle of ore collection
    if (!isMiningOres) {
      releaseTaskLock('goal_reached')
    }
  })
})
