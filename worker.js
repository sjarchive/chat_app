export default {
  async fetch(request, env) {
    // For now, just serve the static PWA files.
    // The push-notification API route will be added here in the next step.
    return env.ASSETS.fetch(request);
  },
};
