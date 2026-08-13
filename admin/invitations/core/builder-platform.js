export const BUILDER_DESKTOP_MIN_WIDTH = 1100;
export const BUILDER_DESKTOP_INPUT_QUERY = '(hover: hover) and (pointer: fine)';

export const BUILDER_PLATFORM_STATUS = Object.freeze({
    SUPPORTED: 'supported',
    WINDOW_TOO_SMALL: 'window-too-small',
    UNSUPPORTED_DEVICE: 'unsupported-device'
});

export function evaluateBuilderPlatform({ viewportWidth, desktopInput }) {
    if (!desktopInput) return BUILDER_PLATFORM_STATUS.UNSUPPORTED_DEVICE;
    if (!Number.isFinite(viewportWidth) || viewportWidth < BUILDER_DESKTOP_MIN_WIDTH) {
        return BUILDER_PLATFORM_STATUS.WINDOW_TOO_SMALL;
    }
    return BUILDER_PLATFORM_STATUS.SUPPORTED;
}

export function getBuilderPlatformStatus(targetWindow = window) {
    const desktopInput = Boolean(targetWindow.matchMedia?.(BUILDER_DESKTOP_INPUT_QUERY).matches);
    return evaluateBuilderPlatform({
        viewportWidth: Number(targetWindow.innerWidth),
        desktopInput
    });
}

export function isBuilderDesktopSupported(targetWindow = window) {
    return getBuilderPlatformStatus(targetWindow) === BUILDER_PLATFORM_STATUS.SUPPORTED;
}

export function initBuilderPlatformAccess({ targetWindow = window, onReady, onStatusChange }) {
    const inputQuery = targetWindow.matchMedia?.(BUILDER_DESKTOP_INPUT_QUERY) ?? null;
    let started = false;
    let readyDelivered = false;
    let previousStatus = null;

    const evaluate = () => {
        const status = evaluateBuilderPlatform({
            viewportWidth: Number(targetWindow.innerWidth),
            desktopInput: Boolean(inputQuery?.matches)
        });
        if (status === previousStatus) return;
        previousStatus = status;

        if (status === BUILDER_PLATFORM_STATUS.SUPPORTED && !started) started = true;
        onStatusChange?.(status, { hasStarted: started });
        if (status === BUILDER_PLATFORM_STATUS.SUPPORTED && started && !readyDelivered) {
            readyDelivered = true;
            onReady?.();
        }
    };

    const handleResize = () => evaluate();
    const handleInputChange = () => evaluate();
    targetWindow.addEventListener('resize', handleResize);
    inputQuery?.addEventListener?.('change', handleInputChange);
    evaluate();

    return () => {
        targetWindow.removeEventListener('resize', handleResize);
        inputQuery?.removeEventListener?.('change', handleInputChange);
    };
}
