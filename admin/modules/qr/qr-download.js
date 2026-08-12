import { generateQrBlob } from './qr-renderer.js';

export async function downloadGuestQrPng(guest) {
    const blob = await generateQrBlob(guest.qrToken, { size: 1024 });
    downloadBlob(blob, `${safeCode(guest.codigoInvitado || guest.id)}.png`);
    return blob;
}

export async function buildQrZip({ eventId, guests, onProgress, signal, outputType = 'blob' } = {}) {
    if (typeof globalThis.JSZip !== 'function') throw new Error('qr/zip-library-unavailable');
    const zip = new globalThis.JSZip();
    const rows = [['codigoInvitado', 'nombre', 'mesa', 'pases', 'archivo']];
    const items = Array.isArray(guests) ? guests : [];
    for (let index = 0; index < items.length; index += 1) {
        if (signal?.aborted) throw new DOMException('Generación cancelada', 'AbortError');
        const guest = items[index];
        const code = safeCode(guest.codigoInvitado || guest.id);
        const filename = `${code}.png`;
        const blob = await generateQrBlob(guest.qrToken, { size: 1024 });
        zip.file(filename, blob);
        rows.push([code, guest.nombre || '', guest.mesa ?? '', guest.pases ?? '', filename]);
        onProgress?.({ current: index + 1, total: items.length });
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    zip.file('index.csv', rows.map((row) => row.map(csvCell).join(',')).join('\r\n'));
    return zip.generateAsync({ type: outputType, compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

export function downloadQrZip(blob, eventId) {
    downloadBlob(blob, `${safeCode(eventId)}-QR.zip`);
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function safeCode(value) {
    return String(value ?? '').trim().replace(/[^A-Za-z0-9_-]/g, '_') || 'QR';
}

function csvCell(value) {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
