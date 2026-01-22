#!/usr/bin/env node
/**
 * FREELAND COMMAND CENTER - Live Server
 * Run projects with real-time terminal output in browser!
 * Built by Tom & Azura Freeland
 *
 * Usage: node server.js
 * Then open: http://localhost:3000
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3456;

// Load projects
const projectsPath = path.join(__dirname, 'scanner', 'projects.json');
let projectsData = { projects: [] };

function loadProjects() {
    if (fs.existsSync(projectsPath)) {
        projectsData = JSON.parse(fs.readFileSync(projectsPath, 'utf8'));
    }
}
loadProjects();

// Track running processes
const runningProcesses = new Map();

// Create HTTP server
const server = http.createServer((req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // API endpoints
    if (req.url === '/api/projects') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(projectsData));
        return;
    }

    if (req.url === '/api/running') {
        const running = [];
        runningProcesses.forEach((proc, id) => {
            running.push({ id, name: proc.name, path: proc.path, pid: proc.pid });
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(running));
        return;
    }

    if (req.url === '/api/rescan' && req.method === 'POST') {
        loadProjects();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, count: projectsData.projects.length }));
        return;
    }

    // Serve static files
    let filePath = req.url === '/' ? '/command-center.html' : req.url;
    filePath = path.join(__dirname, filePath);

    const ext = path.extname(filePath);
    const contentTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.ico': 'image/x-icon'
    };

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404);
                res.end('Not Found');
            } else {
                res.writeHead(500);
                res.end('Server Error');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'text/plain' });
            res.end(content);
        }
    });
});

// Create WebSocket server
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    console.log('Client connected');

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            handleCommand(ws, data);
        } catch (e) {
            ws.send(JSON.stringify({ type: 'error', message: e.message }));
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
    });
});

function handleCommand(ws, data) {
    const { action, projectPath, projectName, command } = data;

    switch (action) {
        case 'run':
            runProject(ws, projectPath, projectName, command || 'npm run dev');
            break;
        case 'deploy':
            runProject(ws, projectPath, projectName, command || 'npm run deploy');
            break;
        case 'install':
            runProject(ws, projectPath, projectName, 'npm install');
            break;
        case 'stop':
            stopProject(ws, projectPath);
            break;
        case 'open':
            openFolder(ws, projectPath);
            break;
        case 'clean':
            cleanProject(ws, projectPath, projectName);
            break;
        default:
            ws.send(JSON.stringify({ type: 'error', message: `Unknown action: ${action}` }));
    }
}

function runProject(ws, projectPath, projectName, command) {
    // Check if already running
    if (runningProcesses.has(projectPath)) {
        ws.send(JSON.stringify({
            type: 'error',
            projectPath,
            message: `${projectName} is already running! Stop it first.`
        }));
        return;
    }

    // Check if node_modules exists
    const nmPath = path.join(projectPath, 'node_modules');
    if (!fs.existsSync(nmPath) && !command.includes('install')) {
        ws.send(JSON.stringify({
            type: 'warning',
            projectPath,
            message: `node_modules not found. Installing dependencies first...`
        }));
        // Install first, then run
        runProject(ws, projectPath, projectName, 'npm install');
        return;
    }

    ws.send(JSON.stringify({
        type: 'start',
        projectPath,
        projectName,
        command,
        message: `Starting ${projectName}...`
    }));

    // Parse command
    const isWindows = process.platform === 'win32';
    const shell = isWindows ? 'cmd.exe' : '/bin/sh';
    const shellFlag = isWindows ? '/c' : '-c';

    const child = spawn(shell, [shellFlag, command], {
        cwd: projectPath,
        env: { ...process.env, FORCE_COLOR: '1' }
    });

    // Store process info
    runningProcesses.set(projectPath, {
        name: projectName,
        path: projectPath,
        pid: child.pid,
        process: child
    });

    // Broadcast to all clients that a process started
    broadcastStatus();

    child.stdout.on('data', (data) => {
        ws.send(JSON.stringify({
            type: 'stdout',
            projectPath,
            data: data.toString()
        }));
    });

    child.stderr.on('data', (data) => {
        ws.send(JSON.stringify({
            type: 'stderr',
            projectPath,
            data: data.toString()
        }));
    });

    child.on('error', (err) => {
        ws.send(JSON.stringify({
            type: 'error',
            projectPath,
            message: err.message
        }));
        runningProcesses.delete(projectPath);
        broadcastStatus();
    });

    child.on('close', (code) => {
        ws.send(JSON.stringify({
            type: 'exit',
            projectPath,
            code,
            message: code === 0 ? 'Process completed successfully' : `Process exited with code ${code}`
        }));
        runningProcesses.delete(projectPath);
        broadcastStatus();
    });
}

function stopProject(ws, projectPath) {
    const proc = runningProcesses.get(projectPath);
    if (!proc) {
        ws.send(JSON.stringify({
            type: 'error',
            projectPath,
            message: 'Process not found or already stopped'
        }));
        return;
    }

    ws.send(JSON.stringify({
        type: 'info',
        projectPath,
        message: `Stopping ${proc.name}...`
    }));

    // Kill the process tree on Windows
    if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', proc.pid, '/f', '/t']);
    } else {
        proc.process.kill('SIGTERM');
    }

    runningProcesses.delete(projectPath);
    broadcastStatus();

    ws.send(JSON.stringify({
        type: 'stopped',
        projectPath,
        message: `${proc.name} stopped`
    }));
}

function openFolder(ws, projectPath) {
    const cmd = process.platform === 'win32' ? 'explorer' :
                process.platform === 'darwin' ? 'open' : 'xdg-open';

    spawn(cmd, [projectPath], { detached: true });

    ws.send(JSON.stringify({
        type: 'info',
        projectPath,
        message: `Opened folder: ${projectPath}`
    }));
}

function cleanProject(ws, projectPath, projectName) {
    const nmPath = path.join(projectPath, 'node_modules');

    if (!fs.existsSync(nmPath)) {
        ws.send(JSON.stringify({
            type: 'info',
            projectPath,
            message: `${projectName} has no node_modules to clean`
        }));
        return;
    }

    ws.send(JSON.stringify({
        type: 'info',
        projectPath,
        message: `Cleaning node_modules from ${projectName}...`
    }));

    const isWindows = process.platform === 'win32';
    const cmd = isWindows ? 'rmdir' : 'rm';
    const args = isWindows ? ['/s', '/q', nmPath] : ['-rf', nmPath];

    const child = spawn(cmd, args, { shell: true });

    child.on('close', (code) => {
        if (code === 0) {
            ws.send(JSON.stringify({
                type: 'success',
                projectPath,
                message: `Cleaned node_modules from ${projectName}`
            }));
        } else {
            ws.send(JSON.stringify({
                type: 'error',
                projectPath,
                message: `Failed to clean ${projectName}`
            }));
        }
    });
}

function broadcastStatus() {
    const running = [];
    runningProcesses.forEach((proc, id) => {
        running.push({ id, name: proc.name, path: proc.path, pid: proc.pid });
    });

    const message = JSON.stringify({ type: 'status', running });

    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// Start server
server.listen(PORT, () => {
    console.log('');
    console.log('========================================');
    console.log('FREELAND COMMAND CENTER');
    console.log('Built by Tom & Azura Freeland');
    console.log('========================================');
    console.log('');
    console.log(`Server running at: http://localhost:${PORT}`);
    console.log(`Projects loaded: ${projectsData.projects.length}`);
    console.log('');
    console.log('Open the URL above in your browser!');
    console.log('');
});
