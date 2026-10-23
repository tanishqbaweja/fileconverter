# Native memory journals (test infrastructure)

Long private scale tests use `lossless-native-memory-journal.mjs` to retain every
native process-tree sample on disk. This is measurement infrastructure outside
Chromium, not a conversion engine or a change to the 250 MiB acceptance formula.

Each NDJSON record contains the observer CPU counter and one complete native
sample, including acquisition time, sequence, all processes and their birth
identities, private/RSS bytes, phase, and unavailable readings. Unknown processes
still count. Missing memory remains null. Sequence loss, overflow, root PID reuse,
invalid totals and disk errors fail; concurrent appends are refused, not queued
or coalesced.

There is one pending append batch (at most 256 samples) and one encoded record
(at most 256 KiB). Replay and gzip use 64 KiB chunks, without loading the journal
or collecting its chunks. The raw-log cap is 8 GiB; it is not a media-size limit.
The existing `native-memory-peaks.mjs` supplies bounded phase/graph summaries and
the actual simultaneous full-tree peak. Its limits remain 512 process identities,
128 phases, 256 transitions and 4,096 recent graph buckets. Eviction never removes
phase peaks, and the lossless journal still retains every raw row.

The scale harness keeps only a 3,000-sample diagnostic tail in RAM. That tail is
never the scale-run peak source. The denominator remains the original lower
stable clean-blank baseline, and journal coverage must extend through the actual
final conversion. The old `durable-native-memory-journal.mjs` remains an honest
coalesced crash checkpoint, not a lossless journal or terminal acceptance proof.

After the observer closes, raw data is streamed into a fresh gzip archive. Every
row, count, checksum and peak is independently replayed before the owned raw file
is removed. Incomplete/error data may be compressed and byte-verified for diagnosis,
but `complete: false` prevents it being accepted as a complete native replay.
Complete records alone do not prove that a whole conversion was observed.

On Windows, run the short OS-pipeline check with:

```powershell
node scripts/run-repository-owned-node.mjs scripts/qualify-lossless-native-journal.mjs
```

It observes its owned Node process tree, not Chromium. It creates no media, reads
no original video, and removes its owned scratch in cleanup. The retained JSON
and gzip go under `output/playwright`. The 7,001-record unit is generated metadata,
not a 7,001-frame conversion or multi-gigabyte media test. Neither test closes
the existing installed-Chrome 365.15625 MiB failure, qualifies a public route, or
proves near-10GB scaling. A fresh full browser qualification remains required.
