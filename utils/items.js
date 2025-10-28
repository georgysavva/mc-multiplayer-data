/**
 * items.js - Utilities for managing bot inventory and equipment
 */

/**
 * Unequips an item from the bot's hand
 * @param {Bot} bot - Mineflayer bot instance
 * @param {string} [itemType] - Optional item type to check for (e.g., "sword", "pickaxe")
 * @returns {Promise<boolean>} True if successfully unequipped or nothing to unequip
 */
async function unequipHand(bot, itemType = null) {
  if (!bot || !bot.entity || !bot.inventory) {
    console.log(
      `[${
        bot?.username || "unknown"
      }] Cannot unequip - bot not properly initialized`
    );
    return false;
  }

  // Check if the bot has an item equipped
  const itemInHand = bot.heldItem;

  if (!itemInHand) {
    console.log(`[${bot.username}] No item equipped in hand`);
    return true;
  }

  // If itemType is specified, check if the item matches that type
  if (itemType) {
    const itemName = itemInHand.name || "";
    const displayName = itemInHand.displayName?.toLowerCase() || "";

    if (
      !itemName.includes(itemType.toLowerCase()) &&
      !displayName.includes(itemType.toLowerCase())
    ) {
      console.log(
        `[${bot.username}] Item in hand (${itemName}) is not a ${itemType}, skipping unequip`
      );
      return true;
    }
  }

  // Safely unequip the main hand item
  await bot.unequip("hand");
  console.log(`[${bot.username}] Unequipped ${itemInHand.name} from main hand`);
  return true;
}

module.exports = {
  unequipHand,
};
