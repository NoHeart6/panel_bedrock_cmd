const socket = io();

// UI Elements
const statusEl = document.getElementById('server-status');
const terminalOutput = document.getElementById('terminal-output');
const terminalInput = document.getElementById('terminal-input');
const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');
const btnRestart = document.getElementById('btn-restart');

// Clear initial placeholder
terminalOutput.innerHTML = '';

// Socket Events
socket.on('status', (status) => {
    const statusText = status.toUpperCase();
    statusEl.innerHTML = `[ ${statusText} ]`;
    statusEl.className = '';

    if (status === 'Online') {
        statusEl.classList.add('status-online');
    } else if (status === 'Offline') {
        statusEl.classList.add('status-offline');
    } else {
        statusEl.style.color = '#228B22';
    }
});

socket.on('console', (msg) => {
    const lines = msg.split('\n');
    lines.forEach(line => {
        if (line.trim()) {
            const div = document.createElement('div');
            div.textContent = line;

            // Color coding
            if (line.includes('ERROR') || line.includes('error')) {
                div.style.color = '#FF3333';
            } else if (line.includes('WARN') || line.includes('warn')) {
                div.style.color = '#228B22';
            } else if (line.includes('INFO')) {
                div.style.color = '#00FF41';
            }

            terminalOutput.appendChild(div);
        }
    });
    terminalOutput.scrollTop = terminalOutput.scrollHeight;
});

// Controls
btnStart.addEventListener('click', () => {
    appendToTerminal('> MENGINISIASI PROTOKOL SERVER...', '#00FF41');
    socket.emit('start_server');
});

btnStop.addEventListener('click', () => {
    appendToTerminal('> MENGHENTIKAN SERVER...', '#FF3333');
    socket.emit('stop_server');
});

btnRestart.addEventListener('click', () => {
    appendToTerminal('> MEMULAI ULANG SERVER...', '#228B22');
    socket.emit('restart_server');
});

terminalInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const cmd = terminalInput.value;
        if (cmd.trim()) {
            appendToTerminal(`> ${cmd}`, '#000');
            socket.emit('command', cmd);
            terminalInput.value = '';
        }
    }
});

function appendToTerminal(text, color = '#00FF41') {
    const div = document.createElement('div');
    div.textContent = text;
    div.style.color = color;
    terminalOutput.appendChild(div);
    terminalOutput.scrollTop = terminalOutput.scrollHeight;
}

// Navigation
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

        btn.classList.add('active');
        const target = btn.dataset.target;
        document.getElementById(target).classList.add('active');

        if (target === 'settings') loadConfig();
        if (target === 'backups') loadBackups();
        if (target === 'addons') loadAddons();
    });
});

// Addons Logic
const dropzone = document.getElementById('addon-dropzone');
const fileInput = document.getElementById('addon-file-input');
const uploadStatus = document.getElementById('upload-status');

dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
});

dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
});

dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length) uploadAddon(files[0]);
});

fileInput.addEventListener('change', () => {
    if (fileInput.files.length) uploadAddon(fileInput.files[0]);
});

async function uploadAddon(file) {
    uploadStatus.innerText = '// UPLOADING...';
    uploadStatus.className = '';

    const formData = new FormData();
    formData.append('file', file);

    try {
        const res = await fetch('/api/upload/addon', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();

        if (data.success) {
            uploadStatus.innerText = `// SUCCESS: ${data.name} TERINSTALL SEBAGAI ${data.type}`;
            uploadStatus.classList.add('success');
            loadAddons(); // Refresh list
        } else {
            uploadStatus.innerText = `// ERROR: ${data.error}`;
            uploadStatus.classList.add('error');
        }
    } catch (e) {
        uploadStatus.innerText = `// ERROR: ${e.message}`;
        uploadStatus.classList.add('error');
    }
}

// Load and display installed addons
async function loadAddons() {
    try {
        // Fetch addons and active status
        const [addonsRes, activeRes] = await Promise.all([
            fetch('/api/addons'),
            fetch('/api/addons/active')
        ]);
        const addons = await addonsRes.json();
        const activeInfo = await activeRes.json();

        const list = document.getElementById('addon-list');

        // Keep header
        const header = list.querySelector('.table-header');
        list.innerHTML = '';
        list.appendChild(header);

        if (addons.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.textContent = '// TIDAK ADA ADDON TERINSTALL //';
            list.appendChild(empty);
            return;
        }

        addons.forEach(addon => {
            const div = document.createElement('div');
            div.className = 'table-item';

            // Check if addon is active
            let isActive = false;
            const addonWithUUID = activeInfo.addonsWithUUID?.find(a => a.name === addon.name);
            const uuid = addonWithUUID?.uuid;

            if (addon.type === 'World' || addon.type === 'World Template') {
                isActive = addon.name === activeInfo.activeWorld;
            } else if (addon.type === 'Resource Pack' && uuid) {
                isActive = activeInfo.activeResourcePacks?.includes(uuid);
            } else if (addon.type === 'Behavior Pack' && uuid) {
                isActive = activeInfo.activeBehaviorPacks?.includes(uuid);
            }

            // Build name with badge
            const nameBadge = isActive ?
                `${addon.name} <span class="badge-active">AKTIF</span>` :
                addon.name;

            let actionButtons = `<button onclick="deleteAddon('${addon.path}')" class="btn btn-danger">[ HAPUS ]</button>`;
            if (addon.type === 'World' || addon.type === 'World Template') {
                if (!isActive) {
                    actionButtons = `<button onclick="applyWorld('${addon.name}')" class="btn btn-primary">[ TERAPKAN ]</button> ` + actionButtons;
                }
            }
            if (addon.type === 'Resource Pack' || addon.type === 'Behavior Pack') {
                if (!isActive) {
                    actionButtons = `<button onclick="applyPack('${addon.name}', '${addon.type}')" class="btn btn-primary">[ TERAPKAN ]</button> ` + actionButtons;
                }
            }

            div.innerHTML = `
                <span style="flex:2">${nameBadge}</span>
                <span style="flex:1">${addon.type}</span>
                <span style="flex:1" class="actions">
                    ${actionButtons}
                </span>
            `;
            list.appendChild(div);
        });
    } catch (e) {
        console.error('Failed to load addons:', e);
    }
}

// Delete addon
window.deleteAddon = async (addonPath) => {
    if (confirm(`HAPUS ${addonPath}?`)) {
        const res = await fetch(`/api/addons/${addonPath}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            loadAddons();
            showNotification('ADDON DIHAPUS');
        } else {
            showNotification('GAGAL MENGHAPUS ADDON');
        }
    }
};

// Scan existing addons
async function scanAddons() {
    showNotification('SCANNING ADDON...');
    const res = await fetch('/api/addons/scan', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
        loadAddons();
        showNotification(`DITEMUKAN ${data.count} ADDON`);
    } else {
        showNotification('GAGAL SCAN ADDON');
    }
}

// Apply world - set as active world
async function applyWorld(worldName) {
    if (confirm(`TERAPKAN WORLD "${worldName}"?\nServer perlu di-restart.`)) {
        const res = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 'level-name': worldName })
        });
        if (res.ok) {
            showNotification(`WORLD "${worldName}" DITERAPKAN. RESTART SERVER!`);
        } else {
            showNotification('GAGAL MENERAPKAN WORLD');
        }
    }
}

// Apply pack to current world
async function applyPack(packName, packType) {
    if (confirm(`TERAPKAN "${packName}" ke dunia aktif?\nServer perlu di-restart.`)) {
        const res = await fetch('/api/packs/apply', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ packName, packType })
        });
        const data = await res.json();
        if (data.success) {
            showNotification(`PACK "${packName}" DITERAPKAN. RESTART SERVER!`);
        } else {
            showNotification(data.error || 'GAGAL MENERAPKAN PACK');
        }
    }
}

// Settings Logic - Indonesian with Tooltips
const settingsConfig = {
    'server-name': {
        label: 'NAMA SERVER',
        info: 'Nama server yang akan ditampilkan di daftar server Minecraft.',
        type: 'text'
    },
    'gamemode': {
        label: 'MODE PERMAINAN',
        info: 'Mode permainan default. survival, creative, adventure, spectator.',
        type: 'select',
        options: ['survival', 'creative', 'adventure', 'spectator']
    },
    'difficulty': {
        label: 'TINGKAT KESULITAN',
        info: 'peaceful=damai, easy=mudah, normal=sedang, hard=sulit.',
        type: 'select',
        options: ['peaceful', 'easy', 'normal', 'hard']
    },
    'max-players': {
        label: 'MAKSIMAL PEMAIN',
        info: 'Jumlah maksimal pemain bersamaan.',
        type: 'number'
    },
    'server-port': {
        label: 'PORT SERVER',
        info: 'Port koneksi. Default: 19132.',
        type: 'number'
    },
    'server-portv6': {
        label: 'PORT SERVER IPV6',
        info: 'Port untuk koneksi IPv6. Default: 19133.',
        type: 'number'
    },
    'level-name': {
        label: 'NAMA DUNIA',
        info: 'Nama folder dunia di folder worlds/.',
        type: 'text'
    },
    'level-seed': {
        label: 'SEED DUNIA',
        info: 'Seed untuk generate dunia baru. Kosongkan untuk random.',
        type: 'text'
    },
    'online-mode': {
        label: 'MODE ONLINE',
        info: 'true=hanya akun Xbox resmi, false=akun crack bisa masuk.',
        type: 'select',
        options: ['true', 'false']
    },
    'allow-cheats': {
        label: 'IZINKAN CHEAT',
        info: 'Mengizinkan command cheat seperti /give, /tp.',
        type: 'select',
        options: ['true', 'false']
    },
    'force-gamemode': {
        label: 'PAKSA GAMEMODE',
        info: 'Pemain selalu spawn dengan gamemode default.',
        type: 'select',
        options: ['true', 'false']
    },
    'allow-list': {
        label: 'WHITELIST AKTIF',
        info: 'Hanya pemain di allowlist.json yang bisa masuk.',
        type: 'select',
        options: ['true', 'false']
    },
    'view-distance': {
        label: 'JARAK PANDANG',
        info: 'Jarak render dalam chunk. Tinggi = berat.',
        type: 'number'
    },
    'tick-distance': {
        label: 'JARAK TICK',
        info: 'Jarak simulasi dunia dalam chunk.',
        type: 'number'
    },
    'player-idle-timeout': {
        label: 'TIMEOUT AFK (MENIT)',
        info: 'Kick pemain AFK setelah X menit. 0=tidak ada.',
        type: 'number'
    },
    'max-threads': {
        label: 'MAKSIMAL THREAD',
        info: 'Jumlah thread CPU untuk server.',
        type: 'number'
    },
    'texturepack-required': {
        label: 'WAJIB RESOURCE PACK',
        info: 'Pemain harus download resource pack server.',
        type: 'select',
        options: ['true', 'false']
    },
    'enable-lan-visibility': {
        label: 'VISIBILITAS LAN',
        info: 'Server muncul di daftar LAN lokal.',
        type: 'select',
        options: ['true', 'false']
    },
    'compression-threshold': {
        label: 'BATAS KOMPRESI',
        info: 'Ukuran paket minimum untuk dikompresi (bytes).',
        type: 'number'
    },
    'compression-algorithm': {
        label: 'ALGORITMA KOMPRESI',
        info: 'Metode kompresi data paket.',
        type: 'select',
        options: ['zlib', 'snappy']
    },
    'server-authoritative-movement-strict': {
        label: 'ANTI-CHEAT GERAKAN',
        info: 'Server mengontrol gerakan pemain (anti-cheat).',
        type: 'select',
        options: ['true', 'false']
    },
    'chat-restriction': {
        label: 'BATASAN CHAT',
        info: 'None=bebas, Dropped=chat dibuang, Disabled=chat mati.',
        type: 'select',
        options: ['None', 'Dropped', 'Disabled']
    },
    'disable-player-interaction': {
        label: 'NONAKTIFKAN INTERAKSI',
        info: 'Matikan interaksi antar pemain.',
        type: 'select',
        options: ['true', 'false']
    },
    'client-side-chunk-generation-enabled': {
        label: 'GENERATE CHUNK CLIENT',
        info: 'Client membantu generate chunk (hemat server).',
        type: 'select',
        options: ['true', 'false']
    },
    'disable-persona': {
        label: 'NONAKTIFKAN PERSONA',
        info: 'Matikan fitur persona/avatar kustom.',
        type: 'select',
        options: ['true', 'false']
    },
    'disable-custom-skins': {
        label: 'NONAKTIFKAN SKIN KUSTOM',
        info: 'Matikan skin kustom pemain.',
        type: 'select',
        options: ['true', 'false']
    },
    'content-log-file-enabled': {
        label: 'LOG FILE KONTEN',
        info: 'Simpan log konten ke file.',
        type: 'select',
        options: ['true', 'false']
    }
};

async function loadConfig() {
    const res = await fetch('/api/config');
    const config = await res.json();
    const form = document.getElementById('config-form');
    form.innerHTML = '';

    // Update port display
    if (config['server-port']) {
        document.getElementById('server-port-display').textContent = config['server-port'];
    }

    for (const [key, setting] of Object.entries(settingsConfig)) {
        const value = config[key] || '';
        const div = document.createElement('div');
        div.className = 'setting-item';

        let inputHtml;
        if (setting.type === 'select') {
            const options = setting.options.map(opt =>
                `<option value="${opt}" ${value === opt ? 'selected' : ''}>${opt.toUpperCase()}</option>`
            ).join('');
            inputHtml = `<select name="${key}">${options}</select>`;
        } else {
            inputHtml = `<input type="${setting.type}" name="${key}" value="${value}">`;
        }

        div.innerHTML = `
            <div class="setting-header">
                <label>${setting.label}</label>
                <span class="tooltip-icon">i
                <span class="tooltip-text">${setting.info}</span>
                </span>
            </div>
            ${inputHtml}
        `;
        form.appendChild(div);
    }

    // Load public IP
    loadServerInfo();

    // Load worlds for selector
    loadWorldsForSelector(config['level-name']);
}

async function loadServerInfo() {
    // Load saved Playit address
    loadPlayitAddress();
}

function loadPlayitAddress() {
    const saved = localStorage.getItem('playit-address');
    if (saved) {
        document.getElementById('playit-address').value = saved;
        document.getElementById('playit-display').textContent = saved;
    }
}

function savePlayitAddress() {
    const address = document.getElementById('playit-address').value.trim();
    if (address) {
        localStorage.setItem('playit-address', address);
        document.getElementById('playit-display').textContent = address;
        showNotification('ALAMAT PLAYIT TERSIMPAN!');
    } else {
        showNotification('MASUKKAN ALAMAT PLAYIT TERLEBIH DAHULU');
    }
}

function copyToClipboard(elementId) {
    const text = document.getElementById(elementId).textContent;
    navigator.clipboard.writeText(text).then(() => {
        showNotification('TERSALIN KE CLIPBOARD!');
    });
}

document.getElementById('btn-save-config').addEventListener('click', async () => {
    const form = document.getElementById('config-form');
    const inputs = form.querySelectorAll('input, select');
    const data = {};
    inputs.forEach(input => {
        data[input.name] = input.value;
    });

    await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });

    showNotification('KONFIGURASI TERSIMPAN! RESTART SERVER UNTUK MENERAPKAN.');
});

// Backups Logic
async function loadBackups() {
    const res = await fetch('/api/backups');
    const backups = await res.json();
    const list = document.getElementById('backup-list');

    // Keep header, remove old items
    const header = list.querySelector('.table-header');
    list.innerHTML = '';
    list.appendChild(header);

    if (backups.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.textContent = '// TIDAK ADA BACKUP //';
        list.appendChild(empty);
        return;
    }

    backups.forEach(backup => {
        const div = document.createElement('div');
        div.className = 'table-item';
        div.innerHTML = `
            <span style="flex:2">${backup.name}</span>
            <span style="flex:1">${backup.size}</span>
            <span style="flex:1" class="actions">
                <a href="/api/backups/${backup.name}/download" class="btn">[ UNDUH ]</a>
                <button onclick="deleteBackup('${backup.name}')" class="btn btn-danger">[ X ]</button>
            </span>
        `;
        list.appendChild(div);
    });
}

document.getElementById('btn-create-backup').addEventListener('click', async () => {
    showNotification('MEMBUAT BACKUP...');

    const res = await fetch('/api/backups', { method: 'POST' });
    const data = await res.json();

    if (data.success) {
        loadBackups();
        showNotification('BACKUP BERHASIL DIBUAT!');
    } else {
        showNotification('ERROR: ' + data.error);
    }
});

window.deleteBackup = async (filename) => {
    if (confirm(`HAPUS ${filename}?`)) {
        await fetch(`/api/backups/${filename}`, { method: 'DELETE' });
        loadBackups();
        showNotification('BACKUP DIHAPUS');
    }
};

// Notification
function showNotification(message) {
    // Remove existing
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();

    const notif = document.createElement('div');
    notif.className = 'notification';
    notif.textContent = `// ${message}`;
    document.body.appendChild(notif);

    setTimeout(() => notif.remove(), 3000);
}

// Initial load
loadBackups();

// Admin Command Functions
function adminCommand(cmd, inputId) {
    const playerName = document.getElementById(inputId).value.trim();
    if (!playerName) {
        showNotification('MASUKKAN NAMA PEMAIN TERLEBIH DAHULU');
        return;
    }
    const command = `${cmd} ${playerName}`;
    appendToTerminal(`> ${command}`, '#000');
    socket.emit('command', command);
    showNotification(`PERINTAH ${cmd.toUpperCase()} DIKIRIM`);
}

function gamemodeCommand() {
    const playerName = document.getElementById('player-name-input').value.trim();
    const mode = document.getElementById('gamemode-select').value;
    if (!playerName) {
        showNotification('MASUKKAN NAMA PEMAIN TERLEBIH DAHULU');
        return;
    }
    const command = `gamemode ${mode} ${playerName}`;
    appendToTerminal(`> ${command}`, '#000');
    socket.emit('command', command);
    showNotification(`GAMEMODE ${mode.toUpperCase()} DITERAPKAN`);
}

function timeCommand() {
    const time = document.getElementById('time-select').value;
    const command = `time set ${time}`;
    appendToTerminal(`> ${command}`, '#000');
    socket.emit('command', command);
    showNotification(`WAKTU DIUBAH KE ${time.toUpperCase()}`);
}

function quickCommand(cmd) {
    appendToTerminal(`> ${cmd}`, '#000');
    socket.emit('command', cmd);
    showNotification('PERINTAH DIKIRIM');
}

function weatherCommand() {
    const weather = document.getElementById('weather-select').value;
    const command = `weather ${weather}`;
    appendToTerminal(`> ${command}`, '#000');
    socket.emit('command', command);
    showNotification(`CUACA DIUBAH KE ${weather.toUpperCase()}`);
}

function difficultyCommand() {
    const diff = document.getElementById('difficulty-select').value;
    const command = `difficulty ${diff}`;
    appendToTerminal(`> ${command}`, '#000');
    socket.emit('command', command);
    showNotification(`KESULITAN DIUBAH KE ${diff.toUpperCase()}`);
}

function teleportCommand() {
    const target = document.getElementById('tp-target').value.trim();
    const x = document.getElementById('tp-x').value.trim();
    const y = document.getElementById('tp-y').value.trim();
    const z = document.getElementById('tp-z').value.trim();

    if (!target) {
        showNotification('MASUKKAN NAMA PEMAIN TARGET');
        return;
    }

    let command;
    if (x && y && z) {
        command = `tp ${target} ${x} ${y} ${z}`;
    } else {
        showNotification('MASUKKAN KOORDINAT X Y Z');
        return;
    }

    appendToTerminal(`> ${command}`, '#000');
    socket.emit('command', command);
    showNotification('TELEPORT DIKIRIM');
}

function giveCommand() {
    const player = document.getElementById('give-player').value.trim();
    const item = document.getElementById('give-item').value.trim();
    const amount = document.getElementById('give-amount').value || 1;

    if (!player || !item) {
        showNotification('MASUKKAN NAMA PEMAIN DAN ID ITEM');
        return;
    }

    const command = `give ${player} ${item} ${amount}`;
    appendToTerminal(`> ${command}`, '#000');
    socket.emit('command', command);
    showNotification(`${item.toUpperCase()} x${amount} DIBERIKAN KE ${player.toUpperCase()}`);
}

function broadcastPrompt() {
    const message = prompt('Masukkan pesan broadcast:');
    if (message) {
        const command = `say ${message}`;
        appendToTerminal(`> ${command}`, '#000');
        socket.emit('command', command);
        showNotification('BROADCAST DIKIRIM');
    }
}

// System Stats Polling
async function updateStats() {
    try {
        const res = await fetch('/api/stats');
        const stats = await res.json();
        document.getElementById('cpu-usage').textContent = `${stats.cpu}%`;
        document.getElementById('ram-usage').textContent = `${stats.ram} MB`;
    } catch (e) {
        // ignore
    }
}

// Poll stats every 2 seconds
setInterval(updateStats, 2000);
updateStats();

// World Selector - add to settings
async function loadWorlds() {
    try {
        const res = await fetch('/api/worlds');
        const worlds = await res.json();
        return worlds;
    } catch (e) {
        return [];
    }
}

async function loadWorldsForSelector(currentWorld) {
    const worlds = await loadWorlds();
    const select = document.getElementById('world-select');
    select.innerHTML = '';

    if (worlds.length === 0) {
        select.innerHTML = '<option value="">Tidak ada dunia ditemukan</option>';
        return;
    }

    worlds.forEach(world => {
        const option = document.createElement('option');
        option.value = world;
        option.textContent = world.toUpperCase();
        if (world === currentWorld) {
            option.selected = true;
        }
        select.appendChild(option);
    });
}

async function applyWorldSelection() {
    const select = document.getElementById('world-select');
    const worldName = select.value;

    if (!worldName) {
        showNotification('PILIH DUNIA TERLEBIH DAHULU');
        return;
    }

    // Update level-name in config
    await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 'level-name': worldName })
    });

    showNotification(`DUNIA ${worldName.toUpperCase()} DIPILIH. RESTART SERVER.`);
}


