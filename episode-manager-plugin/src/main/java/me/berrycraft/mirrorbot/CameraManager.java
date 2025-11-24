package me.berrycraft.mirrorbot;

import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.GameMode;
import org.bukkit.entity.Player;

import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;

import org.bukkit.event.player.PlayerAnimationEvent;
import org.bukkit.event.player.PlayerInteractEvent;
import org.bukkit.event.player.PlayerInteractAtEntityEvent;
import org.bukkit.event.player.PlayerToggleSneakEvent;
import org.bukkit.event.player.PlayerToggleSprintEvent;
import org.bukkit.event.entity.EntityDamageByEntityEvent;
import org.bukkit.event.entity.EntityDamageEvent;
import org.bukkit.event.entity.EntityTargetLivingEntityEvent;
import org.bukkit.event.entity.EntityPickupItemEvent;


import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.PlayerInventory;
import org.bukkit.attribute.Attribute;
import org.bukkit.attribute.AttributeInstance;
import org.bukkit.scheduler.BukkitTask;
import org.bukkit.util.Vector;
import org.bukkit.event.block.BlockDamageEvent;
import org.bukkit.Particle;

import com.comphenix.protocol.ProtocolManager;
import com.comphenix.protocol.PacketType;
import com.comphenix.protocol.events.PacketContainer;
import com.comphenix.protocol.wrappers.BlockPosition;

import java.lang.reflect.InvocationTargetException;
import java.util.Arrays;
import java.util.Map;
import java.util.Objects;

public class CameraManager implements Listener {

    private final EpisodeManager plugin;
    private final ProtocolManager protocol;
    private BukkitTask followTask;

    public CameraManager(EpisodeManager plugin, ProtocolManager protocol) {
        this.plugin = plugin;
        this.protocol = protocol;
        registerBlockBreakForwarder();
    }

    // ============================================================================
    // Public Facing API
    // ============================================================================

    public void startFollowingTask() {
        stopFollowingTask();

        followTask = Bukkit.getScheduler().runTaskTimer(plugin, () -> {

            for (Map.Entry<Player, Player> entry : plugin.getActivePairs().entrySet()) {
                Player controller = entry.getKey();
                Player camera = entry.getValue();

                if (!controller.isOnline() || !camera.isOnline()) continue;

                mirrorInventory(controller, camera);
                mirrorStatus(controller, camera);

                Location cLoc = controller.getLocation();
                Location camLoc = camera.getLocation();

                boolean worldChanged = camLoc.getWorld() != cLoc.getWorld();
                boolean moved = worldChanged || camLoc.distanceSquared(cLoc) > 0.0025;

                boolean rotated =
                        Math.abs(camLoc.getYaw() - cLoc.getYaw()) > 1f ||
                        Math.abs(camLoc.getPitch() - cLoc.getPitch()) > 1f;

                if (moved || rotated) {
                    camera.teleportAsync(cLoc.clone());
                }
            }

        }, 0L, 1L);
    }

    public void stopFollowingTask() {
        if (followTask != null) {
            followTask.cancel();
            followTask = null;
        }
    }

    public void prepareCamera(Player cam) {
        disableCollisions(cam);
        applyCameraPhysics(cam);
    }

    public void restorePlayer(Player p) {
        enableCollisions(p);
        resetCameraPhysics(p);
    }

    // ============================================================================
    // Events
    // ============================================================================

    @EventHandler
    public void onSwing(PlayerAnimationEvent e) {
        Player controller = e.getPlayer();
        Player camera = plugin.getActivePairs().get(controller);
        if (camera != null) camera.swingMainHand();
    }

    @EventHandler
    public void onAttack(EntityDamageByEntityEvent e) {
        if (!(e.getDamager() instanceof Player controller)) return;
        Player camera = plugin.getActivePairs().get(controller);
        if (camera != null) camera.swingMainHand(); // simulates attack motion
    }

    @EventHandler
    public void onRightClick(PlayerInteractEvent e) {
        Player controller = e.getPlayer();
        Player camera = plugin.getActivePairs().get(controller);
        if (camera == null) return;

        switch (e.getAction()) {
            case RIGHT_CLICK_AIR:
            case RIGHT_CLICK_BLOCK:
                camera.swingMainHand(); // visually looks like a use-item animation
                break;
        }
    }

    @EventHandler
    public void onRightClickEntity(PlayerInteractAtEntityEvent e) {
        Player controller = e.getPlayer();
        Player camera = plugin.getActivePairs().get(controller);
        if (camera != null) camera.swingMainHand();
    }

    @EventHandler
    public void onSneak(PlayerToggleSneakEvent e) {
        Player controller = e.getPlayer();
        Player camera = plugin.getActivePairs().get(controller);
        if (camera != null) camera.setSneaking(e.isSneaking());
    }

    @EventHandler
    public void onSprint(PlayerToggleSprintEvent e) {
        Player controller = e.getPlayer();
        Player camera = plugin.getActivePairs().get(controller);
        if (camera != null) camera.setSprinting(e.isSprinting());
    }

    @EventHandler(ignoreCancelled = true)
    public void onTargetCamera(EntityTargetLivingEntityEvent e) {
        if (!(e.getTarget() instanceof Player p)) return;
        if (!plugin.isCamera(p)) return;

        e.setCancelled(true);
        e.setTarget(null);
    }

    @EventHandler(ignoreCancelled = true)
    public void onDamageCamera(EntityDamageEvent e) {
        if (!(e.getEntity() instanceof Player p)) return;
        if (!plugin.isCamera(p)) return;

        e.setCancelled(true);
        e.setDamage(0);
        p.setFireTicks(0);
    }

    @EventHandler(ignoreCancelled = true)
    public void onPickup(EntityPickupItemEvent e) {
        if (!(e.getEntity() instanceof Player p)) return;
        if (!plugin.isCamera(p)) return;

        e.setCancelled(true);
    }

    @EventHandler(ignoreCancelled = true)
    public void onBlockDamage(BlockDamageEvent e) {
        Player controller = e.getPlayer();
        Player camera = plugin.getActivePairs().get(controller);
        if (camera == null) return;

        org.bukkit.block.Block block = e.getBlock();

        double x = block.getX() + 0.5;
        double y = block.getY() + 0.5;
        double z = block.getZ() + 0.5;

        camera.spawnParticle(
            Particle.BLOCK,
            x, y, z,
            70,             // amount
            0.1, 0.1, 0.1,  // spread
            0.025,           // speed
            block.getBlockData() // particle data so it matches the block type
        );
    }


    // ============================================================================
    // Private Inventory Mirroring
    // ============================================================================

    private void mirrorInventory(Player controller, Player camera) {
        PlayerInventory ci = controller.getInventory();
        PlayerInventory ki = camera.getInventory();

        if (!Arrays.equals(ci.getStorageContents(), ki.getStorageContents())) {
            ki.setStorageContents(clone(ci.getStorageContents()));
        }
        if (!Arrays.equals(ci.getArmorContents(), ki.getArmorContents())) {
            ki.setArmorContents(clone(ci.getArmorContents()));
        }
        if (!Objects.equals(ci.getItemInOffHand(), ki.getItemInOffHand())) {
            ki.setItemInOffHand(clone(ci.getItemInOffHand()));
        }
        if (ki.getHeldItemSlot() != ci.getHeldItemSlot()) {
            ki.setHeldItemSlot(ci.getHeldItemSlot());
        }
    }

    private void mirrorStatus(Player ctrl, Player cam) {
        AttributeInstance maxHpAttr = cam.getAttribute(Attribute.GENERIC_MAX_HEALTH);
        double maxHp = maxHpAttr != null ? maxHpAttr.getValue() : 20;

        double target = Math.max(0, Math.min(ctrl.getHealth(), maxHp));
        if (Math.abs(cam.getHealth() - target) > 0.01) cam.setHealth(target);

        cam.setFoodLevel(ctrl.getFoodLevel());
        cam.setSaturation(ctrl.getSaturation());
        cam.setExhaustion(ctrl.getExhaustion());
        cam.setRemainingAir(ctrl.getRemainingAir());
        cam.setMaximumAir(ctrl.getMaximumAir());
    }

    private boolean isCamera(Player p) {
        return plugin.isCamera(p);
    }

    private void applyCameraPhysics(Player cam) {
        cam.setGravity(false);
        cam.setVelocity(new Vector(0, 0, 0));
        cam.setAllowFlight(true);
        cam.setFlying(true);
    }

    private void resetCameraPhysics(Player p) {
        p.setGravity(true);
        if (p.getGameMode() != GameMode.CREATIVE && p.getGameMode() != GameMode.SPECTATOR) {
            p.setAllowFlight(false);
            if (p.isFlying()) p.setFlying(false);
        }
    }

    private void disableCollisions(Player p) {
        setCollidable(p, false);
    }

    private void enableCollisions(Player p) {
        setCollidable(p, true);
    }

    private void setCollidable(Player p, boolean b) {
        try {
            p.setCollidable(b);
        } catch (Exception ignored) {}

        try {
            Object spigot = p.spigot();
            var m = spigot.getClass().getMethod("setCollidesWithEntities", boolean.class);
            m.invoke(spigot, b);
        } catch (NoSuchMethodException | IllegalAccessException | InvocationTargetException ignored) {}
    }

    // ============================================================================
    // Breaking Animation
    // ============================================================================
    private void registerBlockBreakForwarder() {
        protocol.addPacketListener(
            new com.comphenix.protocol.events.PacketAdapter(plugin, PacketType.Play.Server.BLOCK_BREAK_ANIMATION) {
                @Override
                public void onPacketSending(com.comphenix.protocol.events.PacketEvent event) {

                    EpisodeManager handler = (EpisodeManager) plugin;

                    PacketContainer packet = event.getPacket();
                    if (packet.getMeta("MirrorBotRelay").isPresent()) return;

                    int breakerId = packet.getIntegers().read(0);
                    int stage = packet.getIntegers().read(1);
                    BlockPosition pos = packet.getBlockPositionModifier().read(0);

                    for (Map.Entry<Player, Player> entry : handler.getActivePairs().entrySet()) {
                        Player controller = entry.getKey();
                        Player camera = entry.getValue();

                        if (controller == null || camera == null) continue;

                        boolean isBreaker = breakerId == controller.getEntityId();
                        boolean forCtrl = event.getPlayer().equals(controller);

                        if (isBreaker || forCtrl) {
                            forward(camera, pos, stage);
                        }
                    }
                }
            }
        );
    }


    private void forward(Player viewer, BlockPosition pos, int stage) {
        try {
            PacketContainer relay = protocol.createPacket(PacketType.Play.Server.BLOCK_BREAK_ANIMATION);
            relay.getBlockPositionModifier().write(0, pos);
            relay.getIntegers().write(0, viewer.getEntityId());
            relay.getIntegers().write(1, stage);
            relay.setMeta("MirrorBotRelay", true);

            protocol.sendServerPacket(viewer, relay);
        } catch (Exception ignored) {}
    }

    // ============================================================================
    // ItemStack Cloning
    // ============================================================================
    private ItemStack[] clone(ItemStack[] items) {
        if (items == null) return new ItemStack[0];
        ItemStack[] arr = new ItemStack[items.length];
        for (int i = 0; i < items.length; i++) arr[i] = clone(items[i]);
        return arr;
    }

    private ItemStack clone(ItemStack i) {
        return i == null ? null : i.clone();
    }
}
