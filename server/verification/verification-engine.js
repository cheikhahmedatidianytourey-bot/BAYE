// BAYE Verification Engine — deterministic scenario runner (local test harness).
// This runner observes tests; it does not execute arbitrary production workloads.
export function createVerificationEngine({ maxScenarios = 100, maxScenarioDurationMs = 5000 } = {}) {
  if (!Number.isSafeInteger(maxScenarios) || maxScenarios < 1 || maxScenarios > 1000) throw new TypeError('Invalid scenario bound.');
  if (!Number.isSafeInteger(maxScenarioDurationMs) || maxScenarioDurationMs < 1 || maxScenarioDurationMs > 30000) throw new TypeError('Invalid duration bound.');
  return {
    async run(scenarios = []) {
      if (!Array.isArray(scenarios) || scenarios.length > maxScenarios) throw new TypeError('Scenario list exceeds bound.');
      const reports = [];
      for (const scenario of scenarios) {
        if (!scenario || typeof scenario.name !== 'string' || typeof scenario.run !== 'function') throw new TypeError('Invalid scenario.');
        const startedAt = Date.now();
        let status = 'passed', error = null, timeout;
        try {
          await Promise.race([
            Promise.resolve().then(() => scenario.run()),
            new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Scenario time limit exceeded.')), maxScenarioDurationMs); })
          ]);
        } catch (err) {
          status = 'failed';
          error = String(err?.message ?? err).slice(0, 500);
        } finally { clearTimeout(timeout); }
        reports.push({ name: scenario.name, status, durationMs: Math.max(0, Date.now() - startedAt), error });
      }
      return { total: reports.length, passed: reports.filter(r => r.status === 'passed').length, failed: reports.filter(r => r.status === 'failed').length, reports };
    }
  };
}