import { buildQrPayload } from '../../../shared/qr-code.js';

export function generateQrCanvas(qrToken, { size = 1024, marginModules = 4 } = {}) {
    const matrix = createQrMatrix(qrToken);
    const moduleCount = matrix.length;
    const cellSize = Math.max(1, Math.floor(size / (moduleCount + (marginModules * 2))));
    const qrSize = cellSize * moduleCount;
    const offset = Math.floor((size - qrSize) / 2);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('qr/canvas-unavailable');
    context.imageSmoothingEnabled = false;
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, size, size);
    context.fillStyle = '#000000';
    for (let row = 0; row < moduleCount; row += 1) {
        for (let column = 0; column < moduleCount; column += 1) {
            if (matrix[row][column]) {
                context.fillRect(offset + (column * cellSize), offset + (row * cellSize), cellSize, cellSize);
            }
        }
    }
    return canvas;
}

export function createQrMatrix(qrToken) {
    if (typeof globalThis.qrcode !== 'function') throw new Error('qr/library-unavailable');
    const payload = buildQrPayload({ qrToken });
    const qr = globalThis.qrcode(0, 'H');
    qr.addData(payload, 'Byte');
    qr.make();
    const moduleCount = qr.getModuleCount();
    return Array.from({ length: moduleCount }, (_, row) => (
        Array.from({ length: moduleCount }, (_, column) => qr.isDark(row, column))
    ));
}

export function generateQrBlob(qrToken, options = {}) {
    const canvas = generateQrCanvas(qrToken, options);
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            canvas.width = 1;
            canvas.height = 1;
            if (blob) resolve(blob);
            else reject(new Error('qr/png-generation-failed'));
        }, 'image/png');
    });
}

/** API preparada para el futuro editor de invitaciones; no persiste el Blob. */
export function getGuestQrBlob(_eventId, guest, options = {}) {
    if (!guest?.qrToken) return Promise.reject(new Error('qr/token-required'));
    return generateQrBlob(guest.qrToken, options);
}
