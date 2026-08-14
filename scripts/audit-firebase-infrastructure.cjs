#!/usr/bin/env node
'use strict';

const auth = require('../node_modules/firebase-tools/lib/auth');
const { requireAuth } = require('../node_modules/firebase-tools/lib/requireAuth');
const rulesApi = require('../node_modules/firebase-tools/lib/gcp/rules');
const storageApi = require('../node_modules/firebase-tools/lib/gcp/storage');
const appCheckApi = require('../node_modules/firebase-tools/lib/appcheck/api');
const { Client } = require('../node_modules/firebase-tools/lib/apiv2');
const { storageOrigin } = require('../node_modules/firebase-tools/lib/api');

const ALLOWED_PROJECT = 'eventorastudio-d6d95';
const PROJECT_NUMBER = '485518462661';
const WEB_APP_ID = '1:485518462661:web:3902d536f6a2a11184aaac';

function selectedProject(argv) {
    const index = argv.indexOf('--project');
    const project = index >= 0 ? argv[index + 1] : '';
    if (project !== ALLOWED_PROJECT) {
        throw new Error(`audit/project-must-equal-${ALLOWED_PROJECT}`);
    }
    return project;
}

async function authenticate(project) {
    const account = auth.getGlobalDefaultAccount();
    if (!account) throw new Error('audit/firebase-login-required');
    const options = { project, user: account.user, tokens: account.tokens };
    auth.setActiveAccount(options, account);
    await requireAuth(options);
    return account.user.email;
}

async function activeRules(project, releaseId, releases) {
    const rulesetName = await rulesApi.getLatestRulesetName(project, releaseId, releases);
    const release = releases.find(({ name }) => name.startsWith(`projects/${project}/releases/${releaseId}`)) ?? null;
    return {
        release,
        rulesetName,
        files: rulesetName ? await rulesApi.getRulesetContent(rulesetName) : []
    };
}

async function summarizeBucket(bucket) {
    const client = new Client({ urlPrefix: storageOrigin() });
    const objects = [];
    let pageToken = '';
    do {
        const response = await client.get(`/storage/v1/b/${encodeURIComponent(bucket.name)}/o`, {
            queryParams: {
                maxResults: 1000,
                ...(pageToken ? { pageToken } : {})
            }
        });
        for (const item of response.body.items ?? []) {
            objects.push({
                name: item.name,
                size: Number(item.size ?? 0),
                contentType: item.contentType ?? null,
                timeCreated: item.timeCreated ?? null
            });
        }
        pageToken = response.body.nextPageToken ?? '';
    } while (pageToken);

    const prefixCounts = {};
    for (const object of objects) {
        const prefix = object.name.split('/')[0] || '(root)';
        prefixCounts[prefix] = (prefixCounts[prefix] ?? 0) + 1;
    }
    return {
        name: bucket.name,
        location: bucket.location ?? null,
        storageClass: bucket.storageClass ?? null,
        uniformBucketLevelAccess: bucket.iamConfiguration?.uniformBucketLevelAccess?.enabled ?? null,
        versioningEnabled: bucket.versioning?.enabled ?? false,
        objectCount: objects.length,
        prefixCounts,
        objects
    };
}

async function appCheckState() {
    const services = await appCheckApi.listServices(PROJECT_NUMBER);
    let provider;
    try {
        const config = await appCheckApi.getProviderConfig(PROJECT_NUMBER, WEB_APP_ID, 'recaptcha-v3');
        provider = {
            configured: true,
            name: config.name ?? null,
            tokenTtl: config.tokenTtl ?? null,
            hasSiteSecret: Boolean(config.siteSecret)
        };
    } catch (error) {
        provider = {
            configured: false,
            error: error?.message ?? String(error)
        };
    }
    return {
        webAppId: WEB_APP_ID,
        provider,
        services: services.map(({ name, enforcementMode, replayProtection, updateTime }) => ({
            name,
            enforcementMode: enforcementMode ?? null,
            replayProtection: replayProtection ?? null,
            updateTime: updateTime ?? null
        }))
    };
}

async function main() {
    const project = selectedProject(process.argv.slice(2));
    const account = await authenticate(project);
    const releases = await rulesApi.listAllReleases(project);
    const buckets = await storageApi.listBuckets(project);
    const result = {
        auditedAt: new Date().toISOString(),
        project,
        projectNumber: PROJECT_NUMBER,
        account,
        rules: {
            firestore: await activeRules(project, 'cloud.firestore', releases),
            storage: await activeRules(project, 'firebase.storage', releases)
        },
        storage: await Promise.all(buckets.map(summarizeBucket)),
        appCheck: await appCheckState()
    };
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
    console.error(error?.stack ?? error);
    process.exitCode = 1;
});
