// Runs once when the server process starts: the 0-24 engine (live polling, monitor
// scans, morning brief, spend guard) starts right away – not only when someone opens the app.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.OCP_ENGINE === "off") return;
  const { ensureLivePoller } = await import("./lib/live");
  ensureLivePoller();
  console.log("[ocp] 0-24 engine started");
}
