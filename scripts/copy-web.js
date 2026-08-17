/**
 * Copy the PWA files Capacitor should ship (webDir = www).
 * GitHub Pages still serves the repo root; native apps use www/.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DEST = path.join(ROOT, 'www');

const FILES = [
    'index.html',
    'styles.css',
    'constants.js',
    'data.js',
    'migration.js',
    'logic.js',
    'entitlement.js',
    'billing.js',
    'firebase.js',
    'backup.js',
    'reminder.js',
    'ui-main.js',
    'ui-overlays.js',
    'ui-actions.js',
    'ui-history.js',
    'ui-day.js',
    'boot.js',
    'sw.js',
    'manifest.json',
];

const ASSET_DIR = 'assets';

function copyFile(rel) {
    const from = path.join(ROOT, rel);
    const to = path.join(DEST, rel);
    if (!fs.existsSync(from)) {
        throw new Error('Missing web file: ' + rel);
    }
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
}

fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(DEST, { recursive: true });
FILES.forEach(copyFile);

const assetSrc = path.join(ROOT, ASSET_DIR);
const assetDest = path.join(DEST, ASSET_DIR);
fs.mkdirSync(assetDest, { recursive: true });
fs.readdirSync(assetSrc).forEach(function (name) {
    fs.copyFileSync(path.join(assetSrc, name), path.join(assetDest, name));
});

console.log('Copied web assets → www/');
