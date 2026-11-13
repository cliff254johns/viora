export async function runScheduledJobs(jobs, onError = (job, error) => {
  console.error(JSON.stringify({
    event: 'scheduled_job_failed',
    job,
    error: String(error && error.message || error).slice(0, 300),
  }));
}) {
  for (const [job, run] of jobs) {
    try {
      await run();
    } catch (error) {
      onError(job, error);
    }
  }
}

export function buildScheduledJobs(env, handlers) {
  const jobs = [
    ['reminders', handlers.reminders],
    ['social_queue_prepare', handlers.social_queue_prepare],
    ['social_publish', handlers.social_publish],
  ];
  if (String(env.ENABLE_OUTREACH_EMAIL_AUTOMATION || '').toLowerCase() === 'true') {
    jobs.push(['outreach_inbox_sync', handlers.outreach_inbox_sync]);
    jobs.push(['outreach_campaign_scheduler', handlers.outreach_campaign_scheduler]);
  }
  return jobs;
}

