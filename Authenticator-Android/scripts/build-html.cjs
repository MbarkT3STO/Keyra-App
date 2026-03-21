#!/usr/bin/env node
/**
 * HTML Include Build Script
 * Processes <!--#include file="..." --> directives in index.src.html
 * and outputs the final index.html to the project root.
 */

const fs = require('fs');
const path = require('path');

const SRC  = path.resolve(__dirname, '../index.src.html');
const OUT  = path.resolve(__dirname, '../index.html');
const BASE = path.resolve(__dirname, '..');

function processIncludes(content, baseDir) {
    return content.replace(/<!--#include file="([^"]+)" -->/g, (match, filePath) => {
        const fullPath = path.resolve(baseDir, filePath);
        if (!fs.existsSync(fullPath)) {
            console.error(`  [ERROR] Partial not found: ${fullPath}`);
            process.exit(1);
        }
        const partial = fs.readFileSync(fullPath, 'utf-8');
        return processIncludes(partial, path.dirname(fullPath));
    });
}

console.log('Building index.html from partials...');

const src    = fs.readFileSync(SRC, 'utf-8');
const output = processIncludes(src, BASE);

fs.writeFileSync(OUT, output, 'utf-8');

const lines = output.split('\n').length;
console.log(`  Done — ${lines} lines written to index.html`);
