import { httpsCallable, getFunctions } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getToken as getAppCheckToken } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-check.js";

import { app, appCheck, auth, db } from './firebase.js';
import { initAdminShell } from './components/admin-shell.js';
import { PERMISSIONS } from './core/roles.js';
import { initThemeManager } from './core/theme-manager.js';
import {
    areConfirmationsComplete,
    canAuthorizeReview,
    expectedConfirmationPhrase,
    summarizeDryRun
} from './modules/purge/refund-purge-review.js';

initThemeManager();

const functions = getFunctions(app, 'us-central1');
const preparePurge = httpsCallable(functions, 'prepareRefundProjectPurge');
const recordRefund = httpsCallable(functions, 'recordRefundProcessed');
const confirmRefund = httpsCallable(functions, 'confirmRefundRecord');
const authorizePurge = httpsCallable(functions, 'authorizeRefundProjectPurge');
const cancelAuthorization = httpsCallable(functions, 'cancelRefundProjectPurgeAuthorization');
const eventSelect = document.getElementById('event-select');
const prepareButton = document.getElementById('prepare-button');
const recordButton = document.getElementById('record-button');
const confirmRecordButton = document.getElementById('confirm-record-button');
const authorizeButton = document.getElementById('authorize-button');
const cancelButton = document.getElementById('cancel-button');
const dryRunCard = document.getElementById('dry-run-card');
const authorizationCard = document.getElementById('authorization-card');
const eventIdentity = document.getElementById('event-identity');
const dryRunStatus = document.getElementById('dry-run-status');
const dryRunSummary = document.getElementById('dry-run-summary');
const dryRunMessages = document.getElementById('dry-run-messages');
const confirmationPhrase = document.getElementById('confirmation-phrase');
const expectedPhrase = document.getElementById('expected-phrase');
const confirmationEventId = document.getElementById('confirmation-event-id');
const confirmationCommercialReference = document.getElementById('confirmation-commercial-reference');
const authorizationResult = document.getElementById('authorization-result');
const reauthButton = document.getElementById('reauth-button');
const reauthPassword = document.getElementById('reauth-password');
const reauthStatus = document.getElementById('reauth-status');
const refundRecordStatus = document.getElementById('refund-record-status');
const refundReferenceInput = document.getElementById('refund-reference');
const commercialReferenceInput = document.getElementById('commercial-reference');
const refundedAtInput = document.getElementById('refunded-at');
const refundAmountInput = document.getElementById('refund-amount');
const paymentMethodInput = document.getElementById('payment-method');
const terminationIntentInputs = [...document.querySelectorAll('[name="termination-intent"]')];
const terminationWarning = document.getElementById('termination-warning');

let events = new Map();
let selectedDryRun = null;
let activeAuthorizationId = null;
let refundRecordId = null;
let freshAuthConfirmed = false;

initAdminShell({
    requiredPermission: PERMISSIONS.REFUND_PURGE_REVIEW,
    onReady: loadEvents
});

async function loadEvents() {
    const snapshot = await getDocs(collection(db, 'eventos'));
    events = new Map(snapshot.docs.map((document) => [document.id, { id: document.id, ...document.data() }]));
    eventSelect.replaceChildren(option('', 'Selecciona un evento cargado desde Firebase'));
    [...events.values()]
        .sort((left, right) => String(left.nombreEvento ?? left.nombre ?? left.id).localeCompare(String(right.nombreEvento ?? right.nombre ?? right.id)))
        .forEach((event) => eventSelect.append(option(event.id, `${event.nombreEvento ?? event.nombre ?? 'Evento sin nombre'} · ${event.id}`)));
    prepareButton.disabled = true;
}

eventSelect.addEventListener('change', () => {
    resetReview();
    const event = events.get(eventSelect.value);
    renderEventIdentity(event);
    prepareButton.disabled = !event || !refundRecordId;
    updateRefundRecordControls();
    refundRecordStatus.textContent = '';
});

recordButton.addEventListener('click', async () => {
    if (!eventSelect.value) return;
    setBusy(recordButton, true);
    try {
        await getAppCheckToken(appCheck, false);
        const result = await recordRefund({
            eventId: eventSelect.value,
            commercialFileReference: commercialReferenceInput.value.trim(),
            refundReference: refundReferenceInput.value.trim(),
            amount: Number(refundAmountInput.value),
            currency: 'MXN',
            paymentMethod: paymentMethodInput.value,
            refundedAt: refundedAtInput.value ? new Date(refundedAtInput.value).toISOString() : '',
            terminationIntent: selectedTerminationIntent()
        });
        refundRecordId = result.data.refundRecordId;
        refundRecordStatus.textContent = 'Registro creado como RECORDED. Revisa los datos y confirma el registro.';
        confirmRecordButton.disabled = false;
    } catch (error) {
        refundRecordStatus.textContent = `No fue posible registrar el reembolso. Código: ${safeCode(error)}.`;
    } finally {
        setBusy(recordButton, false);
    }
});

confirmRecordButton.addEventListener('click', async () => {
    if (!refundRecordId) return;
    setBusy(confirmRecordButton, true);
    try {
        await getAppCheckToken(appCheck, false);
        await confirmRefund({ refundRecordId });
        refundRecordStatus.textContent = 'Registro CONFIRMED. La evidencia queda administrativamente controlada.';
        prepareButton.disabled = false;
        confirmRecordButton.disabled = true;
    } catch (error) {
        refundRecordStatus.textContent = `No fue posible confirmar el registro. Código: ${safeCode(error)}.`;
    } finally {
        setBusy(confirmRecordButton, false);
    }
});

prepareButton.addEventListener('click', async () => {
    const eventId = eventSelect.value;
    const event = events.get(eventId);
    if (!event) return;
    setBusy(prepareButton, true);
    resetReview({ keepIdentity: true, keepRefundRecord: true });
    try {
        await getAppCheckToken(appCheck, false);
        const result = await preparePurge({
            eventId,
            refundRecordId
        });
        selectedDryRun = result.data;
        renderDryRun(selectedDryRun);
    } catch (error) {
        showMessage(dryRunMessages, `No fue posible completar el dry-run. Código: ${safeCode(error)}.`, true);
    } finally {
        setBusy(prepareButton, false);
    }
});

for (const checkbox of document.querySelectorAll('[data-confirmation]')) {
    checkbox.addEventListener('change', updateAuthorizeState);
}
confirmationPhrase.addEventListener('input', updateAuthorizeState);
terminationIntentInputs.forEach((input) => input.addEventListener('change', () => {
    terminationWarning.hidden = selectedTerminationIntent() !== 'COMPLETE_TERMINATION';
    updateRefundRecordControls();
}));

reauthButton.addEventListener('click', async () => {
    const user = auth.currentUser;
    if (!user?.email || !user.providerData.some((provider) => provider.providerId === 'password')) {
        reauthStatus.textContent = 'Proveedor no compatible con esta reautenticación explícita. No se autoriza.';
        return;
    }
    setBusy(reauthButton, true);
    try {
        const credential = EmailAuthProvider.credential(user.email, reauthPassword.value);
        await reauthenticateWithCredential(user, credential);
        await user.getIdTokenResult(true);
        freshAuthConfirmed = true;
        reauthPassword.value = '';
        reauthStatus.textContent = 'Sesión reautenticada. La callable volverá a validar auth_time.';
        updateAuthorizeState();
    } catch (error) {
        freshAuthConfirmed = false;
        reauthStatus.textContent = `No fue posible reautenticar. Código: ${safeCode(error)}.`;
        updateAuthorizeState();
    } finally {
        setBusy(reauthButton, false);
    }
});

authorizeButton.addEventListener('click', async () => {
    if (!selectedDryRun) return;
    const eventId = eventSelect.value;
    setBusy(authorizeButton, true);
    try {
        await getAppCheckToken(appCheck, false);
        const result = await authorizePurge({
            eventId,
            refundReference: refundReferenceInput.value.trim(),
            commercialFileReference: commercialReferenceInput.value.trim(),
            manifestHash: selectedDryRun.manifestHash,
            phrase: confirmationPhrase.value,
            confirmations: collectConfirmations()
        });
        activeAuthorizationId = result.data.authorizationId;
        authorizationResult.textContent = 'PURGA AUTORIZADA. EJECUCIÓN PRODUCTIVA TODAVÍA DESHABILITADA.';
        cancelButton.hidden = false;
        authorizeButton.hidden = true;
    } catch (error) {
        authorizationResult.textContent = `Autorización rechazada. Código: ${safeCode(error)}.`;
    } finally {
        setBusy(authorizeButton, false);
    }
});

cancelButton.addEventListener('click', async () => {
    if (!activeAuthorizationId) return;
    setBusy(cancelButton, true);
    try {
        await cancelAuthorization({ eventId: eventSelect.value, authorizationId: activeAuthorizationId });
        authorizationResult.textContent = 'Autorización cancelada. El evento no fue eliminado.';
        activeAuthorizationId = null;
        cancelButton.hidden = true;
        authorizeButton.hidden = false;
        resetConfirmations();
    } catch (error) {
        authorizationResult.textContent = `No fue posible cancelar. Código: ${safeCode(error)}.`;
    } finally {
        setBusy(cancelButton, false);
    }
});

function renderEventIdentity(event) {
    eventIdentity.replaceChildren();
    if (!event) {
        eventIdentity.hidden = true;
        return;
    }
    for (const [label, value] of [
        ['Evento', event.nombreEvento ?? event.nombre ?? 'Sin nombre'],
        ['Event ID', event.id],
        ['Fecha', event.fecha ?? 'No disponible'],
        ['Modo', event.demoMode === true ? 'DEMO · BLOQUEADO' : 'Cliente']
    ]) {
        const wrapper = document.createElement('div');
        const caption = document.createElement('span');
        caption.textContent = label;
        const content = document.createElement('strong');
        content.textContent = String(value);
        wrapper.append(caption, content);
        eventIdentity.append(wrapper);
    }
    eventIdentity.hidden = false;
}

function renderDryRun(result) {
    dryRunCard.hidden = false;
    dryRunStatus.textContent = result.status ?? '—';
    dryRunSummary.replaceChildren();
    const labels = { firestore: 'Firestore', guests: 'Invitados', rsvp: 'RSVP', checkins: 'Check-ins', publications: 'Publicaciones', media: 'Media', storage: 'Storage', sharedDemo: 'Shared DEMO · detach', profiles: 'Perfiles · detach', warnings: 'Warnings', blockers: 'Blockers' };
    const summary = summarizeDryRun(result);
    for (const [key, label] of Object.entries(labels)) {
        const item = document.createElement('div');
        const caption = document.createElement('span');
        caption.textContent = label;
        const value = document.createElement('strong');
        value.textContent = String(summary[key]);
        item.append(caption, value);
        dryRunSummary.append(item);
    }
    dryRunMessages.replaceChildren();
    (result.blockers ?? []).forEach((blocker) => showMessage(dryRunMessages, `BLOCKER: ${blocker.code}`, true));
    (result.warnings ?? []).forEach((warning) => showMessage(dryRunMessages, `WARNING: ${warning.code ?? warning}`, false));
    authorizationCard.hidden = Boolean(result.status !== 'DRY_RUN_READY' || result.blockers?.length);
    confirmationEventId.textContent = eventSelect.value;
    confirmationCommercialReference.textContent = commercialReferenceInput.value.trim() || '—';
    expectedPhrase.textContent = expectedConfirmationPhrase(eventSelect.value, commercialReferenceInput.value.trim());
    updateAuthorizeState();
}

function updateAuthorizeState() {
    authorizeButton.disabled = !canAuthorizeReview({
        dryRun: selectedDryRun,
        phrase: confirmationPhrase.value,
        expectedPhrase: expectedPhrase.textContent,
        confirmations: collectConfirmations(),
        freshAuthConfirmed
    });
}

function selectedTerminationIntent() {
    return terminationIntentInputs.find((input) => input.checked)?.value ?? '';
}

function updateRefundRecordControls() {
    recordButton.disabled = !eventSelect.value || !selectedTerminationIntent();
}

function collectConfirmations() {
    return Object.fromEntries([...document.querySelectorAll('[data-confirmation]')]
        .map((checkbox) => [checkbox.dataset.confirmation, checkbox.checked]));
}

function resetReview({ keepIdentity = false, keepRefundRecord = false } = {}) {
    selectedDryRun = null;
    activeAuthorizationId = null;
    freshAuthConfirmed = false;
    if (!keepRefundRecord) refundRecordId = null;
    if (!keepRefundRecord) {
        terminationIntentInputs.forEach((input) => { input.checked = false; });
        terminationWarning.hidden = true;
    }
    dryRunCard.hidden = true;
    authorizationCard.hidden = true;
    authorizeButton.hidden = false;
    cancelButton.hidden = true;
    authorizationResult.textContent = '';
    reauthStatus.textContent = '';
    reauthPassword.value = '';
    dryRunMessages.replaceChildren();
    resetConfirmations();
    if (!keepRefundRecord) {
        confirmRecordButton.disabled = true;
        prepareButton.disabled = true;
    }
    updateRefundRecordControls();
    if (!keepIdentity) renderEventIdentity(events.get(eventSelect.value));
}

function resetConfirmations() {
    document.querySelectorAll('[data-confirmation]').forEach((checkbox) => { checkbox.checked = false; });
    confirmationPhrase.value = '';
    authorizeButton.disabled = true;
}

function option(value, label) {
    const element = document.createElement('option');
    element.value = value;
    element.textContent = label;
    return element;
}

function showMessage(container, message, isBlocker) {
    const line = document.createElement('div');
    if (isBlocker) {
        const strong = document.createElement('strong');
        strong.textContent = message;
        line.append(strong);
    } else line.textContent = message;
    container.append(line);
}

function setBusy(button, busy) {
    button.disabled = busy;
    button.setAttribute('aria-busy', String(busy));
}

function safeCode(error) {
    return String(error?.code ?? 'unknown').replace(/^functions\//, '');
}
