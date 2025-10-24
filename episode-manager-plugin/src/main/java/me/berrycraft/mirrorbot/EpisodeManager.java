package me.berrycraft.mirrorbot;

import org.bukkit.Bukkit;
import org.bukkit.ChatColor;
import org.bukkit.Location;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerAnimationEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitTask;
import org.bukkit.potion.PotionEffectType;

import net.skinsrestorer.api.SkinsRestorer;
import net.skinsrestorer.api.SkinsRestorerProvider;
import net.skinsrestorer.api.exception.DataRequestException;
import net.skinsrestorer.api.exception.MineSkinException;
import net.skinsrestorer.api.property.InputDataResult;
import net.skinsrestorer.api.property.SkinIdentifier;
import net.skinsrestorer.api.property.SkinVariant;
import net.skinsrestorer.api.storage.PlayerStorage;
import net.skinsrestorer.api.storage.SkinStorage;

import java.io.File;
import java.io.IOException;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

public class EpisodeManager extends JavaPlugin implements Listener {

    private final Map<String, String> controllerToCamera = Map.of(
            "Pengulu", "timwm"
    );

    private final Map<Player, Player> activePairs = new ConcurrentHashMap<>();
    private BukkitTask followTask;
    private boolean testRunning = false;

    private SkinsRestorer skinsRestorer;
    private File skinsDirectory;

    @Override
    public void onEnable() {
        Bukkit.getPluginManager().registerEvents(this, this);

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

        for (Player p : Bukkit.getOnlinePlayers()) {
            player.showPlayer(this, p);
            p.showPlayer(this, player);
        }

        // Hide non-participants if test running
        if (testRunning) {
            boolean isController = controllerToCamera.containsKey(player.getName());
            boolean isCamera = controllerToCamera.containsValue(player.getName());

            if (!isController && !isCamera) {
                for (Player other : Bukkit.getOnlinePlayers()) {
                    if (!other.equals(player)) {
                        player.hidePlayer(this, other);
                        other.hidePlayer(this, player);
                    }
                }
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

    @Override
    public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {
        if (!(sender instanceof Player p)) {
            sender.sendMessage(ChatColor.RED + "Only players can run this command.");
            return true;
        }

        if (args.length == 0) {
            p.sendMessage(ChatColor.YELLOW + "Usage: /episode <start|stop>");
            return true;
        }

        switch (args[0].toLowerCase(Locale.ROOT)) {
            case "start" -> startEpisode(p, Arrays.copyOfRange(args, 1, args.length));
            case "stop" -> stopEpisode(p);
            default -> p.sendMessage(ChatColor.YELLOW + "Usage: /episode <start|stop>");
        }

        return true;
    }

    private void startEpisode(Player starter, String[] requestedSkins) {
        if (testRunning) {
            starter.sendMessage(ChatColor.RED + "Episode already running!");
            return;
        }

        int pairCount = controllerToCamera.size();
        if (pairCount == 0) {
            starter.sendMessage(ChatColor.RED + "No controller/camera pairs configured.");
            return;
        }

        Map<String, File> availableSkins = loadAvailableSkinsByKey();
        if (availableSkins.isEmpty()) {
            starter.sendMessage(ChatColor.RED + "No skin PNGs found. Expected directory: " +
                    (skinsDirectory != null ? skinsDirectory.getAbsolutePath() : "unavailable"));
            return;
        }

        if (requestedSkins.length != pairCount) {
            starter.sendMessage(ChatColor.RED + "You must provide " + pairCount + " skin names for this episode.");
            return;
        }

        testRunning = true;
        activePairs.clear();

        int index = 0;
        for (var entry : controllerToCamera.entrySet()) {
            String requested = requestedSkins[index++];
            File skinFile = resolveSkinFile(requested, availableSkins);
            if (skinFile == null) {
                starter.sendMessage(ChatColor.RED + "Skin '" + requested + "' not found.");
                starter.sendMessage(ChatColor.YELLOW + "Available skins: " + String.join(", ", availableSkins.keySet()));
                testRunning = false;
                activePairs.clear();
                return;
            }

            Player controller = Bukkit.getPlayerExact(entry.getKey());
            Player camera = Bukkit.getPlayerExact(entry.getValue());

            if (controller == null || camera == null) {
                getLogger().warning("Missing player for pair: " + entry);
                continue;
            }

            activePairs.put(controller, camera);

            applySharedSkin(controller, camera, skinFile);

            // Explicit hide between controller and camera
            controller.hidePlayer(this, camera);
            camera.hidePlayer(this, controller);
        }

        // Hide cameras from everything except themselves
        for (Player camera : Bukkit.getOnlinePlayers()) {
            if (controllerToCamera.containsValue(camera.getName())) {
                for (Player other : Bukkit.getOnlinePlayers()) {
                    if (!other.equals(camera)) {
                        camera.hidePlayer(this, other);
                    }
                }
            }
        }

        // Hide non-participants completely
        for (Player p : Bukkit.getOnlinePlayers()) {
            if (!controllerToCamera.containsKey(p.getName()) && !controllerToCamera.containsValue(p.getName())) {
                for (Player other : Bukkit.getOnlinePlayers()) {
                    if (!p.equals(other)) p.hidePlayer(this, other);
                }
            }
        }

        // Camera follow logic
        followTask = Bukkit.getScheduler().runTaskTimer(this, () -> {
            for (var entry : activePairs.entrySet()) {
                Player controller = entry.getKey();
                Player camera = entry.getValue();

                if (!controller.isOnline() || !camera.isOnline()) continue;

                Location target = controller.getLocation();
                Location current = camera.getLocation();

                boolean worldChanged = current.getWorld() != target.getWorld();
                double distanceSquared = worldChanged ? Double.MAX_VALUE : current.distanceSquared(target);
                boolean rotationChanged = Math.abs(current.getYaw() - target.getYaw()) > 1.0f
                        || Math.abs(current.getPitch() - target.getPitch()) > 1.0f;

                if (worldChanged || distanceSquared > 0.0025D || rotationChanged) { // ~5 cm threshold
                    Location destination = target.clone();
                    camera.teleportAsync(destination);
                }
            }
        }, 0L, 1L);

        Bukkit.broadcastMessage(ChatColor.GREEN + "[Episode] Episode started!");
    }

    private void stopEpisode(Player caller) {
        cleanupEpisode();
        Bukkit.broadcastMessage(ChatColor.RED + "[Episode] Episode stopped. All visibility and skins reset.");
    }

    private void cleanupEpisode() {
        if (followTask != null) {
            followTask.cancel();
            followTask = null;
        }

        activePairs.clear();
        testRunning = false;

        // Restore visibility and remove invisibility
        for (Player p1 : Bukkit.getOnlinePlayers()) {
            p1.removePotionEffect(PotionEffectType.INVISIBILITY);
            p1.setInvisible(false);
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
