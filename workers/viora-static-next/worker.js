export default {
  async fetch(request, env) {
    // Prefer the versioned repository assets. Delegate everything not included
    // in this deployment to the existing Worker, preserving legacy routes and
    // the complete current asset catalogue during staged rollout.
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404) return response;
    return env.LEGACY.fetch(request);
  }
};
