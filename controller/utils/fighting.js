const Vec3 = require("vec3").Vec3;

/**
 * Basic Movement Building Blocks for Mineflayer Bots
 * These functions provide consistent, deterministic movement primitives
 * that can be used across all episodes.
 */

// Import pathfinder components correctly according to official README

// ============================================================================
// EXPORTS
// ============================================================================
async function giveRandomSword(bot, rcon) {
  const swords = [
    "minecraft:wooden_sword",
    "minecraft:stone_sword",
    "minecraft:iron_sword",
    "minecraft:golden_sword",
    "minecraft:diamond_sword",
    "minecraft:netherite_sword",
  ];
  const randomSword = swords[Math.floor(Math.random() * swords.length)];
  const giveSwordRes = await rcon.send(`give ${bot.username} ${randomSword} 1`);
  console.log(
    `[${bot.username}] Gave random sword: ${randomSword}, response=${giveSwordRes}`,
  );
}

async function equipSword(bot) {
  const swordItem = bot.inventory
    .items()
    .find((item) => item.name.includes("sword"));
  if (swordItem) {
    await bot.equip(swordItem, "hand");
    console.log(`[${bot.username}] Equipped ${swordItem.name} to hand`);
  } else {
    console.log(
      `[${bot.username}] Warning: Could not find any sword in inventory to equip`,
    );
  }
}

module.exports = {
  // Basic controls
  giveRandomSword,
  equipSword,
};
