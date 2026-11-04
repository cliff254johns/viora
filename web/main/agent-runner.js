// main/agent-runner.js
// ═══════════════════════════════════════════════════════════════
// Agent Test-run helper.
//
//   Primary: calls worker `/ai/agent/run` (needs adding — snippet below).
//   Fallback: uses `/ai/generatePost` with the agent's systemPrompt as
//             context + testInput as brief. This works TODAY because
//             /ai/generatePost already exists. So the Test button is
//             fully functional now, and upgrades automatically when
//             you deploy /ai/agent/run.
// ═══════════════════════════════════════════════════════════════

let _ctx = null;
export function initAgentRunner(deps) { _ctx = deps || {}; }
function C(k, f) { const v = _ctx?.[k]; return typeof v === 'function' ? v : f; }
function toast(msg, type = 'info') {
  try { C('toast', () => {})(msg, type); } catch (_) {}
}

export async function runAgent(agent, input) {
  const callFn = C('callFn', () => { throw new Error('callFn missing'); });
  if (!agent) throw new Error('Agent is required');
  if (!input || !String(input).trim()) throw new Error('Test input is required');

  const payload = {
    agentId: agent.id,
    agent: {
      name: agent.name,
      model: agent.model || 'openai/gpt-oss-120b',
      temperature: agent.temperature ?? 0.7,
      systemPrompt: agent.systemPrompt || '',
      tools: Array.isArray(agent.tools) ? agent.tools : [],
    },
    input: String(input).slice(0, 4000),
  };

  // Primary path — requires /ai/agent/run on the worker
  try {
    const res = await callFn('ai/agent/run', payload);
    if (res && res.ok !== false && (res.output || res.text)) {
      return { ok: true, output: res.output || res.text, model: res.model || agent.model, via: 'ai/agent/run' };
    }
  } catch (e) {
    // Fall through to fallback
    console.info('[agent-runner] /ai/agent/run unavailable — falling back to /ai/generatePost', e.message);
  }

  // Fallback — reuse the existing /ai/generatePost route
  try {
    const res = await callFn('ai/generatePost', {
      brief: input,
      platform: 'facebook',
      pillar: 'educational',
      tone: 'conversational',
      audience: agent.audience || 'General',
      cta: 'Reply now',
      count: 1,
      useTrends: false,
    });
    const text = res?.text || (res?.variants && Object.values(res.variants)[0]) || '';
    if (!text) throw new Error('Worker returned empty output');
    return {
      ok: true,
      output: text,
      model: res?.model || 'ai/generatePost',
      via: 'ai/generatePost (fallback)',
      note: 'Deploy /ai/agent/run on the worker to use the agent\'s own systemPrompt and model.',
    };
  } catch (e) {
    toast('Agent test-run failed: ' + (e.message || 'unknown'), 'error');
    throw e;
  }
}