import { stdin, stdout } from 'node:process';
import { OPERATION_ID_PATTERN, validateOperationId } from '../functions/operator/refund-purge-adapter.js';

export function assertCliArgs(args) {
    if (args.length !== 1 || args[0].startsWith('-')) throw new Error('USAGE: node scripts/refund-purge-operator.mjs OPERATION_ID');
    return validateOperationId(args[0]);
}

export function confirmationPrompt(operationId) {
    return [
        'PRIVATE OPERATOR EXECUTION (local client design only)',
        `operationId: ${operationId}`,
        'No eventId, Storage path, manifest, force or bypass options are accepted.',
        `Type exactly: EXECUTE ${operationId}`
    ].join('\n');
}

export async function requestConfirmation(operationId, input = stdin, output = stdout) {
    if (!input.isTTY || !output.isTTY) throw new Error('INTERACTIVE_CONFIRMATION_REQUIRED');
    output.write(`${confirmationPrompt(operationId)}\n> `);
    let value = '';
    for await (const chunk of input) value += chunk;
    if (value.trim() !== `EXECUTE ${operationId}`) throw new Error('CONFIRMATION_REQUIRED');
    return true;
}

if (import.meta.url === `file://${process.argv[1]?.replaceAll('\\', '/')}`) {
    try {
        const operationId = assertCliArgs(process.argv.slice(2));
        await requestConfirmation(operationId);
        throw new Error('PRIVATE_BACKEND_NOT_DEPLOYED');
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
