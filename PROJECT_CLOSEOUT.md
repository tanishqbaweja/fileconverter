# Original-scope closeout plan

This is an execution order, not a completion claim or a calendar promise. The
original specification and `REMAINING_WORK.md`'s 54 requirement rows remain the
acceptance contract. Private engines are not public supported profiles.

## 1. Finish the current media qualification path

1. Observer starvation and teardown sequencing are now corrected in the actual
   first1080p128+MiB path:2correctness PASS,2247samples/0unavailable, all cleanup
   phases PASS. The revealed real memory result still FAILS365.15625MiB. Identify
   the short-lived248.88MiB Chromium child born at browser age180.356s, using
   bounded birth-matched metadata capture. Existing blank control has a similar
   burst at181.252s with no input/conversion, a lead rather than a proven cause.
   Do not raise the baseline, delay measurement, omit that process or rebuild
   unchanged codecs on the strength of the correlation. Retain exact quality,
   full-tree250MiB and null unavailable samples throughout the correction.
   The changed blank-page capture now identifies a matching startup burst as
   `on_device_model.mojom.OnDeviceModelService` (247.289MiB, exact native birth,
   no app/input). The original conversion child remains unknown in its historical
   report and its365.15625MiB result remains failed; no browser flags/prefs,
   measurement delay, baseline increase or process exclusion has been applied.
2. Implement bounded, lossless memory-sample journaling before tests that can
   exceed the current 6,000-sample in-memory ceiling. A smaller ring that silently
   drops peaks is not a substitute. Validate journal completeness and actual
   readback/peak calculation without retaining media.
   Reuse `native-memory-peaks.mjs` for bounded phase/graph summaries and preserve
   `durable-native-memory-journal.mjs`'s honest crash-checkpoint-only scope. Its
   coalesced snapshots are not an existing lossless raw-sample journal.
   Implemented2026-10-23: scale harness now uses a single-append NDJSON stream,
   existing full-stream peak tracker,3,000sample diagnostic tail and verified gzip
   replay before raw removal.7,001synthetic records and29actual Windows Node-tree
   samples pass; this is not browser stress/memory acceptance. Fresh production
   browser execution of the changed harness and large-source qualification remain.
3. Qualify progressively larger real sources, including >4GB and approaching
   10GB, through the same production coordinator/worker/disk-output path. Check
   disk/RAM first; preserve `test.mkv`. Delete each owned output/fixture after its
   independent validation, including failures. Compare size/memory/time graphs.
4. Complete final selector, planner, options, stream/metadata disclosures and
   terminal/recovery integration for qualified VP8/VP9 and MPEG-2 paths. Reuse the
   already-passed matching native, small-repeat and MPEG-2 full-original gates;
   rerun only coverage affected by the integration or a changed engine.
   Production immutable-code integration now passes its three small actual jobs
   at bac29ef: identical independently validated outputs, manifest each job/code
   once, full-tree239.5703125MiB, owned cleanup and original hash verified. This
   closes that integration smoke only; recovery, original/large-source scaling,
   planner/settings/disclosures and public promotion remain open. Do not replay
   this completed small gate unchanged or infer a causal speedup from warm jobs.
   Small production cancellation/write-failure recovery now also passes at
   5e67254: real Cancel button during native I/O, both failures preserve existing
   destination/delete stage/retire worker, and two retries independently validate.
   Complete-tree227.23828125MiB; one loaded null sample retained, no conversion
   missing samples. Quota/permission/reload/batch, full-original/large-source,
   planner/settings/disclosures and broader browser qualification remain open.
   Backend stream planning now also passes at a35654e: actual MPEG-2/AAC-copy
   plan before valid conversion and actual AV1 no-decoder rejection before
   codec/destination work; identical independently validated output and full-tree
   228.71484375MiB. Unknown companion compatibility remains a native check, not
   an invented preservation claim. Final private selector/options, broader
   preservation and original/scale/browser gates remain open; do not replay the
   completed tiny planning check unchanged.
   One private selector/plan/actual Convert-button flow now passes at ca797b2:
   genuine12s HEVC-to-MPEG-2 with AAC copying,288 independently checked frames,
   full-tree238.3359375MiB and verified cleanup. Private qualification profiles
   have a separate collection in the same registry, are never automatic
   fallbacks and remain hidden from normal public selection. Headless directory
   adapter is not native OS-picker/manual coverage; options, broader private UI
   failure/batch/preservation and original/scale/browser gates remain open.
   Requested controls subsequently reached native settings correctly but resize
   failed EFBIG. Actual avutil probe reproduced stale side-data accumulation on
   the reused scaler frame; bounded replacement passed1000synthetic iterations
   without changing pixels, metadata limits or B-picture policy. New reversible
   native build+actual Wasm probe is the next gate, followed by one changed
   production controls run. This is not yet browser repair/control qualification.
   Oct24 changed browser run now validates both default and requested resized/
   FPS/bitrate/quality outputs, but fails whole-tree274.25390625MiB. Peak predates
   requested control case and is dominated by renderer/GPU growth. Resize EFBIG
   correctness is repaired; memory/UI-controls/public qualification remains open.
   Diagnose the captured renderer/GPU growth with one bounded observer control;
   do not rebuild native unchanged or repeat the same acceptance run blindly.

Exit evidence: B03/B04/B06 applicable original gates and public promotion
checklist all satisfied. The 36 small VPX conversions and six MPEG-2 full-original
conversions are existing evidence, not tasks to repeat unchanged.

## 2. Close the remaining capability gaps

| Blocker | Remaining decision/work | Exit evidence |
| --- | --- | --- |
| B02/B03 | Fresh H.264/AV1/MPEG-2 output, AV1 software decode and legally conditional HEVC; remaining named practical combinations. | Reuse each exact candidate's recorded diagnosis. Implement and qualify the production route, or document an exact measured technical/quality/memory/legal unsupported decision. A build, packet copy or failed first attempt does not close a fresh encoding requirement. |
| B05 | Broader representable audio fields and destination artwork. | Reuse the private 25-field text-preservation result; finish memory-safe production integration, independent field/art comparisons, accurate destination exclusions and applicable stress/recovery gates. Do not repeat unchanged stock-loss demonstrations. |
| Full audit | Remaining image/RAW/HEIF, archive, subtitle, ebook, data and office requirements. | Reconcile every applicable original named item with its current implementation/validated evidence or defensible exact unsupported decision. Existing representative support must not be treated as every theoretical format pair. |

Do not narrow the scope to today's public registry. Do not label a profile
unsupported solely to end an inconvenient investigation.

## 3. Release qualification and handoff

1. B07: final changed flows on practically available current Chrome, Edge, Brave
   and Opera, headless only. Record missing browsers/features and unperformed
   manual/OS-dialog coverage accurately. Include direct destination, storage,
   permissions, batch, reload, cancellation and write-failure cleanup.
2. B08: current dependency/security reachability review and proportionate fixes;
   coherent final lint, TypeScript, build, portable units, browser conversion,
   independent validators, privacy/offline, registry and source/artifact-matched
   published-engine reproducibility gates. No Docker or blind dependency fixes.
3. B09: reconcile all 54 original requirement rows, README/UI/registry/tests and
   recorded limitations. Verify original size/SHA, zero disposable owned media,
   pushed remote commit, and exact memory/throughput/browser results.

## Rules that prevent another open-ended test loop

- Before each expensive run, record the exact missing exit evidence or changed
  hypothesis it will test. A previous failure alone is not a rerun justification.
- Bind every result to executed source, engine, browser, settings and input;
  preserve historical results without pretending they qualify changed code.
- Diagnose a failed gate with bounded evidence, then make an evidence-directed
  change. Do not alternate unchanged builds, traces and controls indefinitely.
- Stop starting further conversions after known observation failure. Preserve
  the error and attempt all safe owned cleanup phases; never delete a live or
  ownership-unverified profile to make the cleanup check pass.
- Keep a passing gate closed until a relevant dependency changes. Update
  `TESTED.md` and `REMAINING_WORK.md` after a meaningful cycle.
- Compare speed on identical inputs/settings with correctness, fidelity,
  privacy, memory and cleanup unchanged. Do not claim a provable global fastest
  implementation or use native conversion in place of browser execution.
- Use the previous actual runtime to estimate waits. Avoid short-interval
  manual polling; notifications should concern a result, failure or needed action.

A defensible finish-date estimate requires the remaining codec feasibility and
large-file memory gates to be resolved. Until then, "several more weeks,
potentially longer" is only a low-confidence planning judgment.
