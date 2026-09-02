import { createHash } from 'node:crypto';

function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
    }
    return value;
}

export function hashTechnicalManifest(manifest) {
    return createHash('sha256').update(JSON.stringify(canonical(manifest))).digest('hex');
}
