import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const firebaseCli = resolve('node_modules/firebase-tools/lib/bin/firebase.js');
const environment = {
    ...process.env,
    FIREBASE_FUNCTIONS_DISCOVERY_OUTPUT_PATH: 'true'
};
delete environment.DEBUG;
const allowedTestFiles = new Set([
    'tests/firebase-functions-phase55.emulator.mjs',
    'tests/firebase-functions-phase56.emulator.mjs'
]);
const requestedTestFiles = process.argv.slice(2);
const testFiles = requestedTestFiles.length > 0
    ? requestedTestFiles
    : [...allowedTestFiles];
if (testFiles.some((file) => !allowedTestFiles.has(file))) {
    throw new Error('phase-functions/invalid-test-file');
}

const child = spawn(process.execPath, [
    firebaseCli,
    'emulators:exec',
    '--project',
    'demo-eventorastudio-phase55',
    '--only',
    'firestore,functions',
    `node --test ${testFiles.join(' ')}`
], {
    cwd: process.cwd(),
    env: environment,
    stdio: 'inherit',
    shell: false
});

child.once('error', (error) => {
    console.error(error);
    process.exitCode = 1;
});

child.once('exit', (code, signal) => {
    if (signal) {
        console.error(`Firebase Emulator terminó por señal ${signal}.`);
        process.exitCode = 1;
        return;
    }
    process.exitCode = code ?? 1;
});
