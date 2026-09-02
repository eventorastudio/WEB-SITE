import { normalizeEventDate } from './event-date.js';

export function buildRootEventDatePatch(currentEvent, draftDate) {
    const canonicalDate = normalizeEventDate(draftDate, { strict: true });
    return currentEvent?.fecha === canonicalDate ? {} : { fecha: canonicalDate };
}

export function buildDraftEventDatePatch(currentDraft, rootDate) {
    const canonicalDate = normalizeEventDate(rootDate, { strict: true });
    return currentDraft?.content?.schedule?.date === canonicalDate
        ? {}
        : { 'content.schedule.date': canonicalDate };
}
