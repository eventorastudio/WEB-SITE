export function isBuilderDebugEnabled(search = window.location.search) {
    return new URLSearchParams(search).get('debugBuilder') === '1';
}

function regionState(targetWindow, element) {
    if (!element) return { exists: false };
    const style = targetWindow.getComputedStyle?.(element);
    const rect = element.getBoundingClientRect?.();
    return {
        exists: true,
        connected: element.isConnected,
        hidden: element.hidden,
        display: style?.display ?? null,
        visibility: style?.visibility ?? null,
        opacity: style?.opacity ?? null,
        width: Math.round(rect?.width ?? 0),
        height: Math.round(rect?.height ?? 0)
    };
}

export function createBuilderDebugLogger({ targetWindow = window, targetDocument = document, getSnapshot }) {
    const enabled = isBuilderDebugEnabled(targetWindow.location.search);

    const readSnapshot = () => {
        try { return getSnapshot?.() ?? null; }
        catch { return null; }
    };

    const createDiagnostic = (event, details = {}) => {
        const snapshot = readSnapshot();
        return {
            event,
            viewport: {
                width: targetWindow.innerWidth,
                height: targetWindow.innerHeight,
                devicePixelRatio: targetWindow.devicePixelRatio
            },
            themeId: snapshot?.draft?.themeId ?? null,
            packageId: snapshot?.draft?.packageId ?? null,
            enabledSections: [...(snapshot?.draft?.enabledSections ?? [])],
            activeStep: snapshot?.ui?.activeStep ?? null,
            previewDevice: snapshot?.ui?.previewDevice ?? null,
            bodyChildren: targetDocument.body?.children.length ?? 0,
            regions: {
                root: regionState(targetWindow, targetDocument.getElementById('invitation-builder-root')),
                shell: regionState(targetWindow, targetDocument.getElementById('invitation-builder-root')),
                sidebar: regionState(targetWindow, targetDocument.querySelector('[data-builder-region="sidebar"]')),
                editor: regionState(targetWindow, targetDocument.querySelector('[data-builder-region="editor"]')),
                sectionPanel: regionState(targetWindow, targetDocument.getElementById('builder-panel-sections')),
                preview: regionState(targetWindow, targetDocument.querySelector('[data-builder-region="preview"]')),
                frame: regionState(targetWindow, targetDocument.getElementById('invitation-preview-frame'))
            },
            ...details
        };
    };

    return Object.freeze({
        enabled,
        trace(event, details) {
            if (enabled) console.debug('[InvitationBuilder]', createDiagnostic(event, details));
        },
        captureError(event, error, location = {}) {
            if (!enabled) return;
            console.debug('[InvitationBuilder]', createDiagnostic(event, {
                error: {
                    message: error?.message ?? String(error ?? 'Error desconocido'),
                    filename: location.filename ?? null,
                    line: location.line ?? null,
                    column: location.column ?? null,
                    stack: error?.stack ?? null,
                    source: location.source ?? null,
                    reason: location.reason ?? null
                }
            }));
        }
    });
}
