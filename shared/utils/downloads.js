export function createDownloadBlob(content, type = 'text/plain;charset=utf-8') {
    return new Blob([String(content)], { type });
}

export function downloadBlob(blob, filename, documentRef = globalThis.document, urlRef = globalThis.URL) {
    if (!documentRef?.createElement || !urlRef?.createObjectURL) {
        throw new Error('La descarga requiere un entorno de navegador.');
    }
    const link = documentRef.createElement('a');
    const url = urlRef.createObjectURL(blob);
    link.href = url;
    link.download = String(filename || 'download');
    link.click();
    urlRef.revokeObjectURL(url);
}

export function downloadText(content, filename, type = 'text/plain;charset=utf-8', documentRef, urlRef) {
    downloadBlob(createDownloadBlob(content, type), filename, documentRef, urlRef);
}
