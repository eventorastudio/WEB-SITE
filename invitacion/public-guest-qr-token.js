const SAFE_EVENT_ID = /^[A-Za-z0-9_-]{1,150}$/;
const SAFE_TOKEN = /^[A-Za-z0-9_-]{16,256}$/;

async function createGateway() {
    const [{ app }, functionsApi] = await Promise.all([
        import('../admin/firebase.js'),
        import('https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js')
    ]);
    const functions = functionsApi.getFunctions(app, 'us-central1');
    const callable = functionsApi.httpsCallable(functions, 'getGuestQrToken');
    return { call: (data) => callable(data) };
}

export class PublicGuestQrTokenLoader {
    constructor({ gateway = null, gatewayFactory = createGateway } = {}) {
        this.gateway = gateway;
        this.gatewayFactory = gatewayFactory;
        this.gatewayPromise = null;
    }
    async load(eventId, rsvpToken) {
        const safeEventId = String(eventId ?? '');
        const safeToken = String(rsvpToken ?? '');
        if (!SAFE_EVENT_ID.test(safeEventId) || !SAFE_TOKEN.test(safeToken)) throw new Error('guest-qr/unavailable');
        if (!this.gateway) {
            this.gatewayPromise ??= this.gatewayFactory();
            this.gateway = await this.gatewayPromise;
        }
        const result = await this.gateway.call({ eventId: safeEventId, rsvpToken: safeToken });
        const qrToken = String(result?.data?.qrToken ?? '').trim();
        if (result?.data?.schemaVersion !== 1 || !SAFE_TOKEN.test(qrToken)) throw new Error('guest-qr/unavailable');
        return qrToken;
    }
}

export const publicGuestQrTokenLoader = new PublicGuestQrTokenLoader();
