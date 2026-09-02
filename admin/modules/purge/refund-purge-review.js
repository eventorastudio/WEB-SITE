export const REQUIRED_CONFIRMATIONS = Object.freeze([
    'refundProcessed', 'eventAndReferenceReviewed',
    'irreversibleUnderstood', 'commercialRecordsPreserved'
]);

export function expectedConfirmationPhrase(eventId, commercialFileReference) {
    return `PURGAR ${eventId} ${commercialFileReference}`;
}

export function areConfirmationsComplete(confirmations = {}) {
    return REQUIRED_CONFIRMATIONS.every((key) => confirmations[key] === true);
}

export function canAuthorizeReview({ dryRun, phrase, expectedPhrase, confirmations, freshAuthConfirmed = false } = {}) {
    return dryRun?.status === 'DRY_RUN_READY'
        && !(dryRun.blockers?.length)
        && areConfirmationsComplete(confirmations)
        && freshAuthConfirmed
        && phrase === expectedPhrase;
}

export function summarizeDryRun(result = {}) {
    return Object.freeze({
        firestore: result.counts?.firestoreDocuments ?? 0,
        guests: result.counts?.invitados ?? 0,
        rsvp: ['rsvpAccess', 'rsvpPublic', 'rsvpResponses', 'rsvpState', 'rsvpConflicts']
            .reduce((total, key) => total + (result.counts?.[key] ?? 0), 0),
        checkins: result.counts?.checkins ?? 0,
        publications: result.counts?.publicProjections ?? 0,
        media: result.counts?.mediaMetadata ?? 0,
        storage: result.counts?.storageObjectReferences ?? 0,
        sharedDemo: result.counts?.sharedDemoReferences ?? 0,
        profiles: result.counts?.profileReferences ?? 0,
        warnings: result.warnings?.length ?? 0,
        blockers: result.blockers?.length ?? 0
    });
}
