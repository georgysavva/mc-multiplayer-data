package me.berrycraft.mirrorbot;

import org.bukkit.Bukkit;
import org.bukkit.ChatColor;
import org.bukkit.GameMode;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.bukkit.plugin.java.JavaPlugin;

import com.comphenix.protocol.ProtocolLibrary;
import com.comphenix.protocol.ProtocolManager;

import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;

import java.io.File;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

public class EpisodeManager extends JavaPlugin implements Listener {

    // ---- STATE ----
    private final Map<String, String> controllerToCamera = new LinkedHashMap<>();
    private final Map<Player, Player> activePairs          = new ConcurrentHashMap<>();
    private final Map<UUID, UUID> activeCameraControllers = new ConcurrentHashMap<>();
    private final Map<String, File> activeSkinSelections  = new ConcurrentHashMap<>();
    private final Map<UUID, UUID> activeSpectatorsByController = new ConcurrentHashMap<>();
    private final Map<UUID, UUID> controllerBySpectator = new ConcurrentHashMap<>();
    
    // Demo camera state
    private final Set<UUID> demoCameras = ConcurrentHashMap.newKeySet();

    private boolean episodeRunning = false;

    // ---- MANAGERS ----
    private CameraManager cameraManager;
    private SkinManager skinManager;
    private ProtocolManager protocolManager;

    @Override
    public void onEnable() {

        if (Bukkit.getPluginManager().getPlugin("ProtocolLib") == null) {
            getLogger().severe("ProtocolLib is required for MirrorBot to run.");
            Bukkit.getPluginManager().disablePlugin(this);
            return;
        }

        protocolManager = ProtocolLibrary.getProtocolManager();

        skinManager = new SkinManager(this);
        cameraManager = new CameraManager(this, protocolManager);

        Bukkit.getPluginManager().registerEvents(this, this);
        Bukkit.getPluginManager().registerEvents(cameraManager, this);

        getLogger().info("EpisodeManager enabled.");
    }

    @Override
    public void onDisable() {
        stopEpisode(null);
    }

    // =====================================================================================
    // Episode Command
    // =====================================================================================

    @Override
    public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {

        if (args.length == 0) {
            sendUsage(sender);
            return true;
        }

        switch (args[0].toLowerCase(Locale.ROOT)) {
            case "start" -> startEpisode(sender, Arrays.copyOfRange(args, 1, args.length));
            case "stop"  -> stopEpisode(sender);
            default      -> sendUsage(sender);
        }

        return true;
    }

    private void sendUsage(CommandSender sender) {
        sender.sendMessage(ChatColor.YELLOW + "Usage:");
        sender.sendMessage(ChatColor.YELLOW + "/episode start <controller> <camera> <skin> [repeat...]");
        sender.sendMessage(ChatColor.YELLOW + "  [demoCamera <name>]");
        sender.sendMessage(ChatColor.YELLOW + "/episode stop");
    }

    // =====================================================================================
    // Episode Logic
    // =====================================================================================

    private void startEpisode(CommandSender starter, String[] args) {

        if (episodeRunning) {
            if (starter != null)
                starter.sendMessage(ChatColor.RED + "Episode already running!");
            return;
        }

        if (args.length == 0) {
            if (starter != null)
                starter.sendMessage(ChatColor.RED + "You must supply triples: <controller> <camera> <skin>");
            return;
        }

        // Find where demoCamera args start (if any)
        int demoCameraIndex = -1;
        for (int i = 0; i < args.length; i++) {
            if ("demoCamera".equalsIgnoreCase(args[i])) {
                demoCameraIndex = i;
                break;
            }
        }

        // Split args into controller/camera pairs and demo camera config
        String[] pairArgs = demoCameraIndex >= 0 
            ? Arrays.copyOfRange(args, 0, demoCameraIndex)
            : args;
        String[] demoArgs = demoCameraIndex >= 0
            ? Arrays.copyOfRange(args, demoCameraIndex + 1, args.length)
            : new String[0];

        if (pairArgs.length == 0 || pairArgs.length % 3 != 0) {
            if (starter != null)
                starter.sendMessage(ChatColor.RED + "You must supply triples: <controller> <camera> <skin>");
            return;
        }

        // Parse demo camera config: just the name (positioning is handled by bots)
        String demoCameraName = null;
        if (demoArgs.length > 0) {
            if (demoArgs.length != 1) {
                if (starter != null)
                    starter.sendMessage(ChatColor.RED + "Demo camera requires: <name>");
                return;
            }
            demoCameraName = demoArgs[0];
            getLogger().info("Demo camera configured: " + demoCameraName);
        }

        Map<String, File> availableSkins = skinManager.loadSkins();
        if (availableSkins.isEmpty()) {
            starter.sendMessage(ChatColor.RED + "No skins found.");
            return;
        }

        Map<String, String> pairMap = new LinkedHashMap<>();
        List<StartConfig> configs = new ArrayList<>();

        for (int i = 0; i < pairArgs.length; i += 3) {
            String ctrl = pairArgs[i];
            String cam = pairArgs[i + 1];
            String skinKey = pairArgs[i + 2];

            if (pairMap.containsKey(ctrl)) {
                starter.sendMessage(ChatColor.RED + "Duplicate controller: " + ctrl);
                return;
            }
            if (pairMap.containsValue(cam)) {
                starter.sendMessage(ChatColor.RED + "Duplicate camera: " + cam);
                return;
            }

            File skin = skinManager.resolveSkin(skinKey, availableSkins);
            if (skin == null) {
                starter.sendMessage(ChatColor.RED + "Skin not found: " + skinKey);
                return;
            }

            configs.add(new StartConfig(ctrl, cam, skin));
            pairMap.put(ctrl, cam);
        }

        // ---- ACTIVATE EPISODE ----
        episodeRunning = true;
        controllerToCamera.clear();
        controllerToCamera.putAll(pairMap);

        activePairs.clear();
        activeSkinSelections.clear();
        activeCameraControllers.clear();
        activeSpectatorsByController.clear();
        controllerBySpectator.clear();
        demoCameras.clear();

        for (StartConfig cfg : configs) {

            activeSkinSelections.put(cfg.controller, cfg.skin);
            activeSkinSelections.put(cfg.camera, cfg.skin);

            Player controller = Bukkit.getPlayerExact(cfg.controller);
            Player camera     = Bukkit.getPlayerExact(cfg.camera);

            if (controller == null || camera == null) {
                getLogger().warning("Missing players for pair: " + cfg.controller + " -> " + cfg.camera);
                continue;
            }

            controller.setGameMode(GameMode.SURVIVAL);
            camera.setGameMode(GameMode.SURVIVAL);

            activePairs.put(controller, camera);
            activeCameraControllers.put(camera.getUniqueId(), controller.getUniqueId());

            // Only create spectator bots when demo camera is NOT configured
            // (demo camera replaces the individual spectator bots)
            if (demoCameraName == null) {
                Player spectator = Bukkit.getPlayerExact("Spectator" + cfg.controller);
                if (spectator != null) {
                    spectator.setGameMode(GameMode.SPECTATOR);
                    activeSpectatorsByController.put(controller.getUniqueId(), spectator.getUniqueId());
                    controllerBySpectator.put(spectator.getUniqueId(), controller.getUniqueId());
                }
            }

            cameraManager.prepareCamera(camera);
            skinManager.applySharedSkin(controller, camera, cfg.skin);
        }

        if (demoCameraName != null) {
            Player demoCamera = Bukkit.getPlayerExact(demoCameraName);
            if (demoCamera != null) {
                demoCameras.add(demoCamera.getUniqueId());
                // the demoCamera is set to Spectator mode and replaces the usual spectator bots
                demoCamera.setGameMode(GameMode.SPECTATOR);
                getLogger().info("Demo camera registered: " + demoCameraName);
            } else {
                getLogger().warning("Demo camera player not found: " + demoCameraName);
            }
        }

        refreshEpisodeVisibility();
        cameraManager.startFollowingTask();

        Bukkit.broadcastMessage(ChatColor.GREEN + "[Episode] Episode started!");
    }

    public void stopEpisode(CommandSender caller) {
        if (!episodeRunning) return;

        episodeRunning = false;

        cameraManager.stopFollowingTask();

        // Restore physics + collisions
        for (Player p : Bukkit.getOnlinePlayers()) {
            cameraManager.restorePlayer(p);
        }

        resetAllVisibility();
        skinManager.resetAllSkins();

        controllerToCamera.clear();
        activePairs.clear();
        activeCameraControllers.clear();
        activeSkinSelections.clear();
        demoCameras.clear();
        for (UUID spectatorId : controllerBySpectator.keySet()) {
            Player spectator = Bukkit.getPlayer(spectatorId);
            if (spectator != null) spectator.setGameMode(GameMode.SURVIVAL);
        }
        activeSpectatorsByController.clear();
        controllerBySpectator.clear();

        Bukkit.broadcastMessage(ChatColor.RED + "[Episode] Episode stopped.");
    }

    // =====================================================================================
    // Visibility Logic
    // =====================================================================================

    private void refreshEpisodeVisibility() {

        // Everyone sees everyone first
        resetAllVisibility();

        // Hide all cameras from non-participants (not controllers, cameras, spectators), e.g. demo cameras
        for (Player p : Bukkit.getOnlinePlayers()) {
            boolean participant =
                    controllerToCamera.containsKey(p.getName()) ||
                    controllerToCamera.containsValue(p.getName()) ||
                    isSpectator(p);

            if (!participant) {
                for (UUID camId : activeCameraControllers.keySet()) {
                    Player cam = Bukkit.getPlayer(camId);
                    if (cam != null) p.hidePlayer(this, cam);
                }
            }
        }

        // Controllers never see cameras
        for (Player controller : activePairs.keySet()) {
            hideAllCamerasFrom(controller);
        }

        // Cameras hide their controller + other cameras
        for (Map.Entry<UUID, UUID> entry : activeCameraControllers.entrySet()) {
            Player camera = Bukkit.getPlayer(entry.getKey());
            Player controller = Bukkit.getPlayer(entry.getValue());

            if (camera == null) continue;

            for (Player other : Bukkit.getOnlinePlayers()) {
                boolean hide = other.equals(controller) || isCamera(other);
                if (hide) camera.hidePlayer(this, other);
                else camera.showPlayer(this, other);
            }
        }
    }

    private void resetAllVisibility() {
        for (Player p1 : Bukkit.getOnlinePlayers()) {
            for (Player p2 : Bukkit.getOnlinePlayers()) {
                if (!p1.equals(p2)) p1.showPlayer(this, p2);
            }
        }
    }

    private void hideAllCamerasFrom(Player p) {
        for (UUID camId : activeCameraControllers.keySet()) {
            Player cam = Bukkit.getPlayer(camId);
            if (cam != null) p.hidePlayer(this, cam);
        }
        for (String camName : controllerToCamera.values()) {
            Player cam = Bukkit.getPlayerExact(camName);
            if (cam != null) p.hidePlayer(this, cam);
        }
    }

    // =====================================================================================
    // Events
    // =====================================================================================

    @EventHandler
    public void onJoin(PlayerJoinEvent e) {
        Player p = e.getPlayer();

        if (!episodeRunning) return;

        // If controller or camera rejoined, re-apply visibility rules
        refreshEpisodeVisibility();

        // If this is a camera that rejoined, reapply physics
        if (isCamera(p)) {
            cameraManager.prepareCamera(p);
        }

        // Restore demo camera state if they reconnect mid-episode
        if (isDemoCamera(p)) {
            p.setGameMode(GameMode.SPECTATOR);
        }

        // Restore spectator state if they reconnect mid-episode
        if (isSpectator(p)) {
            p.setGameMode(GameMode.SPECTATOR);
        } else {
            attachSpectatorIfMatches(p);
        }
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent e) {
        Player leaving = e.getPlayer();

        Optional<Player> partner = activePairs.entrySet().stream()
                .filter(ent -> ent.getKey().equals(leaving) || ent.getValue().equals(leaving))
                .map(ent -> ent.getKey().equals(leaving) ? ent.getValue() : ent.getKey())
                .findFirst();

        partner.ifPresent(p ->
                p.kickPlayer(ChatColor.RED + "Your partner left. Episode ended.")
        );
    }

    // =====================================================================================
    // State Accessors for CameraManager
    // =====================================================================================

    public boolean isEpisodeRunning() { return episodeRunning; }

    public boolean isCamera(Player p) {
        return activeCameraControllers.containsKey(p.getUniqueId()) ||
               controllerToCamera.containsValue(p.getName());
    }

    public boolean isSpectator(Player p) {
        return controllerBySpectator.containsKey(p.getUniqueId());
    }

    public boolean isDemoCamera(Player p) {
        return demoCameras.contains(p.getUniqueId());
    }

    public Map<Player, Player> getActivePairs() { return activePairs; }

    public Map<UUID, UUID> getActiveCameraControllers() { return activeCameraControllers; }

    public UUID getSpectatorForController(UUID controllerId) {
        return activeSpectatorsByController.get(controllerId);
    }

    public Map<UUID, UUID> getSpectatorsByController() {
        return activeSpectatorsByController;
    }

    private void attachSpectatorIfMatches(Player p) {
        if (!episodeRunning) return;
        // Skip spectator attachment in demo mode (demo camera replaces spectator bots)
        if (!demoCameras.isEmpty()) return;
        if (controllerBySpectator.containsKey(p.getUniqueId())) return;

        for (String controllerName : controllerToCamera.keySet()) {
            if (("Spectator" + controllerName).equals(p.getName())) {
                Player controller = Bukkit.getPlayerExact(controllerName);
                if (controller != null) {
                    p.setGameMode(GameMode.SPECTATOR);
                    activeSpectatorsByController.put(controller.getUniqueId(), p.getUniqueId());
                    controllerBySpectator.put(p.getUniqueId(), controller.getUniqueId());
                }
                break;
            }
        }
    }

    // =====================================================================================

    private static class StartConfig {
        final String controller;
        final String camera;
        final File skin;

        StartConfig(String c, String m, File s) {
            this.controller = c;
            this.camera = m;
            this.skin = s;
        }
    }
}
