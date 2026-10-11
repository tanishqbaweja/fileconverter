# Conversion watching

User instruction: estimate the remaining conversion time, then use an interruptible
sleep timer for that estimate. Do not repeatedly consume chat/tool turns checking
the same running conversion every few seconds.

Before waiting, state the estimate and its basis: actual processed media duration,
records or bytes and measured throughput, or a previous comparable run with the
same input/settings. An estimate is not a completion guarantee; distinguish
conversion time from any remaining validation or repeat runs.

Use the product's interruptible sleep timer. On waking, check the existing run
once. If it is still running, update the estimate from real progress and sleep
again. If an estimate is not meaningful yet, choose and disclose a conservative
wait based on a comparable run instead of rapid polling. Never restart the run
merely because the timer or a tool wait expired. User input may interrupt sleep.

This limits agent-level status checks, not the test's required bounded background
memory/progress sampling, privacy guards, cancellation, or failure cleanup. Those
must keep running autonomously to catch peaks and enforce the unchanged safety
and correctness constraints. Do not send repetitive unchanged status updates
while sleeping. Keep browser and subprocess tasks headless and repository-owned.
