import { parseRsvpRoute } from '../../shared/rsvp-access-contract.js?v=phase54-public-rsvp-20260817';
import { isPublicRsvpClosed } from '../core/rsvp-public-config-contract.js?v=phase54-public-rsvp-20260817';
import { publicRsvpAccessLoader } from './rsvp-access-loader.js?v=phase54-public-rsvp-20260817';
import { publicRsvpConfigLoader } from './rsvp-public-config-loader.js?v=phase54-public-rsvp-20260817';
import { rsvpResponseService } from './rsvp-response-service.js?v=phase54-public-rsvp-20260817';

const SAFE_FAILURE_STATES = new Map([
    ['rsvp-access/revoked', 'revoked'],
    ['rsvp-access/expired', 'expired'],
    ['rsvp-public/disabled', 'disabled'],
    ['rsvp-access/error', 'error'],
    ['rsvp-public/error', 'error']
]);

export class PublicRsvpSessionLoader {
    constructor({
        accessLoader = publicRsvpAccessLoader,
        configLoader = publicRsvpConfigLoader,
        responseService = rsvpResponseService,
        now = () => new Date()
    } = {}) {
        this.accessLoader = accessLoader;
        this.configLoader = configLoader;
        this.responseService = responseService;
        this.now = now;
    }

    async loadRoute(input) {
        const route = parseRsvpRoute(input);
        if (!route.valid) return failure('invalid');
        let access;
        try {
            access = await this.accessLoader.load(route.eventId, route.token);
        } catch (error) {
            return failure(SAFE_FAILURE_STATES.get(error?.code) ?? 'invalid');
        }
        let config;
        try {
            config = await this.configLoader.load(route.eventId, access.configKey);
        } catch (error) {
            return failure(SAFE_FAILURE_STATES.get(error?.code) ?? 'invalid');
        }
        let response;
        try {
            response = await this.responseService.load({
                eventId: route.eventId,
                token: route.token,
                access,
                config
            });
        } catch {
            return failure('error');
        }
        const closed = isPublicRsvpClosed(config, this.now());
        const status = closed
            ? 'closed'
            : (response ? 'existing-response' : `ready-${config.method}`);
        return Object.freeze({
            status,
            eventId: route.eventId,
            token: route.token,
            access,
            config,
            response,
            closed
        });
    }
}

function failure(status) {
    return Object.freeze({
        status,
        eventId: null,
        token: null,
        access: null,
        config: null,
        response: null,
        closed: false
    });
}

export const publicRsvpSessionLoader = new PublicRsvpSessionLoader();
