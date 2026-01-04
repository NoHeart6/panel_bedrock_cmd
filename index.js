const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const multer = require('multer');
const BedrockWrapper = require('./src/bedrock_wrapper');
const ServerManager = require('./src/server_manager');

// Startup
console.log('[STARTUP] Bedrock Command Center');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const SERVER_DIR = path.join(__dirname, 'server');
const wrapper = new BedrockWrapper(SERVER_DIR);
const manager = new ServerManager(SERVER_DIR);

app.use(express.static('public'));
app.use(express.json());

// Routes
app.get('/api/config', (req, res) => {
    res.json(manager.readProperties());
});

app.post('/api/config', (req, res) => {
    manager.writeProperties(req.body);
    res.json({ success: true });
});

app.get('/api/backups', (req, res) => {
    res.json(manager.listBackups());
});

app.post('/api/backups', (req, res) => {
    try {
        const backup = manager.createBackup();
        res.json({ success: true, backup });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/backups/:filename', (req, res) => {
    manager.deleteBackup(req.params.filename);
    res.json({ success: true });
});

app.get('/api/backups/:filename/download', (req, res) => {
    const filePath = path.join(manager.backupsDir, req.params.filename);
    res.download(filePath);
});

// Worlds API
app.get('/api/worlds', (req, res) => {
    const fs = require('fs');
    const worldsDir = path.join(SERVER_DIR, 'worlds');
    try {
        if (!fs.existsSync(worldsDir)) {
            return res.json([]);
        }
        const worlds = fs.readdirSync(worldsDir).filter(dir => {
            const stat = fs.statSync(path.join(worldsDir, dir));
            return stat.isDirectory();
        });
        res.json(worlds);
    } catch (e) {
        res.json([]);
    }
});

// System Stats API
app.get('/api/stats', (req, res) => {
    const os = require('os');
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    // Simple CPU usage calculation
    let cpuUsage = 0;
    if (cpus.length > 0) {
        const cpu = cpus[0];
        const total = cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
        cpuUsage = Math.round(((total - cpu.times.idle) / total) * 100);
    }

    res.json({
        cpu: cpuUsage,
        ram: Math.round(usedMem / 1024 / 1024),
        ramTotal: Math.round(totalMem / 1024 / 1024)
    });
});

// File Upload
const upload = multer({ dest: 'uploads/' });

app.post('/api/upload/addon', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
        const result = manager.installAddon(req.file.path, req.file.originalname);
        // Clean up temp file
        const fs = require('fs');
        fs.unlinkSync(req.file.path);

        res.json({ success: true, ...result });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Addons List
app.get('/api/addons', (req, res) => {
    res.json(manager.listAddons());
});

// Get active addons status
app.get('/api/addons/active', (req, res) => {
    const activeInfo = manager.getActiveAddons();
    // Also get UUIDs for installed addons
    const addons = manager.listAddons();
    const addonsWithUUID = addons.map(addon => ({
        ...addon,
        uuid: manager.getPackUUID(addon.name, addon.type)
    }));
    res.json({ ...activeInfo, addonsWithUUID });
});

// Scan for existing addons
app.post('/api/addons/scan', (req, res) => {
    const addons = manager.scanExistingAddons();
    res.json({ success: true, count: addons.length, addons });
});

// Delete Addon
app.delete('/api/addons/:type/:name', (req, res) => {
    const addonPath = `${req.params.type}/${req.params.name}`;
    const result = manager.deleteAddon(addonPath);
    res.json({ success: result });
});

// Apply pack to world
app.post('/api/packs/apply', (req, res) => {
    try {
        const { packName, packType } = req.body;
        const result = manager.applyPackToWorld(packName, packType);
        res.json(result);
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Socket.io
io.on('connection', (socket) => {
    socket.emit('status', wrapper.getStatus());

    // Send recent logs if we had a buffer, but for now just start listening

    socket.on('start_server', () => {
        wrapper.start();
    });

    socket.on('stop_server', () => {
        wrapper.stop();
    });

    socket.on('restart_server', () => {
        wrapper.restart();
    });

    socket.on('command', (cmd) => {
        wrapper.write(cmd);
    });
});

wrapper.on('console', (data) => {
    io.emit('console', data);
});

wrapper.on('status', (status) => {
    io.emit('status', status);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Command Center running on port ${PORT}`);
});
