import test from 'node:test';
import assert from 'node:assert/strict';
import { buildScheduledJobs, runScheduledJobs } from '../../workers/viora-api/scheduled-jobs.js';

const handlers = Object.fromEntries([
  'reminders',
  'social_queue_prepare',
  'social_publish',
  'outreach_inbox_sync',
  'outreach_campaign_scheduler',
].map(name => [name, () => name]));

test('social scheduled jobs remain enabled when email automation is unset', () => {
  const jobs = buildScheduledJobs({}, handlers);
  assert.deepEqual(jobs.map(([name]) => name), [
    'reminders',
    'social_queue_prepare',
    'social_publish',
  ]);
});

test('false and non-true email opt-in values never schedule email jobs', () => {
  for (const value of [false, 'false', '1', 'yes', undefined, null]) {
    const jobs = buildScheduledJobs({ ENABLE_OUTREACH_EMAIL_AUTOMATION: value }, handlers);
    assert.deepEqual(jobs.map(([name]) => name), [
      'reminders',
      'social_queue_prepare',
      'social_publish',
    ]);
  }
});

test('email inbox and campaign jobs are added only by explicit true opt-in', () => {
  const jobs = buildScheduledJobs({ ENABLE_OUTREACH_EMAIL_AUTOMATION: 'TRUE' }, handlers);
  assert.deepEqual(jobs.map(([name]) => name), [
    'reminders',
    'social_queue_prepare',
    'social_publish',
    'outreach_inbox_sync',
    'outreach_campaign_scheduler',
  ]);
});

test('social publishing handler is retained in every scheduler mode', () => {
  for (const env of [{}, { ENABLE_OUTREACH_EMAIL_AUTOMATION: false }, { ENABLE_OUTREACH_EMAIL_AUTOMATION: true }]) {
    const jobs = buildScheduledJobs(env, handlers);
    const social = jobs.find(([name]) => name === 'social_publish');
    assert.equal(typeof social?.[1], 'function');
  }
});

test('scheduled jobs execute in order and continue after an individual failure', async () => {
  const events = [];
  const errors = [];
  const jobs = [
    ['reminders', async () => { events.push('reminders'); throw new Error('reminder failure'); }],
    ['social_queue_prepare', async () => { events.push('social_queue_prepare'); }],
    ['social_publish', async () => { events.push('social_publish'); }],
  ];
  await runScheduledJobs(jobs, (job, error) => errors.push({ job, message: error.message }));
  assert.deepEqual(events, ['reminders', 'social_queue_prepare', 'social_publish']);
  assert.deepEqual(errors, [{ job: 'reminders', message: 'reminder failure' }]);
});

test('scheduled task failures are logged without rejecting the whole run', async () => {
  const events = [];
  await assert.doesNotReject(runScheduledJobs([
    ['first', async () => { throw new Error('isolated'); }],
    ['second', async () => { events.push('second'); }],
  ], () => {}));
  assert.deepEqual(events, ['second']);
});

import { readFile } from 'node:fs/promises';

test('Facebook publishing claims use Firebase ETags and do not auto-retry ambiguous outcomes', async () => {
  const [source, worker] = await Promise.all([
    readFile(new URL('../../workers/viora-api/social-publish.js', import.meta.url), 'utf8'),
    readFile(new URL('../../workers/viora-api/index.js', import.meta.url), 'utf8'),
  ]);
  assert.match(source, /export async function claimScheduledCampaignPost/);
  assert.match(source, /X-Firebase-ETag': 'true'/);
  assert.match(source, /'If-Match': etag/);
  assert.match(source, /post\.status = 'publish_uncertain'/);
  assert.match(source, /reconciliationRequired = true/);
  assert.match(source, /Previous publish claim expired[\s\S]*automatic retry blocked/);
  assert.doesNotMatch(source, /retrying stuck post/);
  assert.match(worker, /uncertain: true, error: 'Facebook request outcome unknown/);
  assert.match(worker, /graph\.facebook\.com\/v27\.0/);
  assert.doesNotMatch(worker, /graph\.facebook\.com\/v20\.0/);
});

test('Campaigns account verification reads provider status from the authenticated Worker', async () => {
  const [worker, accounts] = await Promise.all([
    readFile(new URL('../../workers/viora-api/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../../web/main/campaign-accounts.js', import.meta.url), 'utf8'),
  ]);
  assert.match(worker, /async function handleSocialConfigStatus/);
  assert.match(worker, /path === '\/social\/config\/status'/);
  assert.match(accounts, /SAFE\.callFn\('social\/config\/status'/);
  assert.match(accounts, /serviceStatus\?\.verified/);
  assert.match(accounts, /API credentials missing/);
});

test('every Gmail outbound route and scheduler path fails closed while email sending is off', async () => {
  const source = await readFile(new URL('../../workers/viora-api/index.js', import.meta.url), 'utf8');
  assert.match(source, /function outboundEmailSendingEnabled\(env\)/);
  for (const fn of [
    'sendViaGmail',
    'sendGmailThreadFollowup',
    'sendGmailThreadReply',
    'handleOutreachAutoReply',
    'runOutreachCampaignScheduler',
    'runScheduledOutreachInboxSync',
  ]) {
    const start = source.indexOf('async function ' + fn + '(');
    assert.notEqual(start, -1, fn + ' exists');
    const next = source.indexOf('\nasync function ', start + 1);
    const body = source.slice(start, next < 0 ? start + 5000 : next);
    assert.match(body, /outboundEmailSendingEnabled\(env\)/, fn + ' is guarded');
  }
  const directSend = source.slice(source.indexOf('async function handleSendEmail('), source.indexOf('/* ============================================================\n   ' , source.indexOf('async function handleSendEmail(') + 20));
  assert.match(directSend, /outboundEmailSendingEnabled\(env\)|ENABLE_OUTREACH_EMAIL_SENDING/);
});

test('prospect marketing cannot bypass the compliance campaign queue through direct send', async () => {
  const [worker, outreach] = await Promise.all([
    readFile(new URL('../../workers/viora-api/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../../web/outreach.js', import.meta.url), 'utf8'),
  ]);
  const handlerStart = worker.indexOf('async function handleSendEmail(');
  const handlerEnd = worker.indexOf('\n}', handlerStart);
  const handler = worker.slice(handlerStart, handlerEnd);
  assert.match(handler, /body\.purpose === 'marketing'/);
  assert.match(handler, /body\.source === 'Outreach Centre'/);
  assert.match(handler, /\['service', 'transactional'\]/);
  assert.match(handler, /compliance-checked Outreach campaign queue/);
  assert.match(outreach, /purpose:'marketing',source:'Outreach Centre'/);
  assert.match(outreach, /blockedSend=httpStatus===423\|\|httpStatus===409/);
});

test('scheduled email ledger, comm log and lead history are written atomically', async () => {
  const source = await readFile(new URL('../../workers/viora-api/index.js', import.meta.url), 'utf8');
  assert.match(source, /async function outreachDbMultiWrite/);
  assert.match(source, /method: 'PATCH'/);
  const start = source.indexOf('async function writeOutreachCampaignActivity(');
  const end = source.indexOf('\nasync function runOutreachCampaignScheduler', start);
  const helper = source.slice(start, end);
  assert.match(helper, /outreach\/emails\//);
  assert.match(helper, /commLog\//);
  assert.match(helper, /outreachHistory\//);
  assert.match(helper, /await outreachDbMultiWrite\(env, updates\)/);
  assert.match(helper, /if \(status === 'sent'\)/);
});
