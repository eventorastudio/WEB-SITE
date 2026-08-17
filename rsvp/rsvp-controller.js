export class RsvpPageController {
    constructor({ sessionLoader, responseService, view } = {}) {
        if (!sessionLoader || !responseService || !view) throw new Error('rsvp-page/invalid-dependencies');
        this.sessionLoader = sessionLoader;
        this.responseService = responseService;
        this.view = view;
        this.routeInput = '';
        this.session = null;
        this.savePromise = null;
        this.view.onSubmit((selection) => void this.submit(selection));
        this.view.onRetry(() => {
            if (this.session) void this.submit(this.view.readSelection());
            else void this.start(this.routeInput);
        });
    }

    async start(routeInput) {
        this.routeInput = String(routeInput ?? '');
        this.session = null;
        this.view.renderLoading();
        let result;
        try {
            result = await this.sessionLoader.loadRoute(this.routeInput);
        } catch {
            result = { status: 'error' };
        }
        if (!['ready-internal', 'ready-whatsapp', 'existing-response', 'closed'].includes(result.status)) {
            this.view.renderUnavailable(result.status, { retry: result.status === 'error' });
            return result;
        }
        this.session = result;
        this.view.renderSession(toViewModel(result));
        return result;
    }

    submit(selection) {
        if (!this.session || this.session.closed || this.session.config.method !== 'internal') {
            return Promise.resolve(null);
        }
        if (this.savePromise) return this.savePromise;
        this.view.setSaving(true);
        this.savePromise = Promise.resolve().then(() => this.responseService.save({
            eventId: this.session.eventId,
            token: this.session.token,
            access: this.session.access,
            config: this.session.config,
            status: selection?.status,
            passesConfirmed: selection?.passesConfirmed,
            currentResponse: this.session.response
        })).then((result) => {
            this.session = Object.freeze({ ...this.session, response: result.response, status: result.status });
            this.view.showSaveResult(result, this.session.config.responses.confirmationMessage);
            return result;
        }).catch(() => {
            this.view.showSaveError();
            return Object.freeze({ status: 'error', response: this.session.response });
        }).finally(() => {
            this.view.setSaving(false);
            this.savePromise = null;
        });
        return this.savePromise;
    }
}

function toViewModel(session) {
    return Object.freeze({
        state: session.status,
        access: Object.freeze({
            displayName: session.access.displayName,
            passLimit: session.access.passLimit
        }),
        config: session.config,
        response: session.response,
        closed: session.closed
    });
}
