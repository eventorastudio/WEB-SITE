import { createRsvpView } from './rsvp-view.js?v=phase54-public-rsvp-20260817';
import { RsvpPageController } from './rsvp-controller.js?v=phase54-public-rsvp-20260817';
import { publicRsvpSessionLoader } from './services/rsvp-session-loader.js?v=phase54-public-rsvp-20260817';
import { rsvpResponseService } from './services/rsvp-response-service.js?v=phase54-public-rsvp-20260817';

const controller = new RsvpPageController({
    sessionLoader: publicRsvpSessionLoader,
    responseService: rsvpResponseService,
    view: createRsvpView(document)
});

await controller.start(window.location.search);
