/**
 * Install the debug APK on the first attached emulator/device and launch King.
 * Prefer ANDROID_SERIAL when more than one device is listed.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const APK = path.join(ROOT, 'android/app/build/outputs/apk/debug/app-debug.apk');
const PKG = 'com.kingtracker.app';
const ACTIVITY = PKG + '/.MainActivity';
const PREFERRED = 'adb-RZCW9196MKZ-J4man8._adb-tls-connect._tcp';

function adbBin() {
    const home = process.env.ANDROID_HOME || path.join(process.env.HOME || '', 'Library/Android/sdk');
    const sdkAdb = path.join(home, 'platform-tools/adb');
    return fs.existsSync(sdkAdb) ? sdkAdb : 'adb';
}

function adb(args, opts) {
    return execFileSync(adbBin(), args, Object.assign({ encoding: 'utf8' }, opts || {}));
}

function listDevices() {
    return adb(['devices'])
        .split('\n')
        .slice(1)
        .map(function (line) { return line.trim(); })
        .filter(function (line) { return /\tdevice$/.test(line); })
        .map(function (line) { return line.split('\t')[0]; });
}

if (!fs.existsSync(APK)) {
    console.error('No debug APK. Run: npm run android:debug');
    process.exit(1);
}

const devices = listDevices();
if (!devices.length) {
    console.error('No Android device. Turn on wireless debugging, then: npm run android:install');
    process.exit(1);
}

const wanted = process.env.ANDROID_SERIAL || '';
let serial = wanted;
if (!serial || devices.indexOf(serial) === -1) {
    if (devices.indexOf(PREFERRED) !== -1) serial = PREFERRED;
    else serial = devices[0];
}

console.log('Installing King on ' + serial);
adb(['-s', serial, 'install', '-r', APK], { stdio: 'inherit' });
adb(['-s', serial, 'shell', 'am', 'force-stop', PKG], { stdio: 'inherit' });
adb(['-s', serial, 'shell', 'am', 'start', '-n', ACTIVITY], { stdio: 'inherit' });
