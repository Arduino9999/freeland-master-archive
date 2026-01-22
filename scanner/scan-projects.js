#!/usr/bin/env node
/**
 * FREELAND PROJECT SCANNER
 * Scans all drives for Node.js projects and catalogs them
 * Built by Tom & Azura Freeland
 */

const fs = require('fs');
const path = require('path');

// Directories to scan
const SCAN_PATHS = [
    'C:/Users/Tom',
    'C:/Refyrral',
    'D:/azura',
    'D:/projects',
    'D:/dev',
    'D:/code',
    'D:/work',
    'D:/github'
];

// Directories to skip
const SKIP_DIRS = [
    'node_modules',
    '.git',
    '.next',
    '.nuxt',
    'dist',
    'build',
    '.cache',
    'coverage',
    '__pycache__',
    'AppData',
    'Application Data',
    '.vscode',
    '.idea'
];

// Project type detection
function detectProjectType(pkg, files) {
    const types = [];
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    // Cloudflare Worker
    if (deps['wrangler'] || deps['@cloudflare/workers-types'] || files.includes('wrangler.toml')) {
        types.push('cloudflare-worker');
    }

    // Vite
    if (deps['vite']) {
        types.push('vite');
    }

    // React
    if (deps['react'] || deps['react-dom']) {
        types.push('react');
    }

    // Next.js
    if (deps['next']) {
        types.push('nextjs');
    }

    // Vue
    if (deps['vue']) {
        types.push('vue');
    }

    // Nuxt
    if (deps['nuxt']) {
        types.push('nuxt');
    }

    // Express
    if (deps['express']) {
        types.push('express');
    }

    // Hono
    if (deps['hono']) {
        types.push('hono');
    }

    // TypeScript
    if (deps['typescript'] || files.includes('tsconfig.json')) {
        types.push('typescript');
    }

    // Electron
    if (deps['electron']) {
        types.push('electron');
    }

    // Tauri
    if (files.includes('tauri.conf.json')) {
        types.push('tauri');
    }

    // Astro
    if (deps['astro']) {
        types.push('astro');
    }

    // Svelte
    if (deps['svelte']) {
        types.push('svelte');
    }

    // Tailwind
    if (deps['tailwindcss']) {
        types.push('tailwind');
    }

    return types.length > 0 ? types : ['nodejs'];
}

// Get run command for project
function getRunCommand(pkg, types) {
    const scripts = pkg.scripts || {};

    if (types.includes('cloudflare-worker')) {
        if (scripts.dev) return 'npm run dev';
        return 'wrangler dev';
    }

    if (scripts.dev) return 'npm run dev';
    if (scripts.start) return 'npm start';
    if (scripts.serve) return 'npm run serve';

    return 'npm start';
}

// Get build command
function getBuildCommand(pkg, types) {
    const scripts = pkg.scripts || {};

    if (types.includes('cloudflare-worker')) {
        if (scripts.deploy) return 'npm run deploy';
        return 'wrangler deploy';
    }

    if (scripts.build) return 'npm run build';

    return null;
}

// Calculate node_modules size
function getNodeModulesSize(projectPath) {
    const nmPath = path.join(projectPath, 'node_modules');
    if (!fs.existsSync(nmPath)) return 0;

    try {
        let size = 0;
        const items = fs.readdirSync(nmPath);
        // Quick estimate based on folder count
        return items.length * 500000; // Rough estimate: 500KB per package
    } catch {
        return 0;
    }
}

// Scan a directory recursively
function scanDirectory(dir, projects = [], depth = 0) {
    if (depth > 6) return projects; // Max depth

    try {
        if (!fs.existsSync(dir)) return projects;

        const items = fs.readdirSync(dir, { withFileTypes: true });

        // Check for package.json in current directory
        const hasPackageJson = items.some(item => item.name === 'package.json' && item.isFile());

        if (hasPackageJson) {
            try {
                const pkgPath = path.join(dir, 'package.json');
                const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

                // Get list of files in directory
                const files = items.map(i => i.name);

                const types = detectProjectType(pkg, files);
                const nmSize = getNodeModulesSize(dir);

                const project = {
                    name: pkg.name || path.basename(dir),
                    path: dir,
                    version: pkg.version || '0.0.0',
                    description: pkg.description || '',
                    types: types,
                    scripts: Object.keys(pkg.scripts || {}),
                    runCommand: getRunCommand(pkg, types),
                    buildCommand: getBuildCommand(pkg, types),
                    hasNodeModules: fs.existsSync(path.join(dir, 'node_modules')),
                    nodeModulesSize: nmSize,
                    hasWrangler: files.includes('wrangler.toml'),
                    hasGit: files.includes('.git') || fs.existsSync(path.join(dir, '.git')),
                    lastModified: fs.statSync(pkgPath).mtime.toISOString()
                };

                // Try to get wrangler info if exists
                if (project.hasWrangler) {
                    try {
                        const wranglerPath = path.join(dir, 'wrangler.toml');
                        const wranglerContent = fs.readFileSync(wranglerPath, 'utf8');
                        const nameMatch = wranglerContent.match(/name\s*=\s*"([^"]+)"/);
                        if (nameMatch) project.workerName = nameMatch[1];
                    } catch {}
                }

                projects.push(project);

                // Don't recurse into project directories
                return projects;

            } catch (e) {
                // Invalid package.json, continue scanning
            }
        }

        // Recurse into subdirectories
        for (const item of items) {
            if (item.isDirectory() && !SKIP_DIRS.includes(item.name) && !item.name.startsWith('.')) {
                scanDirectory(path.join(dir, item.name), projects, depth + 1);
            }
        }

    } catch (e) {
        // Permission denied or other error, skip
    }

    return projects;
}

// Main execution
console.log('========================================');
console.log('FREELAND PROJECT SCANNER');
console.log('Built by Tom & Azura Freeland');
console.log('========================================\n');

const allProjects = [];

for (const scanPath of SCAN_PATHS) {
    console.log(`Scanning: ${scanPath}...`);
    const before = allProjects.length;
    scanDirectory(scanPath, allProjects);
    console.log(`  Found ${allProjects.length - before} projects`);
}

// Sort by last modified
allProjects.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));

// Calculate totals
const totalSize = allProjects.reduce((sum, p) => sum + p.nodeModulesSize, 0);
const withNodeModules = allProjects.filter(p => p.hasNodeModules).length;

console.log('\n========================================');
console.log(`SCAN COMPLETE`);
console.log(`Total projects found: ${allProjects.length}`);
console.log(`Projects with node_modules: ${withNodeModules}`);
console.log(`Estimated bloat: ${(totalSize / 1024 / 1024 / 1024).toFixed(2)} GB`);
console.log('========================================\n');

// Write results
const outputPath = path.join(__dirname, 'projects.json');
fs.writeFileSync(outputPath, JSON.stringify({
    scanDate: new Date().toISOString(),
    totalProjects: allProjects.length,
    projectsWithNodeModules: withNodeModules,
    estimatedBloatBytes: totalSize,
    projects: allProjects
}, null, 2));

console.log(`Results saved to: ${outputPath}`);

// Also output summary
const summaryPath = path.join(__dirname, 'summary.txt');
let summary = `FREELAND PROJECT ARCHIVE SCAN\n`;
summary += `Scanned: ${new Date().toLocaleString()}\n`;
summary += `Total: ${allProjects.length} projects\n\n`;

for (const p of allProjects) {
    summary += `${p.name} (${p.types.join(', ')})\n`;
    summary += `  Path: ${p.path}\n`;
    summary += `  Run: ${p.runCommand}\n`;
    if (p.hasNodeModules) {
        summary += `  Bloat: ~${(p.nodeModulesSize / 1024 / 1024).toFixed(0)} MB\n`;
    }
    summary += `\n`;
}

fs.writeFileSync(summaryPath, summary);
console.log(`Summary saved to: ${summaryPath}`);
