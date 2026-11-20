# Current project checkpoint

Updated 2026-11-20. Read this first after resuming; then follow the cited receipts.
This is a navigation/checkpoint document, not a replacement for the complete
specification or [requirement audit](REMAINING_WORK.md). The goal is NOT complete.

## Current capability increment: private DOCX hyperlinks

Implemented and small production-browser qualification PASS, still private.
Explicit HTTP/HTTPS/mailto links, escaped tooltips and bookmark positions retain
text/emphasis without fetching targets. Unsafe/relative/package links keep
inactive text with a content-free warning. Relationship metadata caps at1MiB/
4096entries/1024links; bookmark names/references cap4096each;64KiB backpressured
output unchanged. Nested links reject; frame/history/docLocation, field-code
links and Word's missing-bookmark fallback are not reproduced.

[Actual receipt](evidence/2026-11-20T11-26-08-834Z-docx-html-qualification.json):
37,974B genuine python-docx package -> four identical211,913B HTML outputs.
Chrome158.0.8127.36 headless, three same-page repeats plus payload cancellation,
injected write failure and exact recovery. Independent hardcoded10-link semantic
oracle verifies targets, text, tooltips, emphasis, forward/backward bookmarks and
nested tables; nine rejecting validator mutations. Peak84.23828125MiB over SAME
blank,445valid/0missing active samples; complete795-row native journal retained.
Cleanup max30.62109375MiB over original loaded idle.36static requests/0forbidden;
48observed owned PIDs absent, owned files/profile/runtime/server removed, original
test.mkv pre/post full SHA/size unchanged. No public promotion, large-link scaling,
native picker/external drive, headed/manual, full Word fidelity or speedup claim.

The first11:24:08Z runner failed before launching Chrome because Python's Windows
cp1252 output could not print the Unicode reference; retained zero-case failure,
owned runtime removed. Explicit UTF-8 fixed the helper. Earlier unit8/9 fixture
failure was corrected to exercise image-vs-hyperlink type, not missing styles;
no safety guard weakened.96related and61overlapping checks PASS; after strengthened
caps/actual-evidence checks,14/14 PASS. Build/TypeScript/scoped lint PASS. Portable
snapshot **2917/2917 PASS**,0fail/skip/cancel,111559.0123ms/784selected files;
164 prerequisite qualification files not run. The new evidence-test file and
strengthened cap assertions were verified separately in the14checks, not claimed
as part of that earlier inventory snapshot. All32 browser source pins freshly
reverified;402-entry public evidence audit PASS. Final checkpoint:
[DOCX hyperlink verification](evidence/2026-11-20-docx-hyperlinks-checkpoint.json).

Next distinct DOCX gate: scale repeated link IDs and bookmark references on the
existing genuine large-document sizes with the current model, same real handle
writer, repeat/cleanup/fresh-session and memory thresholds. Do not replay the
unchanged no-link/emphasis controls as evidence of hyperlink scaling.

## Current critical path

The corrected private MKV-to-MP4 core preserves the complete original's packets,
timestamps, decoded video and audio. Its production-staged repeat gate is still
FAILED: first two full outputs validated, third job reached **405.11328125 MiB**
above the SAME original blank, over the unchanged **250 MiB** whole-tree limit.
The route is withheld from public selection; withdrawal is not implementation
completion. No validated third output or clean-session repeat pass exists.

[Reconciled diagnosis](evidence/2026-11-17-mkv-staged-attribution-reconciliation.json):
the exact native birth of the large child was classified by the already-retained
observer as Chrome's on-device model service. The separate later census missed
it. Both observations remain preserved. At the overall peak the child accounts
for 289.3125 MiB, INCLUDED in acceptance. App-triggered service allocation is not
proven. With this same child, passing would require the rest of the tree to fall
39.3125 MiB BELOW the original blank; a saver micro-optimization is not evidence
of such a reduction. Do not exclude the child, disable services, raise limits,
rebase the blank, or rerun the unchanged failed configuration.

The classifier helper was missing from the original receipt's transitive source
pins. Its tracked bytes at the recorded executed commit match current bytes;
this is disclosed, not retroactively called a runtime pin. Future MKV runs now
pin the classifier and native observer directly. Current reporting reconciles
both witnesses; original raw JSON/native journal/historical HTML are untouched.

## Last optimization decision: REJECTED

Holding one writable-stream writer for the entire final stage copy did not
improve the actual saver screen. Interleaved baseline/candidate/candidate/
baseline/baseline/candidate, 256 MiB minus 17 bytes per copy, all six full hashes
identical: baseline median **1586.84 ms**, candidate **1590.01 ms** (0.20% slower).
The proposed runtime was removed; production saver remains byte-identical to
commit 4093c44f. This is isolated saver I/O, NOT a video conversion speed test.
The initial worker-header setup failure is retained separately, not a passing
copy. [Actual comparison](evidence/2026-11-16T23-24-56-258Z-staged-writer-control.json).
Do not retry this candidate unchanged or claim it speeds up conversion.

## Previous completed capability increment

Private bounded DOCX list-numbering preservation: genuine production-browser
small-repeat/cancellation/write-error/recovery proof, 83.296875 MiB peak; still
not full Word fidelity, large-list scaling, external-drive/manual qualification
or public promotion. [Checkpoint](evidence/2026-11-16-docx-numbering-checkpoint.json).
Its historical whole-portable result is 2887/2887; that count does NOT include
new tests added after that checkpoint.

## Next distinct work and stop rules

Historical November17 checkpoint verification: **39/39 PASS**, zero skips/failures,
11.60 seconds, including unchanged saver and historical TypeScript overlay
checks, actual archived comparison/attribution and ledger-history preservation.
Affected lint PASS. No full portable/build/browser rerun or release pass claimed.
Post-review malformed-witness guards: all 10 affected checks and affected lint PASS.
Exact command and file list: [verification receipt](evidence/2026-11-17-current-checkpoint-verification.json).

1. Use the reconciled native-birth evidence rather than repeat the diagnosis.
   No large browser replay is needed to authenticate these retained data.
2. Before any further MKV stress run, identify an implementation or environment
   change genuinely allowed by the unchanged constraints. Faster writer copies
   alone cannot resolve the observed service-sized excess. Additional required
   browser coverage must not replace the failed Chrome acceptance gate.
3. Continue a concrete open implementation from M-04/M-08/M-09/N-08 in the full
   audit while the Chrome repeat condition remains unresolved; inspect its last
   failed hypothesis before choosing a different one. Keep broader stream and
   metadata preservation, real encoding, CPU fallback, image/document coverage,
   scaling, compatibility and release/reproducibility gates in scope.

For every experiment, record hypothesis, exact change/input/settings, result,
decision, cleanup and next action BEFORE starting another experiment. Retain
failures; never replay an expensive test solely because chat context was lost.
Update this short file plus the manual block of [TESTED.md](TESTED.md) and the
[full audit](REMAINING_WORK.md) after meaningful cycles. Preserve older history.

## Safety and evidence boundaries

Headless only; no Docker; no unrelated application/service termination. All
generated media, profiles and scratch stay in approved repository directories
and disposable owned data is removed in finally. Preserve test.mkv exactly.
The saver screen's six owned source/output pairs and both run profiles/runtimes
were removed according to the retained cleanup receipts. No conversion, browser
launch or test.mkv mutation was performed by the attribution reconciliation.
Headed/manual and native-picker/external-drive coverage remain unverified.
