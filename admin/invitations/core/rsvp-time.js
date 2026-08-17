const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const IANA_PATTERN = /^(?:UTC|[A-Za-z_]+(?:\/[A-Za-z0-9._+-]+)+)$/;
const OFFSET_ZONE_PATTERN = /^(?:Etc\/GMT|GMT|UTC)[+-]/i;
const FORMAT_LOCALE = 'en-CA-u-ca-gregory-nu-latn';

export class RsvpTimeContractError extends Error {
    constructor(code) {
        super(code);
        this.name = 'RsvpTimeContractError';
        this.code = code;
    }
}

export function isValidRsvpDeadlineDate(value) {
    const match = String(value ?? '').match(DATE_PATTERN);
    if (!match) return false;
    const [, year, month, day] = match.map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year
        && date.getUTCMonth() === month - 1
        && date.getUTCDate() === day;
}

export function isValidRsvpDeadlineTime(value) {
    return TIME_PATTERN.test(String(value ?? ''));
}

export function isValidIanaTimeZone(value) {
    const timeZone = String(value ?? '').trim();
    if (!timeZone || timeZone.length > 100 || !IANA_PATTERN.test(timeZone) || OFFSET_ZONE_PATTERN.test(timeZone)) {
        return false;
    }
    try {
        new Intl.DateTimeFormat(FORMAT_LOCALE, { timeZone }).format(0);
        return true;
    } catch {
        return false;
    }
}

export function getSupportedIanaTimeZones() {
    if (typeof Intl.supportedValuesOf !== 'function') return Object.freeze([]);
    try {
        return Object.freeze(Intl.supportedValuesOf('timeZone').filter(isValidIanaTimeZone));
    } catch {
        return Object.freeze([]);
    }
}

export function getDetectedIanaTimeZone() {
    try {
        const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
        return isValidIanaTimeZone(detected) ? detected : '';
    } catch {
        return '';
    }
}

export function deriveRsvpResponseClosesAt({
    deadline = '',
    deadlineTime = '',
    deadlineTimeZone = ''
} = {}) {
    const dateValue = String(deadline ?? '').trim();
    const timeValue = String(deadlineTime ?? '').trim();
    const timeZone = String(deadlineTimeZone ?? '').trim();

    if (!dateValue && !timeValue && !timeZone) return null;
    if (dateValue && !isValidRsvpDeadlineDate(dateValue)) throw new RsvpTimeContractError('rsvp-time/invalid-deadline');
    if (timeValue && !isValidRsvpDeadlineTime(timeValue)) throw new RsvpTimeContractError('rsvp-time/invalid-deadline-time');
    if (timeZone && !isValidIanaTimeZone(timeZone)) throw new RsvpTimeContractError('rsvp-time/invalid-time-zone');
    if (!dateValue) throw new RsvpTimeContractError('rsvp-time/deadline-required');
    if (!timeValue) throw new RsvpTimeContractError('rsvp-time/deadline-time-required');
    if (!timeZone) throw new RsvpTimeContractError('rsvp-time/deadline-time-zone-required');

    const [year, month, day] = dateValue.split('-').map(Number);
    const [hour, minute] = timeValue.split(':').map(Number);
    const desired = { year, month, day, hour, minute, second: 0 };
    const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
    const formatter = createZonedFormatter(timeZone);
    const offsets = new Set();

    // Sampling both sides of the requested wall clock discovers every offset
    // participating in ordinary and non-hour DST transitions without consulting
    // the browser's own time zone.
    for (let sampleHours = -48; sampleHours <= 48; sampleHours += 3) {
        const sample = wallClockAsUtc + sampleHours * 60 * 60 * 1000;
        const local = readZonedParts(formatter, sample);
        offsets.add(Date.UTC(
            local.year,
            local.month - 1,
            local.day,
            local.hour,
            local.minute,
            local.second
        ) - sample);
    }

    const matches = new Set();
    offsets.forEach((offset) => {
        const candidate = wallClockAsUtc - offset;
        if (sameLocalTime(readZonedParts(formatter, candidate), desired)) matches.add(candidate);
    });

    if (matches.size === 0) throw new RsvpTimeContractError('rsvp-time/nonexistent-local-time');
    if (matches.size > 1) throw new RsvpTimeContractError('rsvp-time/ambiguous-local-time');
    return new Date([...matches][0]);
}

function createZonedFormatter(timeZone) {
    return new Intl.DateTimeFormat(FORMAT_LOCALE, {
        timeZone,
        calendar: 'gregory',
        numberingSystem: 'latn',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23'
    });
}

function readZonedParts(formatter, instant) {
    const values = {};
    formatter.formatToParts(new Date(instant)).forEach(({ type, value }) => {
        if (['year', 'month', 'day', 'hour', 'minute', 'second'].includes(type)) values[type] = Number(value);
    });
    return values;
}

function sameLocalTime(left, right) {
    return left.year === right.year
        && left.month === right.month
        && left.day === right.day
        && left.hour === right.hour
        && left.minute === right.minute
        && left.second === right.second;
}
