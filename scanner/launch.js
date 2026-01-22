#!/usr/bin/env node
/**
 * FREELAND UNIVERSAL LAUNCHER
 * Run any project with: node launch.js <project-name>
 * Built by Tom & Azura Freeland
 */

const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

// Load projects from scan
const projectsPath = path.join(__dirname, 'projects.json');

if (!fs.existsSync(projectsPath)) {
    console.log('No projects.json found. Run scan-projects.js first.');
    process.exit(1);
}

const data = JSON.parse(fs.readFileSync(projectsPath, 'utf8'));
const projects = data.projects;

// Parse arguments
const args = process.argv.slice(2);
const command = args[0];
const projectName = args[1];

function showHelp() {
    console.log('========================================');
    console.log('FREELAND UNIVERSAL LAUNCHER');
    console.log('Built by Tom & Azura Freeland');
    console.log('========================================\n');
    console.log('Usage:');
    console.log('  node launch.js list              - List all projects');
    console.log('  node launch.js run <name>        - Run a project (npm run dev)');
    console.log('  node launch.js deploy <name>     - Deploy a project');
    console.log('  node launch.js open <name>       - Open project folder');
    console.log('  node launch.js install <name>    - Install dependencies');
    console.log('  node launch.js info <name>       - Show project info');
    console.log('  node launch.js workers           - List Cloudflare Workers only');
    console.log('  node launch.js react             - List React projects only\n');
}

function listProjects(filter = null) {
    console.log('========================================');
    console.log('FREELAND PROJECTS');
    console.log('========================================\n');

    let filtered = projects;
    if (filter) {
        filtered = projects.filter(p => p.types.includes(filter));
    }

    for (const p of filtered) {
        const tags = p.types.join(', ');
        const status = p.hasNodeModules ? '(ready)' : '(needs npm install)';
        console.log(`${p.name}`);
        console.log(`  Type: ${tags}`);
        console.log(`  Path: ${p.path}`);
        console.log(`  Status: ${status}`);
        console.log('');
    }

    console.log(`Total: ${filtered.length} projects`);
}

function findProject(name) {
    // Exact match first
    let project = projects.find(p => p.name.toLowerCase() === name.toLowerCase());
    if (project) return project;

    // Partial match
    project = projects.find(p => p.name.toLowerCase().includes(name.toLowerCase()));
    if (project) return project;

    // Worker name match
    project = projects.find(p => p.workerName && p.workerName.toLowerCase().includes(name.toLowerCase()));
    return project;
}

function runProject(name) {
    const project = findProject(name);
    if (!project) {
        console.log(`Project "${name}" not found.`);
        console.log('Use "node launch.js list" to see all projects.');
        process.exit(1);
    }

    console.log(`Running: ${project.name}`);
    console.log(`Path: ${project.path}`);
    console.log(`Command: ${project.runCommand}\n`);

    // Check if node_modules exists
    const nmPath = path.join(project.path, 'node_modules');
    if (!fs.existsSync(nmPath)) {
        console.log('node_modules not found. Installing dependencies...\n');
        execSync('npm install', { cwd: project.path, stdio: 'inherit' });
        console.log('');
    }

    // Parse command
    const [cmd, ...cmdArgs] = project.runCommand.split(' ');

    // Spawn the process
    const child = spawn(cmd, cmdArgs, {
        cwd: project.path,
        stdio: 'inherit',
        shell: true
    });

    child.on('error', (err) => {
        console.error('Failed to start:', err.message);
    });
}

function deployProject(name) {
    const project = findProject(name);
    if (!project) {
        console.log(`Project "${name}" not found.`);
        process.exit(1);
    }

    if (!project.buildCommand) {
        console.log(`Project "${project.name}" has no deploy command.`);
        process.exit(1);
    }

    console.log(`Deploying: ${project.name}`);
    console.log(`Path: ${project.path}`);
    console.log(`Command: ${project.buildCommand}\n`);

    const [cmd, ...cmdArgs] = project.buildCommand.split(' ');

    const child = spawn(cmd, cmdArgs, {
        cwd: project.path,
        stdio: 'inherit',
        shell: true
    });

    child.on('error', (err) => {
        console.error('Failed to deploy:', err.message);
    });
}

function openProject(name) {
    const project = findProject(name);
    if (!project) {
        console.log(`Project "${name}" not found.`);
        process.exit(1);
    }

    console.log(`Opening: ${project.path}`);

    if (process.platform === 'win32') {
        execSync(`start "" "${project.path}"`);
    } else if (process.platform === 'darwin') {
        execSync(`open "${project.path}"`);
    } else {
        execSync(`xdg-open "${project.path}"`);
    }
}

function installDeps(name) {
    const project = findProject(name);
    if (!project) {
        console.log(`Project "${name}" not found.`);
        process.exit(1);
    }

    console.log(`Installing dependencies for: ${project.name}`);
    console.log(`Path: ${project.path}\n`);

    execSync('npm install', { cwd: project.path, stdio: 'inherit' });
}

function showInfo(name) {
    const project = findProject(name);
    if (!project) {
        console.log(`Project "${name}" not found.`);
        process.exit(1);
    }

    console.log('========================================');
    console.log(`PROJECT: ${project.name}`);
    console.log('========================================\n');
    console.log(`Description: ${project.description || 'N/A'}`);
    console.log(`Version: ${project.version}`);
    console.log(`Path: ${project.path}`);
    console.log(`Types: ${project.types.join(', ')}`);
    console.log(`Run Command: ${project.runCommand}`);
    console.log(`Deploy Command: ${project.buildCommand || 'N/A'}`);
    console.log(`Has node_modules: ${project.hasNodeModules}`);
    if (project.nodeModulesSize > 0) {
        console.log(`node_modules size: ${(project.nodeModulesSize / 1024 / 1024).toFixed(0)} MB`);
    }
    if (project.workerName) {
        console.log(`Worker Name: ${project.workerName}`);
    }
    console.log(`Last Modified: ${project.lastModified}`);
}

// Main
if (!command || command === 'help' || command === '-h' || command === '--help') {
    showHelp();
} else if (command === 'list') {
    listProjects();
} else if (command === 'workers') {
    listProjects('cloudflare-worker');
} else if (command === 'react') {
    listProjects('react');
} else if (command === 'vite') {
    listProjects('vite');
} else if (command === 'run') {
    if (!projectName) {
        console.log('Usage: node launch.js run <project-name>');
        process.exit(1);
    }
    runProject(projectName);
} else if (command === 'deploy') {
    if (!projectName) {
        console.log('Usage: node launch.js deploy <project-name>');
        process.exit(1);
    }
    deployProject(projectName);
} else if (command === 'open') {
    if (!projectName) {
        console.log('Usage: node launch.js open <project-name>');
        process.exit(1);
    }
    openProject(projectName);
} else if (command === 'install') {
    if (!projectName) {
        console.log('Usage: node launch.js install <project-name>');
        process.exit(1);
    }
    installDeps(projectName);
} else if (command === 'info') {
    if (!projectName) {
        console.log('Usage: node launch.js info <project-name>');
        process.exit(1);
    }
    showInfo(projectName);
} else {
    // Assume it's a project name and try to run it
    runProject(command);
}
