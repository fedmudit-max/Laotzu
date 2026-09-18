/**
 * optional-log.js — Debug-only logging for expected optional failures (native plugins, SW, etc.).
 */
function isOptionalDebugLoggingEnabled() {
    try {
        if (typeof safeGet === 'function' && safeGet('kingDebugOptional') === '1') return true;
    } catch (e) {}
    try {
        var host = location && location.hostname;
        if (host === 'localhost' || host === '127.0.0.1') return true;
    } catch (e) {}
    return false;
}

function logOptionalFailure(area, err, detail) {
    if (!isOptionalDebugLoggingEnabled()) return;
    var label = '[King optional' + (area ? ':' + area : '') + ']';
    if (detail) label += ' ' + detail;
    if (err !== undefined && err !== null) {
        console.warn(label, err);
    } else {
        console.warn(label);
    }
}
