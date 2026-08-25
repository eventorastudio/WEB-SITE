import { copyFile, mkdir } from 'node:fs/promises';

const sourceDirectory = new URL('../../shared/', import.meta.url);
const targetDirectory = new URL('../generated/', import.meta.url);
const sharedModules = Object.freeze([
    'checkin-numbering.js',
    'guest-contract.js',
    'event-stats.js',
    'rsvp-access-contract.js',
    'rsvp-response-contract.js',
    'rsvp-operations-contract.js',
    'calendar-ics.js'
]);

await mkdir(targetDirectory, { recursive: true });
await Promise.all(sharedModules.map((fileName) => copyFile(
    new URL(fileName, sourceDirectory),
    new URL(fileName, targetDirectory)
)));
