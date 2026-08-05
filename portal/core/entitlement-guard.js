export const PORTAL_FEATURES = Object.freeze({
    PORTAL: 'portalCliente',
    QR: 'checkInQR',
    LIVE: 'seguimientoEnVivo',
    HISTORY: 'historialAccesos'
});

export function getPortalEntitlements(event) {
    const source = event?.funcionalidades && typeof event.funcionalidades === 'object'
        ? event.funcionalidades
        : {};
    return Object.freeze({
        portalCliente: source.portalCliente === true,
        checkInQR: source.checkInQR === true,
        seguimientoEnVivo: source.seguimientoEnVivo === true,
        historialAccesos: source.historialAccesos === true
    });
}

export function hasPortalFeature(event, feature) {
    return getPortalEntitlements(event)[feature] === true;
}

export class EntitlementError extends Error {
    constructor(feature) {
        super(`portal/feature-not-enabled:${feature}`);
        this.code = 'portal/feature-not-enabled';
        this.feature = feature;
    }
}

export function assertPortalFeature(event, feature) {
    if (!hasPortalFeature(event, feature)) throw new EntitlementError(feature);
}
