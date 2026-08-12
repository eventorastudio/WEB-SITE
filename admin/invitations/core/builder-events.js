export const PREVIEW_MESSAGE_TYPES = Object.freeze({
    SHELL_READY: 'EVENTORA_INVITATION_PREVIEW_SHELL_READY',
    RENDER: 'EVENTORA_INVITATION_PREVIEW_RENDER',
    RENDERED: 'EVENTORA_INVITATION_PREVIEW_RENDERED',
    ERROR: 'EVENTORA_INVITATION_PREVIEW_ERROR'
});

export const PREVIEW_DEVICES = Object.freeze({
    mobile: Object.freeze({ id: 'mobile', label: 'Móvil', width: 390, height: 844 }),
    tablet: Object.freeze({ id: 'tablet', label: 'Tablet', width: 768, height: 1024 }),
    desktop: Object.freeze({ id: 'desktop', label: 'Desktop', width: 1440, height: 900 })
});

export function isPreviewMessage(value) {
    return Boolean(value && typeof value === 'object' && Object.values(PREVIEW_MESSAGE_TYPES).includes(value.type));
}
