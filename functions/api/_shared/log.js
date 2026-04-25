/**
 * Structured logging helper with PII stripping
 */

const PII_KEYS = ['email', 'phone', 'signature', 'password', 'token', 'access_token', 'refresh_token', 'body', 'payload', 'raw_payload'];

function stripPII(obj) {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;
    
    if (Array.isArray(obj)) {
        return obj.map(stripPII);
    }

    const cleaned = {};
    for (const [key, value] of Object.entries(obj)) {
        const lowerKey = key.toLowerCase();
        if (PII_KEYS.some(pk => lowerKey.includes(pk))) {
            cleaned[key] = '[REDACTED]';
        } else if (typeof value === 'object') {
            cleaned[key] = stripPII(value);
        } else {
            cleaned[key] = value;
        }
    }
    return cleaned;
}

export function logError(scope, err, context = {}) {
    const cleanedContext = stripPII(context);
    
    let errorMsg = err;
    if (err instanceof Error) {
        errorMsg = err.stack || err.message;
    } else if (typeof err === 'object') {
        try {
            errorMsg = JSON.stringify(stripPII(err));
        } catch {
            errorMsg = String(err);
        }
    }
    
    console.error(JSON.stringify({
        level: 'error',
        scope,
        error: errorMsg,
        ...cleanedContext
    }));
}

export function logWarn(scope, msg, context = {}) {
    const cleanedContext = stripPII(context);
    console.warn(JSON.stringify({
        level: 'warn',
        scope,
        message: msg,
        ...cleanedContext
    }));
}

export function logInfo(scope, msg, context = {}) {
    const cleanedContext = stripPII(context);
    console.info(JSON.stringify({
        level: 'info',
        scope,
        message: msg,
        ...cleanedContext
    }));
}
