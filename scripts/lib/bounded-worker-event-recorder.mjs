// Node-side diagnostic history only. No Worker objects or file data retained.
export function createBoundedWorkerEventRecorder() {
  const events = [], roles = { codec: { created: 0, closed: 0, active: 0, maximumActive: 0 },
    save: { created: 0, closed: 0, active: 0, maximumActive: 0 } };
  let totalEvents = 0, evictedEvents = 0, firstError = null;
  return { events,
    record(row) {
      // An asynchronous event callback must never kill Node before finally.
      // Unexpected records still fail the test at its next awaited safe boundary.
      try {
        if (!row || !Object.hasOwn(roles, row.role) || !["created", "closed"].includes(row.event) ||
          typeof row.url !== "string" || row.url.length > 512 || !Number.isSafeInteger(row.observedAt) || row.observedAt < 0 || totalEvents >= 1000000)
          throw new Error("Invalid or excessive owned worker diagnostic event");
        const role = roles[row.role];
        if (row.event === "closed" && role.active === 0) throw new Error("Owned worker close without matching creation");
        role[row.event]++; role.active += row.event === "created" ? 1 : -1; role.maximumActive = Math.max(role.maximumActive, role.active);
        totalEvents++; if (events.length === 32) { events.shift(); evictedEvents++; }
        events.push({ role: row.role, event: row.event, url: row.url, observedAt: row.observedAt }); return true;
      } catch (error) { firstError ??= String(error.message).slice(0, 512); return false; }
    },
    summary: () => ({ maximumHistoryRecords: 32, totalEvents, retainedEvents: events.length, evictedEvents,
      roles: { codec: { ...roles.codec }, save: { ...roles.save } }, firstError, retainsWorkerObjects: false }),
  };
}
