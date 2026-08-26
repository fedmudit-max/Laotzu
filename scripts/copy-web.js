/**
 * Publish the PWA that GitHub Pages serves from the repo root into Capacitor's
 * copies: www/ (webDir), then overlay Android/iOS public folders.
 *
 * Edit root files only. Do not edit www/ or native assets by hand.
 * Android Gradle preBuild runs this so Studio ▶ Run cannot ship a stale billing.js.
 * Still run `npm run cap:sync` after plugin / capacitor.config.json changes.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WWW = path.join(ROOT, 'www');
const ANDROID_PUBLIC = path.join(ROOT, 'android/app/src/main/assets/public');
const IOS_PUBLIC = path.join(ROOT, 'ios/App/App/public');
const ASSET_DIR = 'assets';

const EXTRA_FILES = ['index.html', 'sw.js'];

function read(rel) {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function localRefs(sourceRel) {
    const text = read(sourceRel);
    const refs = [];
    const re = /(?:src|href)=["']\.\/([^"'?#]+)["']/g;
    let match;
    while ((match = re.exec(text))) {
        refs.push(match[1]);
    }
    return refs;
}

function unique(list) {
    const seen = Object.create(null);
    const out = [];
    list.forEach(function (rel) {
        if (!rel || seen[rel]) return;
        seen[rel] = true;
        out.push(rel);
    });
    return out;
}

function listPwaFiles() {
    const fromHtml = localRefs('index.html');
    const fromManifest = fromHtml.indexOf('manifest.json') === -1 ? [] : localRefs('manifest.json');
    return unique(EXTRA_FILES.concat(fromHtml, fromManifest));
}

function copyFileInto(destRoot, rel) {
    const from = path.join(ROOT, rel);
    const to = path.join(destRoot, rel);
    if (!fs.existsSync(from)) {
        throw new Error('Missing web file: ' + rel);
    }
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
}

function copyAssetDirInto(destRoot) {
    const assetSrc = path.join(ROOT, ASSET_DIR);
    const assetDest = path.join(destRoot, ASSET_DIR);
    fs.mkdirSync(assetDest, { recursive: true });
    fs.readdirSync(assetSrc).forEach(function (name) {
        fs.copyFileSync(path.join(assetSrc, name), path.join(assetDest, name));
    });
}

function publishPwa(destRoot, wipe) {
    if (wipe) {
        fs.rmSync(destRoot, { recursive: true, force: true });
    }
    fs.mkdirSync(destRoot, { recursive: true });
    listPwaFiles().forEach(function (rel) {
        copyFileInto(destRoot, rel);
    });
    copyAssetDirInto(destRoot);
}

function assertSameBytes(rel, destRoot) {
    const a = fs.readFileSync(path.join(ROOT, rel));
    const b = fs.readFileSync(path.join(destRoot, rel));
    if (!a.equals(b)) {
        throw new Error('Web copy drifted: ' + rel + ' (' + destRoot + ')');
    }
}

const files = listPwaFiles();
publishPwa(WWW, true);

const nativePublic = [];
if (fs.existsSync(path.dirname(ANDROID_PUBLIC))) nativePublic.push(ANDROID_PUBLIC);
if (fs.existsSync(path.dirname(IOS_PUBLIC))) nativePublic.push(IOS_PUBLIC);
nativePublic.forEach(function (dest) {
    publishPwa(dest, false);
});

files.forEach(function (rel) {
    assertSameBytes(rel, WWW);
    nativePublic.forEach(function (dest) {
        assertSameBytes(rel, dest);
    });
});

console.log('Copied ' + files.length + ' web files → www/' + (nativePublic.length ? ' + native public' : ''));
