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
