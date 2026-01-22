#!/usr/bin/env node
/**
 * FREELAND BLOAT CLEANER
 * Removes node_modules from all projects to free up disk space
 * Built by Tom & Azura Freeland
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Load projects from scan
const projectsPath = path.join(__dirname, 'projects.json');

if (!fs.existsSync(projectsPath)) {
    console.log('No projects.json found. Run scan-projects.js first.');
    process.exit(1);
}

const data = JSON.parse(fs.readFileSync(projectsPath, 'utf8'));
const projects = data.projects.filter(p => p.hasNodeModules);

console.log('========================================');
console.log('FREELAND BLOAT CLEANER');
console.log('Built by Tom & Azura Freeland');
console.log('========================================\n');

console.log(`Found ${projects.length} projects with node_modules`);
console.log(`Estimated space to free: ${(data.estimatedBloatBytes / 1024 / 1024 / 1024).toFixed(2)} GB\n`);

// Check for --dry-run flag
const dryRun = process.argv.includes('--dry-run');
const forceClean = process.argv.includes('--force');

if (dryRun) {
    console.log('DRY RUN MODE - No files will be deleted\n');
}

if (!forceClean && !dryRun) {
    console.log('WARNING: This will delete all node_modules folders!');
    console.log('Use --dry-run to see what would be deleted');
    console.log('Use --force to actually delete the folders\n');
    process.exit(0);
}

let totalFreed = 0;
let successCount = 0;
let failCount = 0;

for (const project of projects) {
    const nmPath = path.join(project.path, 'node_modules');

    if (!fs.existsSync(nmPath)) {
        console.log(`[SKIP] ${project.name} - no node_modules found`);
        continue;
    }

    const sizeMB = (project.nodeModulesSize / 1024 / 1024).toFixed(0);

    if (dryRun) {
        console.log(`[DRY] Would delete: ${nmPath} (~${sizeMB} MB)`);
        totalFreed += project.nodeModulesSize;
        successCount++;
    } else {
        try {
            console.log(`[DELETE] ${project.name} (~${sizeMB} MB)...`);

            // Use rmdir on Windows
            if (process.platform === 'win32') {
                execSync(`rmdir /s /q "${nmPath}"`, { stdio: 'ignore' });
            } else {
                execSync(`rm -rf "${nmPath}"`, { stdio: 'ignore' });
            }

            totalFreed += project.nodeModulesSize;
            successCount++;
            console.log(`  -> Deleted successfully`);
        } catch (e) {
            console.log(`  -> FAILED: ${e.message}`);
            failCount++;
        }
    }
}

console.log('\n========================================');
console.log('CLEANUP COMPLETE');
console.log(`Successfully cleaned: ${successCount} projects`);
if (failCount > 0) {
    console.log(`Failed: ${failCount} projects`);
}
console.log(`Space freed: ${(totalFreed / 1024 / 1024 / 1024).toFixed(2)} GB`);
console.log('========================================\n');

if (!dryRun) {
    // Update projects.json to reflect changes
    data.projects = data.projects.map(p => {
        if (p.hasNodeModules) {
            const nmPath = path.join(p.path, 'node_modules');
            if (!fs.existsSync(nmPath)) {
                return { ...p, hasNodeModules: false, nodeModulesSize: 0 };
            }
        }
        return p;
    });

    data.projectsWithNodeModules = data.projects.filter(p => p.hasNodeModules).length;
    data.estimatedBloatBytes = data.projects.reduce((sum, p) => sum + p.nodeModulesSize, 0);

    fs.writeFileSync(projectsPath, JSON.stringify(data, null, 2));
    console.log('Updated projects.json');
}

console.log('\nTo reinstall dependencies in a project:');
console.log('  cd <project-path> && npm install');
