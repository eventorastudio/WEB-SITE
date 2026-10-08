export function buildGoogleMapsUrl({ query = '', address = '', latitude, longitude } = {}) {
    const hasCoordinates = latitude !== undefined && longitude !== undefined
        && latitude !== '' && longitude !== '';
    const search = hasCoordinates ? `${latitude},${longitude}` : (query || address);
    if (!String(search).trim()) throw new TypeError('Se requiere una búsqueda o coordenadas.');
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(String(search).trim())}`;
}
