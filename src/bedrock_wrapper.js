const { spawn } = require('child_process');
const path = require('path');
const EventEmitter = require('events');

class BedrockWrapper extends EventEmitter {
    constructor(serverDir) {
        super();
        this.serverDir = serverDir;
        this.executable = 'bedrock_server.exe';
        this.process = null;
        this.status = 'Offline'; // Offline, Starting, Online, Stopping
    }

    start() {
        if (this.process) return;

        this.status = 'Starting';
        this.emit('status', this.status);

        console.log(`Starting server in ${this.serverDir}`);

        try {
            this.process = spawn(this.executable, [], {
                cwd: this.serverDir,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            this.process.stdout.on('data', (data) => {
                const str = data.toString();
                this.emit('console', str);
                if (str.includes('Server started')) {
                    this.status = 'Online';
                    this.emit('status', this.status);
                }
            });

            this.process.stderr.on('data', (data) => {
                this.emit('console', `ERROR: ${data.toString()}`);
            });

            this.process.on('close', (code) => {
                console.log(`Server exited with code ${code}`);
                this.process = null;
                this.status = 'Offline';
                this.emit('status', this.status);
            });

            this.process.on('error', (err) => {
                console.error('Failed to start server process:', err);
                this.emit('console', `SYSTEM ERROR: ${err.message}`);
                this.status = 'Offline';
                this.emit('status', this.status);
                this.process = null;
            });

        } catch (e) {
            console.error(e);
            this.emit('console', `SYSTEM ERROR: ${e.message}`);
            this.status = 'Offline';
            this.emit('status', this.status);
        }
    }

    stop() {
        if (!this.process) return;
        if (this.status === 'Offline') return;

        this.status = 'Stopping';
        this.emit('status', this.status);
        this.write('stop');
    }

    write(command) {
        if (this.process && this.process.stdin) {
            this.process.stdin.write(command + '\n');
        }
    }

    restart() {
        if (this.process) {
            // Listen for close event to restart
            this.process.once('close', () => {
                this.start();
            });
            this.stop();
        } else {
            this.start();
        }
    }

    getStatus() {
        return this.status;
    }
}

module.exports = BedrockWrapper;
