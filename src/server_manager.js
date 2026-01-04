const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

class ServerManager {
    constructor(serverDir) {
        this.serverDir = serverDir;
        this.propertiesPath = path.join(serverDir, 'server.properties');
        this.worldsDir = path.join(serverDir, 'worlds');
        this.backupsDir = path.join(serverDir, 'backups');

        if (!fs.existsSync(this.backupsDir)) {
            try {
                fs.mkdirSync(this.backupsDir);
            } catch (e) {
                console.error("Could not create backups directory", e);
            }
        }
    }

    readProperties() {
        if (!fs.existsSync(this.propertiesPath)) return {};
        const content = fs.readFileSync(this.propertiesPath, 'utf8');
        const lines = content.split('\n');
        const props = {};
        lines.forEach(line => {
            const trimmed = line.trim();
            if (trimmed.startsWith('#') || !trimmed.includes('=')) return;
            const idx = trimmed.indexOf('=');
            const key = trimmed.substring(0, idx).trim();
            const val = trimmed.substring(idx + 1).trim();
            if (key) props[key] = val;
        });
        return props;
    }

    writeProperties(newProps) {
        if (!fs.existsSync(this.propertiesPath)) return;
        let content = fs.readFileSync(this.propertiesPath, 'utf8');
        const lines = content.split('\n');
        const updatedLines = lines.map(line => {
            if (line.trim().startsWith('#') || (!line.includes('=') && line.trim() !== '')) return line;
            const parts = line.split('=');
            const key = parts[0].trim();
            if (newProps[key] !== undefined) {
                return `${key}=${newProps[key]}`;
            }
            return line;
        });

        fs.writeFileSync(this.propertiesPath, updatedLines.join('\n'));
    }

    createBackup() {
        const props = this.readProperties();
        const levelName = props['level-name'] || 'Bedrock level';
        const worldPath = path.join(this.worldsDir, levelName);

        if (!fs.existsSync(worldPath)) {
            throw new Error(`World ${levelName} not found`);
        }

        const zip = new AdmZip();
        zip.addLocalFolder(worldPath);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupName = `${levelName}_${timestamp}.zip`;
        const backupPath = path.join(this.backupsDir, backupName);

        zip.writeZip(backupPath);
        return { name: backupName, path: backupPath };
    }

    listBackups() {
        if (!fs.existsSync(this.backupsDir)) return [];
        return fs.readdirSync(this.backupsDir).map(file => {
            const filePath = path.join(this.backupsDir, file);
            try {
                const stats = fs.statSync(filePath);
                return {
                    name: file,
                    size: (stats.size / 1024 / 1024).toFixed(2) + ' MB',
                    created: stats.birthtime
                };
            } catch (e) {
                return null;
            }
        }).filter(Boolean);
    }

    deleteBackup(filename) {
        const filePath = path.join(this.backupsDir, filename);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }

    installAddon(filePath, originalName) {
        try {
            const ext = path.extname(originalName).toLowerCase();
            const baseName = path.basename(originalName, ext);

            // Handle different file types
            if (ext === '.mcworld' || ext === '.mctemplate') {
                // World templates - extract to worlds folder
                const zip = new AdmZip(filePath);
                const targetDir = path.join(this.serverDir, 'worlds', baseName);

                if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
                zip.extractAllTo(targetDir, true);

                // Register world template
                this.registerAddon({ name: baseName, type: 'World Template', path: 'worlds/' + baseName });

                return { success: true, type: 'World Template', name: baseName };
            }

            // Handle mcpack/mcaddon (behavior/resource packs)
            const zip = new AdmZip(filePath);
            const zipEntries = zip.getEntries();
            let isBehavior = false;
            let isResource = false;

            // Check manifest.json inside zip
            const manifestEntry = zipEntries.find(entry => entry.entryName.endsWith('manifest.json'));
            if (manifestEntry) {
                const manifestContent = manifestEntry.getData().toString('utf8');
                const manifest = JSON.parse(manifestContent);
                if (manifest.modules) {
                    isBehavior = manifest.modules.some(m => m.type === 'data' || m.type === 'script');
                    isResource = manifest.modules.some(m => m.type === 'resources');
                }
            }

            // Target directory
            let targetDir;
            let packType;
            if (isBehavior) {
                targetDir = path.join(this.serverDir, 'behavior_packs');
                packType = 'Behavior Pack';
            } else if (isResource) {
                targetDir = path.join(this.serverDir, 'resource_packs');
                packType = 'Resource Pack';
            } else {
                targetDir = path.join(this.serverDir, 'behavior_packs');
                packType = 'Addon';
            }

            // Extract
            const extractPath = path.join(targetDir, baseName);
            if (!fs.existsSync(extractPath)) fs.mkdirSync(extractPath, { recursive: true });
            zip.extractAllTo(extractPath, true);

            // Register addon
            const addonInfo = {
                name: baseName,
                type: packType,
                path: (isBehavior ? 'behavior_packs/' : 'resource_packs/') + baseName
            };
            this.registerAddon(addonInfo);

            return { success: true, type: packType, name: baseName };

        } catch (e) {
            console.error("Addon install error", e);
            throw new Error("Failed to install: " + e.message);
        }
    }

    listAddons() {
        const addonsFile = path.join(this.serverDir, 'installed_addons.json');
        if (fs.existsSync(addonsFile)) {
            try {
                return JSON.parse(fs.readFileSync(addonsFile, 'utf8'));
            } catch {
                return [];
            }
        }
        return [];
    }

    // Get currently active addons info
    getActiveAddons() {
        const props = this.readProperties();
        const levelName = props['level-name'] || 'Bedrock level';
        const worldDir = path.join(this.serverDir, 'worlds', levelName);

        const activeInfo = {
            activeWorld: levelName,
            activeResourcePacks: [],
            activeBehaviorPacks: []
        };

        // Read world resource packs
        const resPacks = path.join(worldDir, 'world_resource_packs.json');
        if (fs.existsSync(resPacks)) {
            try {
                const packs = JSON.parse(fs.readFileSync(resPacks, 'utf8'));
                activeInfo.activeResourcePacks = packs.map(p => p.pack_id);
            } catch { }
        }

        // Read world behavior packs
        const behPacks = path.join(worldDir, 'world_behavior_packs.json');
        if (fs.existsSync(behPacks)) {
            try {
                const packs = JSON.parse(fs.readFileSync(behPacks, 'utf8'));
                activeInfo.activeBehaviorPacks = packs.map(p => p.pack_id);
            } catch { }
        }

        return activeInfo;
    }

    // Get pack UUID from manifest
    getPackUUID(packName, packType) {
        const packDir = packType.includes('Resource') ? 'resource_packs' : 'behavior_packs';
        const manifestPath = path.join(this.serverDir, packDir, packName, 'manifest.json');
        if (fs.existsSync(manifestPath)) {
            try {
                const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                return manifest.header?.uuid || null;
            } catch { }
        }
        return null;
    }

    // Scan for existing non-vanilla addons
    scanExistingAddons() {
        const vanillaPrefixes = ['vanilla', 'chemistry', 'editor', 'experimental', 'server_'];
        const addons = [];

        // Scan behavior_packs
        const behaviorDir = path.join(this.serverDir, 'behavior_packs');
        if (fs.existsSync(behaviorDir)) {
            fs.readdirSync(behaviorDir).forEach(dir => {
                const isVanilla = vanillaPrefixes.some(prefix => dir.startsWith(prefix)) || dir === 'bp0';
                if (!isVanilla && fs.statSync(path.join(behaviorDir, dir)).isDirectory()) {
                    addons.push({ name: dir, type: 'Behavior Pack', path: 'behavior_packs/' + dir });
                }
            });
        }

        // Scan resource_packs
        const resourceDir = path.join(this.serverDir, 'resource_packs');
        if (fs.existsSync(resourceDir)) {
            fs.readdirSync(resourceDir).forEach(dir => {
                const isVanilla = vanillaPrefixes.some(prefix => dir.startsWith(prefix)) || dir === 'rp0';
                if (!isVanilla && fs.statSync(path.join(resourceDir, dir)).isDirectory()) {
                    addons.push({ name: dir, type: 'Resource Pack', path: 'resource_packs/' + dir });
                }
            });
        }

        // Scan worlds folder
        const worldsDir = path.join(this.serverDir, 'worlds');
        if (fs.existsSync(worldsDir)) {
            fs.readdirSync(worldsDir).forEach(dir => {
                if (fs.statSync(path.join(worldsDir, dir)).isDirectory()) {
                    addons.push({ name: dir, type: 'World', path: 'worlds/' + dir });
                }
            });
        }

        // Save to file
        const addonsFile = path.join(this.serverDir, 'installed_addons.json');
        fs.writeFileSync(addonsFile, JSON.stringify(addons, null, 2));

        return addons;
    }

    registerAddon(addon) {
        const addonsFile = path.join(this.serverDir, 'installed_addons.json');
        let addons = this.listAddons();
        addons.push(addon);
        fs.writeFileSync(addonsFile, JSON.stringify(addons, null, 2));
    }

    unregisterAddon(addonPath) {
        const addonsFile = path.join(this.serverDir, 'installed_addons.json');
        let addons = this.listAddons();
        addons = addons.filter(a => a.path !== addonPath);
        fs.writeFileSync(addonsFile, JSON.stringify(addons, null, 2));
    }

    deleteAddon(addonPath) {
        const fullPath = path.join(this.serverDir, addonPath);
        if (fs.existsSync(fullPath)) {
            fs.rmSync(fullPath, { recursive: true, force: true });
            this.unregisterAddon(addonPath);
            return true;
        }
        return false;
    }

    // Apply pack to current world
    applyPackToWorld(packName, packType) {
        // Get current world name from server.properties
        const props = this.readProperties();
        const levelName = props['level-name'] || 'Bedrock level';

        // Find pack's UUID from manifest.json
        const packDir = packType.includes('Resource') ? 'resource_packs' : 'behavior_packs';
        const manifestPath = path.join(this.serverDir, packDir, packName, 'manifest.json');

        if (!fs.existsSync(manifestPath)) {
            return { success: false, error: 'Manifest tidak ditemukan' };
        }

        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const uuid = manifest.header?.uuid;
        const version = manifest.header?.version || [1, 0, 0];

        if (!uuid) {
            return { success: false, error: 'UUID tidak ditemukan di manifest' };
        }

        // Update world packs file
        const packsFileName = packType.includes('Resource') ? 'world_resource_packs.json' : 'world_behavior_packs.json';
        const worldPacksPath = path.join(this.serverDir, 'worlds', levelName, packsFileName);

        let packs = [];
        if (fs.existsSync(worldPacksPath)) {
            try {
                packs = JSON.parse(fs.readFileSync(worldPacksPath, 'utf8'));
            } catch {
                packs = [];
            }
        }

        // Check if already exists
        if (!packs.some(p => p.pack_id === uuid)) {
            packs.push({
                pack_id: uuid,
                version: version
            });

            // Ensure world directory exists
            const worldDir = path.join(this.serverDir, 'worlds', levelName);
            if (!fs.existsSync(worldDir)) fs.mkdirSync(worldDir, { recursive: true });

            fs.writeFileSync(worldPacksPath, JSON.stringify(packs, null, 2));
        }

        return { success: true, message: `Pack ${packName} ditambahkan ke ${levelName}` };
    }
}

module.exports = ServerManager;
