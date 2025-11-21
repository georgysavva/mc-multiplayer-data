package me.berrycraft.mirrorbot;

import org.bukkit.Bukkit;
import org.bukkit.ChatColor;
import org.bukkit.Location;
import org.bukkit.GameMode;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityDamageEvent;
import org.bukkit.event.entity.EntityTargetLivingEntityEvent;
import org.bukkit.event.entity.EntityPickupItemEvent;
import org.bukkit.event.player.PlayerAnimationEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitTask;
import org.bukkit.potion.PotionEffectType;
import org.bukkit.attribute.Attribute;
import org.bukkit.attribute.AttributeInstance;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.PlayerInventory;
import org.bukkit.util.Vector;

import net.skinsrestorer.api.SkinsRestorer;
import net.skinsrestorer.api.SkinsRestorerProvider;
import net.skinsrestorer.api.exception.DataRequestException;
import net.skinsrestorer.api.exception.MineSkinException;
import net.skinsrestorer.api.property.InputDataResult;
import net.skinsrestorer.api.property.SkinIdentifier;
import net.skinsrestorer.api.property.SkinVariant;
import net.skinsrestorer.api.storage.PlayerStorage;
import net.skinsrestorer.api.storage.SkinStorage;

import com.comphenix.protocol.PacketType;
import com.comphenix.protocol.ProtocolLibrary;
import com.comphenix.protocol.ProtocolManager;
import com.comphenix.protocol.events.PacketContainer;
import com.comphenix.protocol.wrappers.BlockPosition;

import java.io.File;
import java.io.IOException;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.UUID;
import java.lang.reflect.InvocationTargetException;

public class EpisodeManager extends JavaPlugin implements Listener {

    private final Map<String, String> controllerToCamera = new LinkedHashMap<>();

    private final Map<Player, Player> activePairs = new ConcurrentHashMap<>();
    private final Map<UUID, UUID> activeCameraControllers = new ConcurrentHashMap<>();
    private final Map<String, File> activeSkinSelections = new ConcurrentHashMap<>();
    private BukkitTask followTask;
    private boolean testRunning = false;
    private ProtocolManager protocolManager;


    private SkinsRestorer skinsRestorer;
    private File skinsDirectory;

    @Override
    public void onEnable() {
        Bukkit.getPluginManager().registerEvents(this, this);

        if (Bukkit.getPluginManager().getPlugin("ProtocolLib") == null) {
            getLogger().severe("ProtocolLib is required for block break forwarding.");
        } else {
            protocolManager = ProtocolLibrary.getProtocolManager();

            protocolManager.addPacketListener(new com.comphenix.protocol.events.PacketAdapter(
                    this, PacketType.Play.Server.BLOCK_BREAK_ANIMATION) {

                @Override
                public void onPacketSending(com.comphenix.protocol.events.PacketEvent event) {
                    PacketContainer packet = event.getPacket();

                    if (packet.getMeta("MirrorBotRelay").isPresent()) {
                        // Already forwarded, ignore
                        return;
                    }

                    int stage = packet.getIntegers().read(1);
                    BlockPosition pos = packet.getBlockPositionModifier().read(0);

                    Player originalViewer = event.getPlayer(); // viewer receiving the normal packet
                    Player controller = originalViewer;

                    // find camera for this controller
                    Player camera = activePairs.get(controller);
                    if (camera == null) return;

                    forwardBlockBreakAnimation(camera, pos, camera.getEntityId(), stage);
                }
            });
        }

        if (Bukkit.getPluginManager().getPlugin("SkinsRestorer") != null) {
            skinsRestorer = SkinsRestorerProvider.get();
            getLogger().info("Hooked into SkinsRestorer!");
        } else {
            getLogger().warning("SkinsRestorer not found! Skins will not be randomized.");
        }

        skinsDirectory = resolveSkinsDirectory();
        if (skinsDirectory == null) {
            getLogger().warning("Unable to resolve skins directory. Skin overrides will be unavailable.");
        } else if (!skinsDirectory.exists()) {
            if (skinsDirectory.mkdirs()) {
                getLogger().info("Created skins directory at " + skinsDirectory.getAbsolutePath());
            } else {
                getLogger().warning("Failed to create skins directory at " + skinsDirectory.getAbsolutePath());
            }
        }

        getLogger().info("EpisodeManager enabled.");
    }

    @Override
    public void onDisable() {
        cleanupEpisode();
    }

    @EventHandler
    public void onJoin(PlayerJoinEvent e) {
        Player player = e.getPlayer();
        player.removePotionEffect(PotionEffectType.INVISIBILITY);
        player.setInvisible(false);
        player.setGameMode(GameMode.SURVIVAL);

        for (Player p : Bukkit.getOnlinePlayers()) {
            player.showPlayer(this, p);
            p.showPlayer(this, player);
        }

        if (testRunning) {
            boolean isController = controllerToCamera.containsKey(player.getName());
            boolean isCamera = controllerToCamera.containsValue(player.getName());

            if (isCamera) {
                disableCollisions(player);
                applyCameraPhysicsOverrides(player);
                UUID controllerId = activeCameraControllers.get(player.getUniqueId());
                Player controller = controllerId != null ? Bukkit.getPlayer(controllerId) : null;
                if (controller == null) {
                    controller = controllerToCamera.entrySet().stream()
                            .filter(entry -> entry.getValue().equalsIgnoreCase(player.getName()))
                            .map(entry -> Bukkit.getPlayerExact(entry.getKey()))
                            .filter(Objects::nonNull)
                            .findFirst()
                            .orElse(null);
                    if (controller != null) {
                        activeCameraControllers.put(player.getUniqueId(), controller.getUniqueId());
                        activePairs.put(controller, player);
                        File skinFile = activeSkinSelections.get(player.getName());
                        if (skinFile != null) {
                            applySharedSkin(controller, player, skinFile);
                        }
                    }
                } else {
                    activePairs.put(controller, player);
                }
                for (Player other : Bukkit.getOnlinePlayers()) {
                    if (other.equals(player)) {
                        continue;
                    }
                    boolean otherIsCamera = isCamera(other);
                    boolean shouldHide = (controller != null && other.equals(controller)) || otherIsCamera;
                    if (shouldHide) {
                        player.hidePlayer(this, other);
                    } else {
                        player.showPlayer(this, other);
                    }
                }
                hideCameraFromControllers(player);
            } else if (!isController) {
                for (UUID cameraId : activeCameraControllers.keySet()) {
                    Player camera = Bukkit.getPlayer(cameraId);
                    if (camera != null && !player.equals(camera)) {
                        player.hidePlayer(this, camera);
                    }
                }
            } else {
                hideAllCamerasFromPlayer(player);
            }
        }

    }

    @EventHandler
    public void onQuit(PlayerQuitEvent e) {
        Player leaving = e.getPlayer();

        // Remove pair if either player leaves
        Optional<Player> partner = activePairs.entrySet().stream()
                .filter(entry -> entry.getKey().equals(leaving) || entry.getValue().equals(leaving))
                .map(entry -> entry.getKey().equals(leaving) ? entry.getValue() : entry.getKey())
                .findFirst();

        partner.ifPresent(other -> {
            other.kickPlayer(ChatColor.RED + "Your partner left. Episode stopped for your pair.");
            activePairs.remove(leaving);
            activePairs.remove(other);
        });
    }

    @EventHandler
    public void onSwing(PlayerAnimationEvent e) {
        Player controller = e.getPlayer();
        Player camera = activePairs.get(controller);
        if (camera != null) {
            camera.swingMainHand();
        }
    }

    @EventHandler(ignoreCancelled = true)
    public void onCameraTargeted(EntityTargetLivingEntityEvent event) {
        if (!(event.getTarget() instanceof Player target)) {
            return;
        }
        if (!isCamera(target)) {
            return;
        }
        event.setCancelled(true);
        event.setTarget(null);
    }

    @EventHandler(ignoreCancelled = true)
    public void onCameraDamaged(EntityDamageEvent event) {
        if (!(event.getEntity() instanceof Player target)) {
            return;
        }
        if (!isCamera(target)) {
            return;
        }
        event.setCancelled(true);
        event.setDamage(0);
        target.setFireTicks(0);
    }

    @EventHandler(ignoreCancelled = true)
    public void onCameraPickup(EntityPickupItemEvent event) {
        if (!(event.getEntity() instanceof Player player)) {
            return;
        }
        if (!isCamera(player)) {
            return;
        }
        event.setCancelled(true);
    }
    @EventHandler(ignoreCancelled = true)
    public void onMobTargetCamera(EntityTargetLivingEntityEvent event) {
        if (!(event.getTarget() instanceof Player target)) return;
        if (!isCamera(target)) return;

        // Completely stop target assignment
        event.setCancelled(true);
        event.setTarget(null);
    }

    @Override
    public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {

        if (args.length == 0) {
            sendUsage(sender);
            return true;
        }

        switch (args[0].toLowerCase(Locale.ROOT)) {
            case "start" -> startEpisode(sender, Arrays.copyOfRange(args, 1, args.length));
            case "stop" -> stopEpisode(sender);
            default -> sendUsage(sender);
        }

        return true;
    }

    private void sendUsage(CommandSender sender) {
        sender.sendMessage(ChatColor.YELLOW + "Usage:");
        sender.sendMessage(ChatColor.YELLOW + "/episode start <controller> <camera> <skin> [<controller> <camera> <skin> ...]");
        sender.sendMessage(ChatColor.YELLOW + "/episode stop");
    }

    private void startEpisode(CommandSender starter, String[] args) {
        if (testRunning) {
            starter.sendMessage(ChatColor.RED + "Episode already running!");
            return;
        }

        if (args.length == 0 || args.length % 3 != 0) {
            starter.sendMessage(ChatColor.RED + "You must supply controller, camera, and skin triples.");
            return;
        }

        Map<String, File> availableSkins = loadAvailableSkinsByKey();
        if (availableSkins.isEmpty()) {
            starter.sendMessage(ChatColor.RED + "No skin PNGs found. Expected directory: " +
                    (skinsDirectory != null ? skinsDirectory.getAbsolutePath() : "unavailable"));
            return;
        }

        Map<String, String> proposedPairs = new LinkedHashMap<>();
        List<EpisodeStartConfig> startConfigs = new ArrayList<>();

        for (int i = 0; i < args.length; i += 3) {
            String controllerName = args[i];
            String cameraName = args[i + 1];
            String requestedSkin = args[i + 2];

            if (proposedPairs.containsKey(controllerName)) {
                starter.sendMessage(ChatColor.RED + "Controller '" + controllerName + "' is duplicated.");
                return;
            }

            if (proposedPairs.containsValue(cameraName)) {
                starter.sendMessage(ChatColor.RED + "Camera '" + cameraName + "' is duplicated.");
                return;
            }

            File skinFile = resolveSkinFile(requestedSkin, availableSkins);
            if (skinFile == null) {
                starter.sendMessage(ChatColor.RED + "Skin '" + requestedSkin + "' not found.");
                starter.sendMessage(ChatColor.YELLOW + "Available skins: " + String.join(", ", availableSkins.keySet()));
                return;
            }

            startConfigs.add(new EpisodeStartConfig(controllerName, cameraName, skinFile));
            proposedPairs.put(controllerName, cameraName);
        }

        if (startConfigs.isEmpty()) {
            starter.sendMessage(ChatColor.RED + "No valid controller/camera pairs supplied.");
            return;
        }

        testRunning = true;
        controllerToCamera.clear();
        controllerToCamera.putAll(proposedPairs);
        activePairs.clear();
        activeCameraControllers.clear();
        activeSkinSelections.clear();

        for (EpisodeStartConfig config : startConfigs) {
            activeSkinSelections.put(config.controller(), config.skinFile());
            activeSkinSelections.put(config.camera(), config.skinFile());

            Player controller = Bukkit.getPlayerExact(config.controller());
            Player camera = Bukkit.getPlayerExact(config.camera());

            if (controller == null || camera == null) {
                getLogger().warning("Missing player for pair: " + config.controller() + " -> " + config.camera());
                continue;
            }

            controller.setGameMode(GameMode.SURVIVAL);
            camera.setGameMode(GameMode.SURVIVAL);

            activePairs.put(controller, camera);
            activeCameraControllers.put(camera.getUniqueId(), controller.getUniqueId());
            disableCollisions(camera);

            applySharedSkin(controller, camera, config.skinFile());
        }

        // Ensure a clean visibility baseline so spectators can watch
        for (Player p1 : Bukkit.getOnlinePlayers()) {
            for (Player p2 : Bukkit.getOnlinePlayers()) {
                if (!p1.equals(p2)) {
                    p1.showPlayer(this, p2);
                }
            }
        }

        // Camera bots should only hide their controller and other cameras
        for (var entry : activeCameraControllers.entrySet()) {
            Player camera = Bukkit.getPlayer(entry.getKey());
            Player controller = Bukkit.getPlayer(entry.getValue());
            if (camera == null) {
                continue;
            }
            for (Player other : Bukkit.getOnlinePlayers()) {
                if (other.equals(camera)) {
                    continue;
                }
                boolean otherIsCamera = isCamera(other);
                boolean shouldHide = (controller != null && other.equals(controller)) || otherIsCamera;
                if (shouldHide) {
                    camera.hidePlayer(this, other);
                } else {
                    camera.showPlayer(this, other);
                }
            }
            hideCameraFromControllers(camera);
        }

        // Hide cameras from non-participants so spectators do not see them
        for (Player spectator : Bukkit.getOnlinePlayers()) {
            boolean isParticipant = controllerToCamera.containsKey(spectator.getName())
                    || controllerToCamera.containsValue(spectator.getName());
            if (isParticipant) {
                continue;
            }
            for (UUID cameraId : activeCameraControllers.keySet()) {
                Player camera = Bukkit.getPlayer(cameraId);
                if (camera != null && !spectator.equals(camera)) {
                    spectator.hidePlayer(this, camera);
                }
            }
        }

        // Controllers should not see any cameras
        for (Player controller : activePairs.keySet()) {
            if (controller == null) {
                continue;
            }
            hideAllCamerasFromPlayer(controller);
        }

        // Camera follow logic
        followTask = Bukkit.getScheduler().runTaskTimer(this, () -> {
            for (var entry : activePairs.entrySet()) {
                Player controller = entry.getKey();
                Player camera = entry.getValue();

                if (!controller.isOnline() || !camera.isOnline()) continue;

                mirrorInventory(controller, camera);
                mirrorStatus(controller, camera);

                Location target = controller.getLocation();
                Location current = camera.getLocation();

                boolean worldChanged = current.getWorld() != target.getWorld();
                double distanceSquared = worldChanged ? Double.MAX_VALUE : current.distanceSquared(target);
                boolean rotationChanged = Math.abs(current.getYaw() - target.getYaw()) > 1.0f
                        || Math.abs(current.getPitch() - target.getPitch()) > 1.0f;

                if (worldChanged || distanceSquared > 0.0025D || rotationChanged) { // ~5 cm threshold
                    camera.teleportAsync(target.clone());
                }
            }
        }, 0L, 1L);

        Bukkit.broadcastMessage(ChatColor.GREEN + "[Episode] Episode started!");
    }

    private boolean isCamera(Player player) {
        return activeCameraControllers.containsKey(player.getUniqueId())
                || (testRunning && controllerToCamera.containsValue(player.getName()));
    }

    private boolean isController(Player player) {
        return player != null && controllerToCamera.containsKey(player.getName());
    }

    private void hideCameraFromControllers(Player camera) {
        if (camera == null) {
            return;
        }
        for (String controllerName : controllerToCamera.keySet()) {
            Player controller = Bukkit.getPlayerExact(controllerName);
            if (controller != null && !controller.equals(camera)) {
                controller.hidePlayer(this, camera);
            }
        }
    }

    private void hideAllCamerasFromPlayer(Player player) {
        if (player == null) {
            return;
        }
        for (UUID cameraId : activeCameraControllers.keySet()) {
            Player activeCamera = Bukkit.getPlayer(cameraId);
            if (activeCamera != null && !player.equals(activeCamera)) {
                player.hidePlayer(this, activeCamera);
            }
        }
        for (String cameraName : controllerToCamera.values()) {
            Player configuredCamera = Bukkit.getPlayerExact(cameraName);
            if (configuredCamera != null && !player.equals(configuredCamera)) {
                player.hidePlayer(this, configuredCamera);
            }
        }
    }

    private void forwardBlockBreakAnimation(Player viewer, BlockPosition pos, int breakerEntityId, int stage) {
        try {
            PacketContainer relay = protocolManager.createPacket(PacketType.Play.Server.BLOCK_BREAK_ANIMATION);
            relay.getBlockPositionModifier().write(0, pos);
            relay.getIntegers().write(0, breakerEntityId);
            relay.getIntegers().write(1, stage);
            relay.setMeta("MirrorBotRelay", true);
            protocolManager.sendServerPacket(viewer, relay);
        } catch (Exception ex) {
            getLogger().warning("Failed to forward break animation: " + ex.getMessage());
        }
    }

    private void applyCameraPhysicsOverrides(Player camera) {
        if (camera == null) {
            return;
        }
        camera.setGravity(false);
        camera.setFallDistance(0.0F);
        camera.setVelocity(new Vector(0, 0, 0));
        camera.setAllowFlight(true);
        if (!camera.isFlying()) {
            camera.setFlying(true);
        }
    }

    private void resetCameraPhysics(Player player) {
        if (player == null) {
            return;
        }
        player.setGravity(true);
        GameMode mode = player.getGameMode();
        if (mode != GameMode.CREATIVE && mode != GameMode.SPECTATOR) {
            player.setAllowFlight(false);
            if (player.isFlying()) {
                player.setFlying(false);
            }
        }
    }

    private void disableCollisions(Player player) {
        setCollidable(player, false);
    }

    private void enableCollisions(Player player) {
        setCollidable(player, true);
    }

    private void setCollidable(Player player, boolean collidable) {
        if (player == null) {
            return;
        }
        try {
            player.setCollidable(collidable);
        } catch (NoSuchMethodError ignored) {
        }
        try {
            Object spigot = player.spigot();
            var method = spigot.getClass().getMethod("setCollidesWithEntities", boolean.class);
            method.invoke(spigot, collidable);
        } catch (UnsupportedOperationException | NoSuchMethodException | IllegalAccessException | InvocationTargetException ignored) {
        }
    }

    private void mirrorInventory(Player controller, Player camera) {
        PlayerInventory controllerInv = controller.getInventory();
        PlayerInventory cameraInv = camera.getInventory();

        ItemStack[] controllerStorage = controllerInv.getStorageContents();
        ItemStack[] cameraStorage = cameraInv.getStorageContents();
        if (!Arrays.equals(controllerStorage, cameraStorage)) {
            cameraInv.setStorageContents(cloneItemStackArray(controllerStorage));
        }

        ItemStack[] controllerArmor = controllerInv.getArmorContents();
        ItemStack[] cameraArmor = cameraInv.getArmorContents();
        if (!Arrays.equals(controllerArmor, cameraArmor)) {
            cameraInv.setArmorContents(cloneItemStackArray(controllerArmor));
        }

        ItemStack controllerOffHand = controllerInv.getItemInOffHand();
        ItemStack cameraOffHand = cameraInv.getItemInOffHand();
        if (!Objects.equals(controllerOffHand, cameraOffHand)) {
            cameraInv.setItemInOffHand(cloneItem(controllerOffHand));
        }

        int controllerSlot = controllerInv.getHeldItemSlot();
        if (cameraInv.getHeldItemSlot() != controllerSlot) {
            cameraInv.setHeldItemSlot(controllerSlot);
        }
    }

    private void mirrorStatus(Player controller, Player camera) {
        AttributeInstance cameraMaxHealthAttr = camera.getAttribute(Attribute.GENERIC_MAX_HEALTH);
        double cameraMaxHealth = cameraMaxHealthAttr != null ? cameraMaxHealthAttr.getValue() : camera.getHealth();
        double targetHealth = Math.min(controller.getHealth(), cameraMaxHealth);
        targetHealth = Math.max(0.0D, targetHealth);
        if (Math.abs(camera.getHealth() - targetHealth) > 0.01D) {
            camera.setHealth(targetHealth);
        }

        if (camera.getFoodLevel() != controller.getFoodLevel()) {
            camera.setFoodLevel(controller.getFoodLevel());
        }
        if (Math.abs(camera.getSaturation() - controller.getSaturation()) > 0.01F) {
            camera.setSaturation(controller.getSaturation());
        }
        if (Math.abs(camera.getExhaustion() - controller.getExhaustion()) > 0.01F) {
            camera.setExhaustion(controller.getExhaustion());
        }

        if (camera.getRemainingAir() != controller.getRemainingAir()) {
            camera.setRemainingAir(controller.getRemainingAir());
        }
        if (camera.getMaximumAir() != controller.getMaximumAir()) {
            camera.setMaximumAir(controller.getMaximumAir());
        }

    }

    private ItemStack[] cloneItemStackArray(ItemStack[] source) {
        if (source == null) {
            return new ItemStack[0];
        }
        ItemStack[] clone = new ItemStack[source.length];
        for (int i = 0; i < source.length; i++) {
            clone[i] = cloneItem(source[i]);
        }
        return clone;
    }

    private ItemStack cloneItem(ItemStack item) {
        return item == null ? null : item.clone();
    }

    private void stopEpisode(CommandSender caller) {
        cleanupEpisode();
        Bukkit.broadcastMessage(ChatColor.RED + "[Episode] Episode stopped. All visibility and skins reset.");
    }

    private void cleanupEpisode() {
        if (followTask != null) {
            followTask.cancel();
            followTask = null;
        }

        controllerToCamera.clear();
        activeSkinSelections.clear();
        activePairs.clear();
        testRunning = false;
        activeCameraControllers.clear();

        // Restore visibility, remove invisibility, and re-enable collisions
        for (Player p1 : Bukkit.getOnlinePlayers()) {
            p1.removePotionEffect(PotionEffectType.INVISIBILITY);
            p1.setInvisible(false);
            enableCollisions(p1);
            resetCameraPhysics(p1);
            for (Player p2 : Bukkit.getOnlinePlayers()) {
                if (!p1.equals(p2)) {
                    p1.showPlayer(this, p2);
                    p2.showPlayer(this, p1);
                }
            }
        }

        // Reset skins
        if (skinsRestorer != null) {
            Bukkit.getScheduler().runTaskAsynchronously(this, () -> {
                for (Player player : Bukkit.getOnlinePlayers()) {
                    try {
                        PlayerStorage ps = skinsRestorer.getPlayerStorage();
                        ps.removeSkinIdOfPlayer(player.getUniqueId());
                        Bukkit.getScheduler().runTask(this, () -> {
                            try {
                                skinsRestorer.getSkinApplier(Player.class).applySkin(player);
                            } catch (DataRequestException e) {
                                e.printStackTrace();
                            }
                        });
                    } catch (Exception e) {
                        e.printStackTrace();
                    }
                }
            });
        }

        getLogger().info("Episode cleaned up: players detached, visibility restored, skins reset.");
    }

    private void applySharedSkin(Player controller, Player camera, File skinFile) {
        if (skinsRestorer == null) return;

        Bukkit.getScheduler().runTaskAsynchronously(this, () -> {
            try {
                SkinStorage skinStorage = skinsRestorer.getSkinStorage();
                if (skinStorage == null) {
                    getLogger().warning("SkinStorage not available from SkinsRestorer.");
                    return;
                }

                String storageKey = buildStorageKey(skinFile);
                Optional<InputDataResult> cached = skinStorage.findSkinData(storageKey);
                SkinIdentifier skinId;

                if (cached.isPresent()) {
                    skinId = cached.get().getIdentifier();
                } else {
                    var mineSkinApi = skinsRestorer.getMineSkinAPI();
                    if (mineSkinApi == null) {
                        getLogger().warning("MineSkin API unavailable; cannot process skin file " + skinFile.getName());
                        return;
                    }

                    var response = mineSkinApi.genSkin(skinFile.toPath(), SkinVariant.CLASSIC);
                    skinStorage.setCustomSkinData(storageKey, response.getProperty());

                    Optional<InputDataResult> stored = skinStorage.findSkinData(storageKey);
                    if (stored.isEmpty()) {
                        getLogger().warning("Failed to persist skin data for file " + skinFile.getName());
                        return;
                    }
                    skinId = stored.get().getIdentifier();
                }

                PlayerStorage playerStorage = skinsRestorer.getPlayerStorage();
                playerStorage.setSkinIdOfPlayer(controller.getUniqueId(), skinId);
                playerStorage.setSkinIdOfPlayer(camera.getUniqueId(), skinId);

                Bukkit.getScheduler().runTask(this, () -> {
                    try {
                        skinsRestorer.getSkinApplier(Player.class).applySkin(controller);
                        skinsRestorer.getSkinApplier(Player.class).applySkin(camera);
                    } catch (DataRequestException e) {
                        e.printStackTrace();
                    }
                });
            } catch (DataRequestException | MineSkinException | IOException e) {
                e.printStackTrace();
            }
        });
    }

    private static final class EpisodeStartConfig {
        private final String controller;
        private final String camera;
        private final File skinFile;

        private EpisodeStartConfig(String controller, String camera, File skinFile) {
            this.controller = controller;
            this.camera = camera;
            this.skinFile = skinFile;
        }

        private String controller() {
            return controller;
        }

        private String camera() {
            return camera;
        }

        private File skinFile() {
            return skinFile;
        }
    }

    private Map<String, File> loadAvailableSkinsByKey() {
        if (skinsDirectory == null || !skinsDirectory.isDirectory()) {
            return Collections.emptyMap();
        }

        File[] files = skinsDirectory.listFiles((dir, name) -> name.toLowerCase(Locale.ROOT).endsWith(".png"));
        if (files == null || files.length == 0) {
            return Collections.emptyMap();
        }

        Map<String, File> result = new TreeMap<>();
        Arrays.stream(files)
                .sorted(Comparator
                        .comparingInt(this::extractIndex)
                        .thenComparing(File::getName, String.CASE_INSENSITIVE_ORDER))
                .forEach(file -> result.put(normalizeSkinKey(file.getName()), file));
        return result;
    }

    private int extractIndex(File file) {
        String name = file.getName();
        int underscore = name.indexOf('_');
        if (underscore > 0) {
            String prefix = name.substring(0, underscore);
            try {
                return Integer.parseInt(prefix);
            } catch (NumberFormatException ignored) {
            }
        }
        return Integer.MAX_VALUE;
    }

    private String buildStorageKey(File skinFile) {
        return "file:" + skinFile.getName().toLowerCase(Locale.ROOT);
    }

    private String normalizeSkinKey(String input) {
        String cleaned = input.toLowerCase(Locale.ROOT);
        if (cleaned.endsWith(".png")) {
            cleaned = cleaned.substring(0, cleaned.length() - 4);
        }

        int underscoreIndex = cleaned.indexOf('_');
        if (underscoreIndex >= 0) {
            String prefix = cleaned.substring(0, underscoreIndex);
            if (prefix.chars().allMatch(Character::isDigit)) {
                cleaned = cleaned.substring(underscoreIndex + 1);
            }
        }

        return cleaned.trim();
    }

    private File resolveSkinFile(String requested, Map<String, File> availableSkins) {
        String key = normalizeSkinKey(requested);
        return availableSkins.get(key);
    }

    private File resolveSkinsDirectory() {
        try {
            File pluginData = getDataFolder().getCanonicalFile();
            File pluginsDir = pluginData.getParentFile();
            if (pluginsDir == null) {
                return new File(pluginData, "skins");
            }

            File dataDir = pluginsDir.getParentFile();
            if (dataDir != null) {
                return new File(dataDir, "skins");
            }

            return new File(pluginsDir, "skins");
        } catch (IOException e) {
            e.printStackTrace();
            return null;
        }
    }

    public boolean isTestRunning() {
        return testRunning;
    }
}
