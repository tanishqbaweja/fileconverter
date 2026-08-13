# Tested conversion ledger

Updated 2026-08-13 from the capability registry and retained successful Chrome stress reports.

This is the living progress record. It is regenerated after each test/profile cycle so completed work is not repeated or inferred from memory.

## What the labels mean

- **Public passed**: implemented, small production-browser correctness tested, independently validated, cleanup tested, and accepted by the registry.
- **Chrome stress report**: a retained full Chromium process-tree measurement using a real project-local source. Three-run evidence is preferred when multiple reports exist.
- **Not claimed**: formats and features still absent remain listed at the end of this file; passing one route never implies every codec/container combination.

## Current totals

- Public passed conversion profiles: **298**
- Public profiles with a retained successful Chrome stress report: **298**
- PDF profiles: **0** (intentionally prohibited)

## Active optimization log

- **2026-08-12 standalone AAC baseline:** native FFmpeg 8.1.2 encoded the first 300 seconds of the protected HE-AAC source to 48 kHz stereo 192 kb/s AAC-LC ADTS with `aac_coder=fast` in 1.978 s (151.67x realtime, 7,189,807 bytes). The default `twoloop` coder took 5.058 s (59.31x realtime, 7,292,905 bytes), so `fast` was 2.56x quicker and slightly smaller. Independent ASDR measurements were -4.23181 dB for `fast` and -4.23055 dB for `twoloop`, a 0.00126 dB difference. The protected source remained SHA-256 `31F36695B5B44C62125A9E4264E84DC085ACCD21C02CC3487AAE597F54B9DB34`.
- **Rejected validation attempt:** the first ASDR command trimmed the source inside the filter graph but did not bound the output, so FFmpeg continued decoding beyond the five-minute comparison window. It was terminated, replaced with an explicit 300-second output bound, and must not be repeated. Terminating the parent shell left one FFmpeg child holding the AAC output open; cleanup reported `EBUSY`, the exact orphan was identified by its repository-local command line and stopped, and the allowlisted cleanup then removed both outputs. All benchmark media is repository-local under `work/aac-benchmark`.
- **Build-loop correction:** the first foreground Docker build outlived the command runner's timeout, and starting a logged replacement briefly created two identical clients. Their exact command lines were inspected, only the unlogged duplicate was stopped, and the remaining build completed from the shared cache. Future long engine builds must start once as a hidden logged process. A `.tmp.*` export left by the cancelled client is covered by the exact remux-engine cleanup rule.
- **Runner correction:** the first focused Playwright command also reached the command runner's five-second foreground limit, but process inspection confirmed it had exited before a hidden logged replacement was started; no duplicate browser run was created. Long browser gates use one repository-local logged background process from this point forward.
- **Pending-route browser failure:** the first focused AAC browser gate passed 22 established AAC-related cases, then timed out before conversion because the test-only selector could not see `public: false` pending profiles. The remaining identical timeouts were stopped. `publicProfilesFor(input, true)` now includes pending internal routes for `?test=1`, while the normal selector still requires both public and passed evidence.
- **AAC warning-harness failure:** after pending selection was fixed, standalone AAC conversions completed but the shared browser helper expected an extra-stream warning that correctly was not emitted for single-stream audio fixtures. Remaining duplicate failures were stopped; the helper now applies the same standalone-versus-container distinction used by MP3 before independent AAC probing and ASDR validation.
- **Focused-grep correction:** a broad AAC rerun stalled in the already-passed MOV-to-AAC forced-write regression before reaching the new routes, with its timeout unable to fire while the browser worker was blocked. It was stopped instead of repeated. The ten new cases now carry a unique `standalone-aac` marker so iteration exercises only the changed family; established AAC regression results from the first run remain recorded separately.
- **AAC bitrate-validator failure:** the first standalone-only run reached genuine outputs but rejected simple synthetic sources because FFprobe reported observed ADTS averages below 120 kb/s (for example 85,381 b/s for the FLAC tone) despite a configured 128/192 kb/s target. The invalid minimum was removed; validation retains a 220 kb/s ceiling, positive observed rate, AAC-LC, 32/44.1/48 kHz, at most stereo, complete decode, bounded I/O, and ASDR quality.
- **WMA AAC quality comparison:** on the exact four-second WMA2 fixture, `aac_coder=fast` produced 42,493 bytes in 106 ms with channel ASDR -5.98947/7.27727 dB; `twoloop` produced 96,366 bytes in 110 ms with -5.98241/7.2894 dB. The quality delta was only 0.007-0.012 dB, while the simple-source output was 2.27x larger. The long-source benchmark remains the meaningful speed discriminator, so `fast` is retained and the cross-lossy-codec ASDR floor is -6.5 dB. AAC frame/priming duration tolerance remains 0.2 seconds.
- **AAC fixture topology:** the AAC category passes its exact ten required fixture names to the shared concurrent audio generator, avoiding the unrelated 128 MiB raw-AAC fixture. The generator's selectable base-audio outputs now include the previously omitted MP3 stress source, so AAC profiling creates every required source in parallel without depending on leftovers from an earlier category.
- **AAC tool-set optimization:** on the same protected 300-second reference, native `aac_coder=fast` default tools encoded at 145.99x realtime with channel ASDR -4.0545/-4.2318 dB. Disabling TNS alone reached 149.78x; disabling TNS+PNS reached 156.99x; and disabling TNS, PNS, intensity stereo, and M/S stereo reached 165.20x, a 13.2% throughput gain, with slightly improved -4.05091/-4.22938 dB ASDR and only 0.23% size growth. The minimal tool set also retained WMA ASDR (-5.98951/7.2774 dB). It replaces the slower baseline before the remaining Chrome profiles are run.
- **Stopped slow baseline:** the first 36,929,878-byte AAC-in-M4A Chrome baseline passed three runs in 81.92-83.48 seconds at 148.8 MiB incremental private memory, 32 MiB Wasm, 262,144-byte reads, and 552-byte writes. Profiling was intentionally stopped after retaining that report so the remaining 27 runs would not repeat a known slower encoder configuration; generated fixtures and partial work were deleted before optimization.
- **Static-runner correction:** the first optimized-engine static gate invoked a nonexistent `npm run typecheck` alias and ran the Vinext production build concurrently with three other Node jobs. Unit tests and lint passed, but the contended build exhausted its process heap during the RSC stage. This is a test-orchestration failure, not conversion evidence: TypeScript must use the repository's direct compiler command and the production build must run sequentially so unrelated host contention does not invalidate it.
- **Rejected AMR upsampling policy:** the optimized Chrome category passed the AAC-in-M4A and ALAC-in-M4A profiles, then spent about 50 minutes CPU-bound on the 134,229,414-byte, roughly day-long AMR-NB source because the initial policy unnecessarily upsampled 8 kHz mono input to 32 kHz before AAC encoding. The run was intentionally stopped before certifying that known-suboptimal policy. Its two completed reports remain evidence; generated media is cleanup-managed. The next iteration benchmarks and, if quality-valid, preserves AAC's standard 8 kHz source rate to avoid analyzing four times as many samples.
- **AMR sample-rate optimization:** on the first hour of the exact stress AMR source, native AAC-LC at the preserved 8 kHz rate completed in 2.249 s versus 50.340 s at the former 32 kHz rate, a 22.38x speedup. The 8 kHz output was genuine mono AAC-LC, improved 300-second ASDR from -4.24891 to -2.07948 dB, and reduced size from 32,614,741 to 19,336,855 bytes. The converter now preserves all standard AAC rates from 8 through 48 kHz and only rounds nonstandard rates upward or caps rates above 48 kHz, avoiding unnecessary resampling without weakening codec, duration, quality, or compatibility validation.
- **Optimized AMR validator correction:** the first rate-preserving Chrome AMR run reached validation in about four minutes instead of remaining CPU-bound past 50 minutes, then missed the fixed 0.25-second duration tolerance by 0.002 seconds: AAC's two 1,024-sample frames span 0.256 seconds at 8 kHz. Validation now derives its tolerance from the codec frame boundary (`max(0.2 s, 2048 / sample_rate + 0.01 s)`) instead of weakening duration checks arbitrarily. The same failed category cleanup also exposed Windows locking its own redirected log; cleanup now skips only currently locked logs and removes them on the next post-exit cleanup pass, while generated media cleanup continues.
- **2026-08-13 standalone Opus complexity benchmark:** native FFmpeg encoded the first 300 seconds of the protected HE-AAC source to 48 kHz stereo 128 kb/s VBR Opus with libopus complexity 0 in 0.868 s (345.74x realtime, 4,635,597 bytes). Complexity 5 took 1.352 s (221.95x), and complexity 10 took 1.935 s (155.06x), so complexity 0 was 55.8% faster than 5 and 122.9% faster than 10. Independent channel ASDR was 23.3021/23.2673 dB at complexity 0, 23.2965/23.2283 dB at 5, and 23.1557/23.1576 dB at 10; the fastest setting did not weaken measured fidelity. The slower settings are rejected for this bounded browser profile.
- **Rejected Opus signed-16-bit path:** on the same protected 300-second reference and complexity-0 settings, packed float completed in 0.889 s with 23.3021/23.2673 dB channel ASDR, while signed 16-bit took 0.913 s and collapsed measured ASDR to 4.61927/4.61838 dB. Signed 16-bit was both 2.7% slower and materially less faithful, so the converter retains packed float. Both repository-local comparison outputs are cleanup-managed and must not be treated as reusable conversion copies.
- **Opus AMR sample-rate optimization:** native complexity-0 libopus encoded one hour of the exact looped 8 kHz mono AMR-NB fixture in 5.062 s when preserving 8 kHz input, versus 7.987 s after unnecessary 48 kHz upsampling, a 1.58x speedup. The preserved-rate output was smaller (29,249,186 versus 32,794,519 bytes) and improved 300-second mono ASDR from 35.1795 to 42.5176 dB. The Opus profile therefore preserves every libopus-supported source rate (8, 12, 16, 24, or 48 kHz), rounds only unsupported rates upward, caps above 48 kHz, and avoids needless resampling.
- **Pinned Opus dependency decision:** the reproducible Wasm build uses the current official libopus 1.6.1 source archive and Xiph-published SHA-256 `6ffcb593207be92584df15b32466ed64bbec99109f007c82205f0194572411a1`. Official encoder documentation defines complexity 0-10 with 10 as highest complexity; measured evidence selects 0 for maximum throughput. All benchmark outputs stayed under `work/opus-benchmark` and are covered by an exact cleanup allowlist.
- **2026-08-13 standalone Vorbis encoder benchmark:** reference libvorbis quality 4 encoded the first 300 seconds of the protected HE-AAC source to 48 kHz stereo Ogg Vorbis in 3.915 s (76.63x realtime, 3,941,937 bytes, 105,199 b/s observed), while FFmpeg's experimental native Vorbis encoder at 128 kb/s took 5.000 s (60.00x realtime, 6,732,444 bytes, 179,659 b/s observed). Reference quality 4 was 27.7% faster, 41.5% smaller, and produced balanced channel ASDR of 23.5154/23.5859 dB; the native candidate measured 33.3368/22.302 dB. Reference quality 3 was slower in the first controlled run (4.519 s) and reduced ASDR to 22.4472/22.5478 dB, while libvorbis 128 kb/s resolved to the same output and fidelity as quality 4. The experimental native encoder and lower-quality reference setting are rejected.
- **Pinned Vorbis dependency decision:** the reproducible Wasm build uses Xiph's current stable libogg 1.3.6 tar.xz with published SHA-256 `5c8253428e181840cd20d41f3ca16557a9cc04bad4a3d04cce84808677fa1061` and libvorbis 1.3.7 tar.xz with published SHA-256 `b33cc4934322bcbf6efcbacf49e3ca01aadbea4114ec9589d1b1e9d20f72954b`. Benchmark media stays under `work/vorbis-benchmark` and is covered by an exact cleanup allowlist.
- **Vorbis AMR sample-rate optimization:** reference libvorbis quality 4 encoded one hour of looped 8 kHz mono AMR-NB in 7.395 s when preserving 8 kHz, versus 40.449 s after unnecessary 48 kHz upsampling, a 5.47x speedup. The preserved-rate output was genuine Ogg Vorbis, 55.4% smaller (6,635,940 versus 14,871,209 bytes), and retained 27.1338 dB mono ASDR over the first 300 seconds. Upsampling measured 36.0759 dB but cannot add source bandwidth and incurs the rejected 5.47x CPU and 2.24x storage penalties. The converter therefore preserves supported source rates through 48 kHz and avoids unnecessary resampling.
- **Vorbis build-cache correction:** the first filtered engine build placed the new libogg/libvorbis downloads before the established libvpx/OpenCORE/LAME/libopus build layers, invalidating their Docker cache and starting an unrelated libvpx rebuild. The exact build client was stopped before completion, and the new downloads were moved after the cached existing codec layers. Subsequent filtered builds compile only libogg, libvorbis, the configured FFmpeg libraries, and `within-remux`; the output contract and pinned sources are unchanged.
- **Vorbis media-dispatch correction:** the first focused browser run stopped after five identical pre-write failures, and one success-path reproduction retained the same strict UTF-8 error. An established Opus route passed with the same engine and destination, proving the codec build and writer were sound. The new Vorbis set was mapped to native profile 33 but missing from the outer media-dispatch guard, so binary audio had incorrectly fallen through to the structured-text decoder. Adding that exact set to the media guard fixed the root cause; all diagnostic-decoder experiments were removed and established runtime behavior remains unchanged.
- **Vorbis warning-harness correction:** after media dispatch was fixed, M4A-to-Vorbis completed and validated but the shared browser helper still expected a container extra-stream warning for a standalone audio input. Standalone Ogg-output routes now use the same no-warning classification as standalone AAC, MP3, and Opus; container Ogg extraction expectations remain unchanged.
- **Vorbis focused browser gate:** all 19 production-browser cases passed in 22.4 seconds: nine standalone input families wrote genuine Ogg Vorbis, ALAC M4A encoded successfully, and nine forced destination-write failures left no partial OPFS output. Every success was independently probed, fully decoded, ASDR checked, and bounded to 256 KiB reads/writes, one pending destination operation, one conversion worker, and the 32 MiB initial Wasm memory.
- **Full-suite bridge-race diagnosis:** the first 641-case regression passed 639 cases but hit a 60-second Playwright trace-setup timeout on established ALAC-to-AIFF and a transient missing test bridge on an established direct 7Z case; both passed together in an 18.4-second isolated rerun. A fresh full run then passed 638 cases but exposed the same bridge loss across unrelated AV1, AAC, and TAR/XZ failure paths. The converter's local-only test effect was deleting and recreating `window.__WITHIN_TEST__` on every state and metrics update, so polling could land in that cleanup gap. The bridge is now installed once per local `?test=1` page and reads a separately refreshed state ref; both long-lived suites also wait for initial bridge installation after navigation. This changes no production route, timeout, conversion assertion, or cleanup requirement.
- **Host-space diagnosis during full regression:** generated media and converted copies remained repository-local and had already been deleted, while `C:` free space fell from 0.581 GiB to 0.014 GiB as the Windows-managed pagefile expanded during the long Chrome run. Redirecting npm and process temporary state to cleanup-managed `work/vorbis-*` directories prevented task cache growth on `C:`. A BuildKit `--min-free-space 4GB` attempt reclaimed only 20 KiB because that target applies inside BuildKit, not to the Windows host; it was not repeated. The remaining 11.4 GB rebuildable Docker build cache was pruned, but the Docker VHD did not compact and therefore did not release host-visible space. No source, active container, report, protected fixture, or unrelated user file was deleted.
- **Opus build-network failure:** the first single-core Docker build stopped before compilation when its fresh package layer completed but `ffmpeg.org` refused the pinned FFmpeg archive connection. No engine was exported. The new Opus build arguments were moved after all existing dependency downloads so the retry can reuse the established FFmpeg/libvpx/AMR/LAME cache and avoid repeating unrelated network and compilation work.
- **Opus static-discovery correction:** libopus 1.6.1 compiled and installed successfully, but FFmpeg configure could not discover its private static `opus.pc` file. No engine was exported. The bounded configure-log diagnostic proved that Emscripten's `emconfigure` cleared the ordinary `PKG_CONFIG_PATH`; the build now uses an explicit wrapper whose only search root is `/src/install/lib/pkgconfig`, preventing host-library leakage while making the pinned static Opus dependency discoverable.
- **Opus sample-format correction:** the first production-browser focused gate stopped after AAC input reached encoder initialization and proved that libopus accepts packed float (`flt`) or signed 16-bit samples, not the planar float (`fltp`) used by the established AAC/MP3 paths. Remaining identical cases were stopped. Only profile 32 now selects packed float; the shared bounded resampler/FIFO handles that layout without changing memory, bitrate, quality, or destination constraints.
- **Opus header-stall diagnosis:** packed-float and an explicit planar-FIFO/interleave experiment both read the complete small M4A fixture but stalled before emitting output. Bounded worker markers proved libopus opened successfully and `avformat_write_header()` was the exact non-returning call, rejecting the FIFO-corruption theory. FFmpeg's pinned Ogg muxer source then showed its non-bitexact header path calling `av_get_random_seed()` for the serial number; that entropy call blocked in Wasm, while established packet-copy Ogg routes already avoided it. Generated Opus now sets the required global encoder header and deterministic muxer flag, removing the entropy path and improving reproducibility. Temporary markers and the slower manual interleave were removed.
- **Opus profiler allowlist correction:** the first category attempt generated and independently verified all ten large audio inputs, then stopped before the first browser conversion because `memory-profile.mjs` did not yet recognize the new standalone Opus route IDs. Its `finally` cleanup immediately deleted the roughly 1.25 GB fixture set. The profiler now recognizes the exact nine routes and independently enforces genuine Ogg/Opus, full decode plus ASDR, at most stereo, 48 kHz signaled output, positive bitrate at or below 160 kb/s, duration, output-size, bounded-I/O, worker, Wasm, repeatability, and complete Chrome process-tree memory constraints.
- **Opus fixture prerequisite correction:** the next category attempt stopped during parallel fixture setup because the WMA stress generator redundantly overwrote a four-second seed file that its 128 MiB lavfi-based generator never reads, and Windows rejected that unnecessary output write. Cleanup removed the partial large set. The dead seed-generation prerequisite is removed, shortening every WMA stress setup and eliminating the unrelated shared-path write without changing the actual stress fixture or its independent hash, probe, decoded-audio, duration, and size manifest.
- **Opus VBR size-validator correction:** the first measured browser conversion produced a valid 19,261,785-byte mono Opus result for 2,100 seconds of AAC input, but the initial size estimate allowed only 8% VBR/container variation above the 64 kb/s target and rejected the output by roughly 70 KiB before certification. The estimate now permits 25% target-rate variation plus 1 MiB of fixed overhead, while the independent hard checks still require a positive observed bitrate at or below 160 kb/s, genuine Ogg/Opus, duration, full decode, ASDR, bounded streaming, repeatable bytes, and sub-250 MiB Chrome memory. Cleanup deleted the failed output and all stress inputs.

## Latest full verification cycle

- **2026-08-13 Vorbis milestone verification:** the registry publishes 298 passed routes. The standalone Vorbis category passed 30/30 isolated Chrome stress conversions and the post-fix focused/stability gate passed 24/24, covering all nineteen Vorbis success/failure/ALAC cases plus every established route that had failed transiently in the long suite. Unit tests passed 26/26; TypeScript, ESLint, and the production build passed. The final full regression reached 639/641 before host exhaustion caused Chrome `Failed to create datapipe` and Wasm `out of memory` errors on two unrelated archive cases with only about 20 MiB free on `C:`; both exact cases then passed 2/2 in a fresh browser in 17.3 seconds. A clean 641/641 aggregate and two-export Docker reproducibility check are deliberately not claimed until host system-drive space is restored.
- **Fast bounded standalone Ogg Vorbis output:** nine public routes passed 30/30 isolated Chrome stress runs across separate AAC and ALAC M4A cases plus raw AAC, AMR-NB, MP3, FLAC, WAV, WMA2, AIFF, and Ogg Opus. Sources ranged from 36,929,878 to 201,600,102 bytes; browser conversion times were 16.12-243.43 seconds and worst complete-Chrome incremental private memory was 201.0 MiB, leaving 49.0 MiB below the required 250 MiB cap. Every output was byte-repeatable, probed as genuine Ogg/Vorbis, fully traversed, decoded, and ASDR-validated by native FFmpeg, kept reads at or below 262,144 bytes, writes and queueing at or below 16,243 bytes, one operation in flight, one worker, and 32 MiB Wasm. Reference libvorbis quality 4 was 27.7% faster and 41.5% smaller than the rejected experimental native encoder on the protected reference; preserving the source rate made the one-hour AMR benchmark 5.47x faster and 55.4% smaller than unnecessary 48 kHz upsampling. Focused browser coverage passed all nineteen success, forced-write, and partial-output-cleanup cases. Category cleanup removed every generated stress source, converted copy, and Chrome profile while retaining only compact manifests and reports; the protected root fixture remained byte-identical.
- **Fast bounded standalone Opus output:** nine public routes passed 30/30 isolated Chrome stress runs across separate AAC and ALAC M4A cases plus raw AAC, AMR-NB, MP3, FLAC, WAV, WMA2, AIFF, and Ogg Vorbis. Sources ranged from 36,929,878 to 201,600,102 bytes; browser conversion times were 6.08-197.74 seconds and worst complete-Chrome incremental private memory was 225.6 MiB. Every output was byte-repeatable, probed as genuine Ogg/Opus, fully traversed, decoded, and ASDR-validated by native FFmpeg, kept reads at or below 262,144 bytes, writes and queueing at or below 18,067 bytes, one operation in flight, one worker, and 32 MiB Wasm. Complexity 0 was 55.8% faster than 5 and 122.9% faster than 10 on the protected reference without measured quality loss; preserving supported source rates made the one-hour AMR benchmark 1.58x faster and higher quality than unnecessary 48 kHz upsampling. Focused browser coverage passed all nineteen success, forced-write, and partial-output-cleanup cases; the full production-browser regression passed 622/622. Category cleanup removed the roughly 1.25 GB fixture set, every converted copy, and the Chrome profile while retaining compact reports.
- **Standalone Opus reproducibility:** two fresh pinned Docker exports filtered to the changed remux core exactly matched each other and the published engine across all seven exported files. SHA-256 was `4ACEC84A47AD09D3CB26E33D90605BCB26C4707B9E7C190D4758D7FA24C038A1` for the manifest, `9D993FCE1FB93560E302184C8175F90154019D1DF7858E53719DCA1E9806FDE5` for the JavaScript glue, `9264CAFFD775E45DDD0A7E1B9EB7723C011AEAF2B0C22DC95D8311B038876298` for the Wasm binary, and `01E1167D54A096D123CF6DFBBEB19587278845C6481D2D66D545669846079551` for the copied Opus license. The filtered build avoids replacing unrelated video-specialist modules; repository cleanup removes both staging exports and their logs after comparison.
- **2026-08-13:** 622/622 production-browser tests passed; 26/26 unit tests passed; TypeScript, ESLint, and the production build passed. The registry publishes 289 passed routes.
- **Fast bounded standalone AAC-LC output:** nine public routes passed 30/30 isolated Chrome stress runs across separate AAC and ALAC M4A cases plus AMR-NB, MP3, FLAC, WAV, WMA2, AIFF, Ogg Vorbis, and Ogg Opus. Sources ranged from 36,929,878 to 201,600,102 bytes; conversion times were 12.20-203.05 seconds and worst complete-Chrome incremental private memory was 202.5 MiB. Every output was byte-repeatable, probed as genuine AAC-LC, fully decoded and ASDR-validated by native FFmpeg, kept reads at or below 262,144 bytes, writes and queueing at or below 780 bytes, one operation in flight, one worker, and 32 MiB Wasm. The fastest measured coder/tool set and standard-rate preservation reduced the one-hour AMR benchmark by 22.38x while improving ASDR; the complete AMR Chrome gate finished in about fifteen minutes instead of the discarded 32 kHz policy remaining incomplete after roughly fifty. Focused browser coverage passed all nineteen success, forced-write, and partial-output-cleanup cases. Reused verified project-local fixtures avoided regenerating about 1.25 GB; category cleanup removed every large source, converted copy, and Chrome profile while retaining compact reports, and the protected fixture remained byte-identical.
- **Standalone AAC reproducibility:** two fresh pinned Docker exports exactly matched each other and the published remux engine. SHA-256 was `E16232A682F7354BEE254240DF21BC5913D0EE7C47A899156D6E977904E99423` for the manifest, `9D993FCE1FB93560E302184C8175F90154019D1DF7858E53719DCA1E9806FDE5` for the JavaScript glue, and `B475E5D64BE00DE8DA0B8D0AA23D05B53BDDEA1BB4CA8837550DE3D93AAA91D4` for the Wasm binary. Repository cleanup removes both staging exports and their logs after comparison.
- **Fast bounded AMR-NB output:** nine routes passed 30/30 isolated Chrome stress runs across separate AAC and ALAC M4A cases plus raw AAC, MP3, FLAC, WAV, WMA2, AIFF, Ogg Vorbis, and Ogg Opus. Sources ranged from 36,929,878 to 201,600,102 bytes; conversion times were 7.67-41.99 seconds and worst complete-Chrome incremental private memory was 217.0 MiB. Every output was byte-repeatable, probed as genuine 8 kHz mono AMR-NB MR122, fully traversed and decoded with native FFmpeg, validated by counted 20 ms frames, kept reads at or below 262,144 bytes, writes and queueing at 32 bytes, one operation in flight, one worker, and 32 MiB Wasm. The fixed 16,384-sample FIFO now skips reallocations while free space is sufficient, eliminating an MP3 hot-path failure and reducing allocation overhead for all audio routes; output coalescing retains a single bounded direct destination operation. Focused ASDR quality validation passed all nine routes after rejecting APSNR's implausible AMR values. Concurrent fixture generation completed in 218.48 seconds versus the previous roughly 520-second serial topology, a 58% reduction, while targeted parallel Ogg/Opus recovery avoided regenerating unneeded media. Category and direct-profiler cleanup delete all generated media, converted copies, Chrome profiles, and reproducibility directories while retaining compact manifests plus success/failure reports; the protected root fixture remains byte-identical.
- **Fast bounded AIFF output:** nine routes passed 30/30 isolated Chrome stress runs across separate AAC and ALAC M4A cases plus raw AAC, AMR-NB, MP3, FLAC, WAV, WMA2, Ogg Vorbis, and Ogg Opus. Sources ranged from 36,929,878 to 153,600,106 bytes; conversion times were 1.60-66.64 seconds and worst complete-Chrome incremental private memory was 226.2 MiB. Every output was repeatable, probed as genuine AIFF with signed 16-bit big-endian PCM, kept reads at or below 262,144 bytes, writes and queueing at or below 32,768 bytes, one operation in flight, and 32 MiB Wasm. Lossless sources passed exact decoded-PCM SHA-256 checks; lossy sources passed full decoded-audio APSNR checks. Focused browser coverage passed all nine routes, separate ALAC exactness, coalesced direct save, and inherited AIFF input routes. `WITHIN_REUSE_FIXTURES=1` verifies and reuses already generated project-local sources instead of repeating the measured 520-second generation step. The category `finally` cleanup deleted all generated media sources, converted AIFF copies, and the Chrome profile while retaining compact tracked manifests and reports; the protected root fixture remained byte-identical.
- **2026-08-12:** 603/603 production-browser tests passed; 26/26 unit tests passed; TypeScript, ESLint, and the production build passed.
- **Fast bounded ASS subtitle output:** SRT passed 3/3 Chrome runs on 67,327,792 bytes in 4.00-4.09 s at 177.0 MiB worst incremental private memory; WebVTT passed 3/3 on 73,788,904 bytes in 3.84-4.34 s at 187.1 MiB. Chunk-level cue parsing, 64 KiB text batching, and no-op guards for plain cues reduced the retained 7.35-7.90 s baseline by roughly 44-49% without changing output. All six final runs streamed directly through one worker with no Wasm or SharedArrayBuffer allocation, 256 KiB maximum reads and writes, one pending operation, and the same independently generated 83,203,467-byte SHA-256 (`8caf3ae2ec12d82f867584938e08e0598099f0cb4283ee16d04120ef01ed1ab5`). The route preserves cue timing, multiline text, entities, voice labels where available, and basic italic/bold/underline markup while generating a deterministic default style and explicitly disclosing nearest-centisecond rounding plus excluded WebVTT metadata, cue identifiers, positioning, regions, and CSS. Focused exact-success, malformed-timing, forced-write, and partial-output-cleanup coverage passed 4/4. The generator kept every source under `fixtures/stress/subtitles`; category cleanup removed all large generated fixtures and converted copies in `finally`, while compact reports and tracked manifests remain as the durable record.
- **Fast bounded FLV remuxing:** MKV passed 3/3 Chrome runs on 147,131,070 bytes in 0.95-1.27 s at 166.7 MiB worst incremental private memory; MP4 passed on 147,136,622 bytes in 1.03-1.33 s at 187.5 MiB; MOV passed on 147,136,646 bytes in 1.00-1.32 s at 191.7 MiB; 3GP passed on 146,854,522 bytes in 1.09-1.40 s at 173.5 MiB; and MPEG-TS passed on 150,441,548 bytes in 1.55-1.88 s at 196.6 MiB. All fifteen H.264/AAC outputs used one worker, 32 MiB Wasm, 256 KiB maximum reads, at most 256 KiB writes, one pending write, repeatable bytes, genuine FLV structure, and full decoded-video plus exact AAC-access-unit SHA-256 validation. Direct stream copy avoids decode/re-encode work; the FLV trailer performs only fixed-size duration/file-size updates and does not accumulate a duration-sized index. MPEG-TS uses the required `aac_adtstoasc` filter. FLV carries only the first video and audio stream, so chapters, subtitles, attachments, attached pictures, additional streams, language tags, and unsupported metadata are explicitly disclosed and excluded. Native feasibility and all temporary outputs stayed under `work` and were deleted; the reproducible pinned FFmpeg build added only the FLV muxer to the lean core and was hash-verified before publication. Focused exact-success, codec-rejection, forced-write, and partial-output-cleanup coverage passed 12/12 before the 545/545 regression. Category cleanup removed every large generated source and converted copy in `finally`, while compact reports remain as the durable record.
- **Fast bounded fragmented QuickTime MOV remuxing:** MKV passed 3/3 Chrome runs on 147,131,073 bytes in 0.72-1.11 s at 215.8 MiB worst incremental private memory; MP4 passed on 147,136,624 bytes in 0.73-1.06 s at 219.3 MiB; 3GP passed on 146,854,522 bytes in 0.76-1.07 s at 231.9 MiB; MPEG-TS passed on 150,441,548 bytes in 1.17-1.50 s at 227.9 MiB; and FLV passed on 146,903,539 bytes in 0.78-1.12 s at 213.3 MiB. All fifteen H.264/AAC outputs used one worker, 32 MiB Wasm, 256 KiB maximum reads and writes, one pending write, repeatable bytes, genuine QuickTime `qt  ` branding, compatible language-tag preservation, and full decoded-video plus exact AAC-stream SHA-256 validation. Direct stream copy avoids decode/re-encode work, while fragmented output bounds duration-sized muxer indexes. MPEG-TS uses its required `aac_adtstoasc` filter. A bounded 2 MiB/4,096-packet opening inspection repaired only missing or non-monotonic decode timestamps, preserving presentation timestamps and exact HEVC decoded identity. The first focused run caught decreasing HEVC DTS; the corrected gate passed all 13 exact-success, codec-rejection, forced-write, and partial-output-cleanup cases before the 533/533 regression. The stress generator kept every source under `fixtures/stress`, and category cleanup removed all large generated fixtures and converted copies in `finally` while retaining compact reports as the durable record.
- **Fast bounded fragmented 3GP remuxing:** MKV passed 3/3 Chrome runs on 147,131,069 bytes in 0.76-1.10 s at 182.5 MiB worst incremental private memory; MP4 passed on 147,136,621 bytes in 0.75-1.10 s at 205.3 MiB; MOV passed on 147,136,645 bytes in 0.78-1.10 s at 205.5 MiB; MPEG-TS passed on 150,441,548 bytes in 1.20-1.55 s at 218.7 MiB; and FLV passed on 146,903,539 bytes in 0.84-1.13 s at 204.3 MiB. All fifteen H.264/AAC outputs used one worker, 32 MiB Wasm, 256 KiB maximum reads and writes, one pending write, repeatable bytes, genuine `3gp6` branding, compatible language-tag preservation, and full decoded-video plus exact AAC-access-unit SHA-256 validation. Fragmented output bounds duration-sized muxer indexes and direct stream copy avoids decode/re-encode work. Native feasibility identified the MPEG-TS-only `aac_adtstoasc` requirement; focused browser coverage then passed 12/12 exact-success, codec-rejection, forced-write, and partial-output-cleanup cases. The first focused attempt also caught that FFmpeg names the runtime muxer `3gp` but its configure component `tgp`; the unusable repository-local staging build was deleted, the corrected Wasm was hash-verified before publication, and the final 520/520 regression passed. The stress generator kept every source under `fixtures/stress`, and category cleanup removed all large generated fixtures and converted copies in `finally` while retaining compact reports as the durable record.
- **Fast bounded MPEG-TS remuxing:** MKV, MP4, MOV, 3GP, and FLV passed 3/3 Chrome runs on 146,854,522-147,136,646-byte H.264/AAC sources in 0.77-1.59 s at 170.0-187.5 MiB worst incremental private memory. All fifteen outputs used one worker, 32 MiB Wasm, 256 KiB maximum reads and writes, one pending write, repeatable bytes, and full decoded-video plus exact AAC-access-unit SHA-256 validation. Standards-required Annex B and ADTS framing changes do not re-encode media. A separate HEVC/AAC Matroska browser case passed exact decoded-video and AAC identity. The reusable asynchronous BYOB reader avoids source-sized Blob retention; a bounded 2 MiB/2-second inspection plus 2 MiB opening-packet lookahead reconstructs only missing or decreasing B-frame decode timestamps while leaving valid monotonic timing untouched. Focused success, HEVC, codec-rejection, forced-write, and partial-output-cleanup coverage passed 12/12 before the 508/508 full regression. Retained failures document the stale-production-bundle timestamp loop and two validator normalization mistakes; the final category run removed every large generated source and converted copy in `finally`, while compact manifests and reports remain as the durable record.
- **Fast bounded Matroska remuxing:** MP4, MOV, 3GP, MPEG-TS, FLV, AVI, WebM, and OGV passed 3/3 Chrome runs on 137,218,662-222,941,314-byte sources in 0.87-1.67 s at 166.2-183.7 MiB worst incremental private memory. All 24 outputs used one worker, 32 MiB Wasm, 256 KiB maximum reads and writes, one pending write, repeatable bytes, and full native decoded-stream or compressed-packet identity checks. Compatible video, audio, subtitle, attachment, chapter, stream, and general metadata are copied without re-encoding. Seven routes use live Matroska with five-second/5 MiB clusters and no duration/cue index; AVI uses the same bounded clusters plus a compact cue index after both native and browser FFmpeg live mode produced incorrect VFW duration metadata. A rejected synchronous Blob-reader topology reached 295.5 MiB on MP4; the reusable asynchronous BYOB reader reduced the passing routes to at most 183.7 MiB without changing the 250 MiB ceiling. Focused testing recorded and fixed AAC priming, transport-stream AAC configuration, AVI duration, and validator assumptions before the final 19/19 gate and 496/496 full regression. All generated sources and converted copies stayed under the repository and category cleanup removed them in `finally`, while compact manifests and success/failure reports remain as the loop-prevention record.
- **Fast bounded container-to-HEVC extraction:** MKV, MP4, MOV, and MPEG-TS passed 3/3 Chrome runs on 148,952,609-157,710,004-byte HEVC sources in 2.06-3.78 s at 195.3-212.2 MiB worst incremental private memory. All twelve outputs used 32 MiB Wasm, 256 KiB maximum reads and writes, one pending write, were byte-repeatable, retained all 17,282 decoded frames, and passed full native decode traversal. The packet-copy route excludes audio, subtitles, attachments, data, additional video, chapters, timestamps, and container-only metadata that Annex B cannot represent. The focused production-browser gate passed 9/9 success, codec-rejection, forced-write, and partial-output-cleanup cases. A raw HEVC-to-MP4 candidate was rejected after both native FFmpeg and the browser retained 98 packets but produced a different decoded presentation-order hash: elementary HEVC lacks the container timestamps needed to reconstruct B-frame timing reliably. The unused raw HEVC demuxer and route were removed instead of weakening identity validation. All generated sources and converted copies stayed under the repository and cleanup removed them while retaining compact manifests and reports.
- **Fast bounded Ogg-family audio extraction:** MKV/WebM-to-Ogg Vorbis, OGV-to-Ogg Vorbis, and MKV/WebM-to-Ogg Opus passed 3/3 Chrome runs on 137,218,662–222,942,211-byte sources in 0.39–0.93 s at 185.0–207.8 MiB worst incremental private memory. All fifteen outputs used 32 MiB Wasm, 256 KiB maximum reads, at most 15,406-byte writes, and one pending write. Exact compressed-packet validation retained 2,812 Vorbis packets from the 60-second Matroska/WebM sources, 36,564 Vorbis packets from OGV, and 3,001 Opus packets; native FFmpeg fully decoded every result. The reusable async BYOB input path avoids a second source-sized Blob allocation while preserving sub-second packet-copy performance. Two optimized base encodes ran concurrently and three derivative containers were generated by concurrent stream copy; all five 128 MiB-class sources were ready in 60.94 seconds. The focused production-browser gate passed 12/12 success, rejection, forced-write, and partial-output-cleanup cases. Every generated source and converted copy stayed under the repository and category cleanup removed them while retaining only compact manifests and reports.
- **Fast bounded container-to-AAC extraction:** MKV, MP4, MOV, 3GP, MPEG-TS, and FLV passed 3/3 Chrome runs on 146,854,456–150,441,548-byte H.264/AAC sources in 0.35–1.08 s at 175.7–211.3 MiB worst incremental private memory. All eighteen outputs used 32 MiB Wasm, 256 KiB maximum reads, at most 478-byte writes, one pending write, retained 3,049 exact AAC access units with normalized payload SHA-256 `b3c155ba76bd466a3985cd38f6a2e31b7a2787f17cb8293ee96b1626742c14de`, and fully decoded with native FFmpeg. One optimized 65-second H.264/AAC encode plus five concurrent stream-copy remuxes generated all six sources under `fixtures/stress`; category cleanup removed every large source and converted copy while retaining only compact manifests and reports. The first profile failure exposed an invalid raw-ADTS bitrate-duration assumption and was corrected with exact access-unit count/duration validation. A second rejected topology used synchronous Blob reads and reached 291.4 MiB on FLV; the final AAC-only reusable async BYOB reader reduced FLV to 184.7 MiB without weakening the 250 MiB limit. The first full regression caught a boolean reader-selector mistake on established sync routes; retaining the actual reader object fixed it. The final mixed sync/AAC focused gate passed 14/14, followed by 457/457 full-browser tests.
- **Fast bounded container-to-MP3 extraction:** MKV, MP4, MOV, AVI, MPEG-TS, and FLV passed 3/3 Chrome runs on 181,340,062–185,645,300-byte H.264/MP3 sources in 1.20–2.14 s at 214.9–243.9 MiB worst incremental private memory. All eighteen outputs used 32 MiB Wasm, 256 KiB maximum reads, one pending write, retained the same exact MP3 packet SHA-256 (`2783be01bab87c406660e1b58d3b6550aa03437a5086d442608409f5aea79558`), and fully decoded with native FFmpeg. Header-complete MKV/MP4/MOV/AVI skip decoder-oriented stream analysis; MPEG-TS and FLV use a bounded 2 MiB probe because their headers alone do not expose enough MP3 parameters. One 60-second H.264/MP3 encode plus five concurrent packet-copy remuxes generated all six 173–177 MiB sources under `fixtures/stress` in 3.71 seconds; category cleanup removed 1.09 GB of media plus every converted copy while retaining only compact manifests and reports. The first focused browser run recorded 13 passes and five failures: bounded probing fixed MPEG-TS/FLV stream discovery, while AVI's exact packet match replaced an invalid decoded-PCM comparison that had included container-specific trim semantics. The final focused gate passed all thirteen success, rejection, forced-write, and cleanup cases.
- **Fast bounded AV1 Matroska-to-WebM copy:** a 222,942,211-byte 1,920×1,080 AV1/Opus source passed 3/3 Chrome runs in 1.98–2.40 s at 213.7 MiB worst incremental private memory. The packet-copy route skipped decoder-oriented stream analysis, held reads, writes, and queueing to 262,144 bytes, used one worker and 32 MiB Wasm, and produced the same 222,940,541-byte output each time. Independent full native decode verified all 1,440 AV1 frames plus Opus audio against exact source SHA-256 values, preserved the `eng` language tag, and confirmed the bounded live-WebM output omitted duration/cue indexes and chapters. The 212.6 MiB generated source and all converted copies stayed under the repository and were deleted by category cleanup. A rejected SVT-AV1 preset-13 shortcut encoded only 47 independently decodable frames out of 120 and emitted decoder errors; the final generator uses validated libaom realtime settings and never repeats that invalid optimization. The first browser attempt also exposed and fixed an output-context flag write before allocation; focused success and forced-write-cleanup tests now pass.
- **Bounded H.264 elementary-stream input and output:** raw H.264-to-MP4 passed 3/3 Chrome runs on 145,801,019 bytes in 1.75–2.26 s at 233.9 MiB worst incremental private memory; H.264-to-VP8 passed in 9.46–9.87 s at 239.7 MiB; and H.264-to-VP9 passed in 13.77–14.18 s at 243.7 MiB, retaining 6.3 MiB below the unchanged ceiling. MKV, MP4, MOV, 3GP, MPEG-TS, and FLV extraction to raw H.264 passed 3/3 in 1.60–3.09 s at 207.2–213.8 MiB. All 27 outputs were repeatable, independently probed and fully decoded; WebM passed visual-similarity checks, raw extraction retained all 1,560 decoded frames, and nine forced-write cases left no partial OPFS output. One 65-second high-bitrate encode plus stream-copy remux/extraction generated all seven >128 MiB sources under `fixtures/stress` in 6.26 seconds, and category cleanup deleted every source and converted copy. Annex B cannot preserve container timestamps, so the registry explicitly discloses reconstructed 25 fps timing. Retained failed reports record two corrected validator-only assumptions—requiring audio from video-only MP4 and attempting `-ss 0` against raw input—so neither loop is repeated.
- **Bounded MPEG-2 elementary-stream input and output:** raw M2V-to-MPEG-TS passed 3/3 Chrome runs on 136,166,136 bytes in 1.96–2.30 s at 202.0 MiB worst incremental private memory. MKV, MP4, MOV, AVI, and MPEG-TS extraction to raw M2V passed 3/3 on 136,284,843–142,273,136-byte sources in 1.68–2.31 s at 198.6–210.8 MiB. All eighteen stress outputs were byte-repeatable, independently probed, and fully decoded through all 11,904 frames; six forced-write cases left no partial OPFS output. The direct packet-copy routes retained 262,144-byte maximum reads, one pending write, and 32 MiB Wasm. One retained raw fixture plus five concurrent remuxes generated all six sources under `fixtures/stress` in 3.78 seconds; category cleanup deleted every large source and converted copy while preserving the compact tracked manifest. Two failed small-fixture attempts documented and corrected missing raw-stream timestamps and B-frame presentation-order synthesis before promotion; the strict decoded-frame comparison was not weakened.
- **Bounded MPEG-4 Part 2 elementary-stream input and output:** raw M4V-to-MP4 passed 3/3 Chrome runs on 179,609,473 bytes in 1.80–2.25 s at 234.2 MiB worst incremental private memory. MKV, MP4, MOV, and AVI extraction to raw M4V passed 3/3 on 179,625,169–180,576,319-byte sources in 1.63–2.10 s at 195.4–211.5 MiB. All fifteen stress outputs were byte-repeatable, independently probed, and fully decoded through all 1,440 frames; five forced-write cases left no partial OPFS output. The direct packet-copy routes retained 262,144-byte maximum reads and writes, one pending write, and 32 MiB Wasm. A single continuous 60-second, 1,920×1,080 B-frame encode generated the 179,609,473-byte raw source in 5.36 seconds, and four concurrent stream-copy remuxes produced the complete five-source set under `fixtures/stress` in 6.39 seconds. Category cleanup deletes every large source and converted copy while retaining only the compact manifest. The retained first benchmark failure documents why byte-concatenating short raw streams is invalid: their MPEG timecodes restarted and MP4 rejected the non-monotonic timestamps. The generator now performs one fast continuous encode instead of weakening timestamp validation.
- **Bounded legacy-container audio extraction to FLAC:** AVI/MP3 passed 3/3 Chrome runs on 159,500,442 bytes in 1.26–1.60 s at 223.3 MiB worst incremental private memory; OGV/Vorbis passed 3/3 on 137,218,662 bytes in 3.39–3.75 s at 213.1 MiB. All six FLAC outputs were byte-repeatable, independently probed and decoded-audio validated, and deleted. Two forced-write cases left no partial OPFS output. The shared generator runs both project-local fixture jobs concurrently; the final continuous-Vorbis OGV fixture is produced in about 10.63 seconds, down from about 19.05 seconds, while preserving source specifications. A rejected stream-copy shortcut generated the OGV in 0.52 seconds but repeated codec-delay samples extended the decoded FLAC to 782.586667 seconds from 780-second timestamps; that failed profile is retained so the invalid optimization is not repeated. Sources, manifests, and converted copies remain under the repository and category cleanup removes them in `finally`.
- **Bounded container audio extraction to FLAC:** MKV passed 3/3 Chrome runs on 146,855,294 bytes in 1.28–1.53 s at 212.6 MiB worst incremental private memory; MP4 passed on 146,854,557 bytes in 1.23–1.54 s at 214.2 MiB; MOV passed on 146,854,612 bytes in 1.21–1.57 s at 213.9 MiB; 3GP passed on 146,854,456 bytes in 1.25–1.57 s at 214.7 MiB; MPEG-TS passed on 150,441,548 bytes in 1.50–1.98 s at 211.6 MiB; and FLV passed on 146,903,486 bytes in 1.25–1.57 s at 210.7 MiB. All eighteen FLAC outputs were byte-repeatable, independently probed and decoded-audio validated, and deleted. Six forced-write cases left no partial OPFS output. One optimized 65-second H.264/AAC encode plus five stream-copy remuxes generated all six 128 MiB-class sources under `fixtures/stress` in 3.89 seconds; the generator verifies the project-local source hash before and after, and category cleanup removes every source, manifest, and converted copy in `finally`.
- **Bounded AVI to WebM:** MPEG-4 Part 2 AVI-to-VP8 passed 3/3 Chrome runs on 159,500,442 bytes in 9.19–9.62 s at 214.5 MiB worst incremental private memory; AVI-to-VP9 passed in 14.62–15.00 s at 233.3 MiB. All six video-only WebM outputs were byte-repeatable, independently probed, midpoint-SSIM checked, fully decoded, and deleted; route-specific forced-write failures left no partial OPFS output. The optimized generator creates the 128 MiB-class source under `fixtures/stress` in about 1.5 seconds instead of looping a 12-minute stream-copy fixture, records the 1,543 actually decodable frames rather than trusting AVI's 1,560-frame header, verifies the small source hash before and after, and removes the generated AVI and manifest in `finally`. The retained first-run failure documents the original header-duration validation mismatch; the strict 0.25-second tolerance remained unchanged and now compares against decoded-frame duration.
- **Bounded 3GP/MPEG-TS/FLV to WebM:** six H.264 container routes reuse the lazy optimized eight-worker VP8/VP9 cores after bounded stream inspection. 3GP-to-VP8 passed 3/3 Chrome runs on 146,854,522 bytes in 9.28–9.69 s at 236.4 MiB worst incremental private memory; 3GP-to-VP9 passed in 13.55–14.19 s at 234.0 MiB; MPEG-TS-to-VP8 passed on 150,441,548 bytes in 9.59–9.97 s at 220.4 MiB; MPEG-TS-to-VP9 passed in 13.81–14.39 s at 222.9 MiB; FLV-to-VP8 passed on 146,903,539 bytes in 9.22–9.71 s at 220.6 MiB; and FLV-to-VP9 passed in 13.62–14.05 s at 222.1 MiB. All eighteen outputs were byte-repeatable, independently probed as genuine video-only WebM, midpoint-SSIM checked, fully decoded, and deleted. Route-specific forced-write failures left no partial OPFS output. The stress generator now loops the verified project-local 3GP fixture, performs one 65-second H.264 encode plus two stream-copy remuxes, and generated all three 128 MiB-class sources in 2.16 seconds instead of roughly ten minutes; sources stay under `fixtures/stress` and category cleanup removes them in `finally`. Retained rejected topologies measured 266.2 MiB for FLV VP8 and 255.2 MiB for 1,282×722 3GP VP8 before the final 1,282×536 fixture passed without changing the 250 MiB limit or worker counts.
- **Optimized MP4/MOV to WebM:** four new routes reuse the lazy optimized eight-worker VP8/VP9 cores. MP4-to-VP8 passed 3/3 Chrome runs on 147,136,619 bytes in 12.84–13.34 s at 226.9 MiB worst incremental private memory; MP4-to-VP9 passed on 147,136,625 bytes in 14.80–15.36 s at 237.1 MiB; MOV-to-VP8 passed on 147,136,647 bytes in 9.53–10.14 s at 244.4 MiB; and MOV-to-VP9 passed in 14.67–15.17 s at 236.8 MiB. All twelve outputs were byte-repeatable, independently probed as genuine video-only WebM, midpoint-SSIM checked, fully decoded, and deleted. Route-specific forced-write failures left no partial OPFS output. Rejected VP9 fixture topologies measured 254.5–268.5 MiB; the final 1,282-pixel source activates two decoder threads while retaining four encoder threads, cutting the passing process-tree peak by 17.4–31.4 MiB without changing the 250 MiB limit or encode settings.
- **Bounded VP9 WebM:** MKV-to-VP9 passed 3/3 Chrome runs on a 181,825,549-byte HEVC/AAC/SubRip source in 329.00–330.04 s at 244.9 MiB worst incremental private memory; OGV-to-VP9/Vorbis passed on 137,635,308 bytes in 97.19–97.53 s at 224.1 MiB; and M2V-to-VP9 passed on 136,166,136 bytes in 68.34–69.32 s at 223.4 MiB. All nine outputs were byte-repeatable, independently probed as genuine VP9 WebM, midpoint-SSIM checked, fully decoded, and deleted after validation. The separate lazy-loaded core retains a 96 MiB hard Wasm ceiling, uses four VP9 encoder threads, and limits high-resolution decoding to two threads. The final M2V topology improved the controlled 136 MiB conversion from 85.49 s to 69.06 s (19.2%) while staying bounded; split high-resolution decode/encode improved MKV from 355.59 s to 330.23 s (7.1%).
- **Direct raw compression transcoding:** all six GZIP/BZIP2/XZ cross-conversions passed 3/3 256 MiB-class Chrome runs with repeatable outputs, independent streamed decode/SHA-256 validation, and cleanup recovery. GZIP-to-BZIP2 reached 159.2 MiB in 42.58–43.27 s; GZIP-to-XZ 200.1 MiB in 55.81–56.43 s; BZIP2-to-GZIP 179.4 MiB in 51.10–51.54 s; BZIP2-to-XZ 201.3 MiB in 71.09–71.72 s; XZ-to-GZIP 236.2 MiB in 34.65–41.21 s; and XZ-to-BZIP2 196.4 MiB in 42.36–42.72 s. Every route kept reads at 256 KiB, writes at no more than 64 KiB, one pending operation, and no complete decompressed intermediate file.
- **Direct compressed-TAR transcoding:** all six TAR.GZ/TAR.BZ2/TAR.XZ cross-conversions passed 3/3 256 MiB-class Chrome runs with repeatable hashes and cleanup recovery. TAR.GZ-to-TAR.BZ2 reached 168.7 MiB in 42.45–43.04 s; TAR.GZ-to-TAR.XZ 191.6 MiB in 54.92–56.42 s; TAR.BZ2-to-TAR.GZ 183.9 MiB in 51.26–52.65 s; TAR.BZ2-to-TAR.XZ 195.9 MiB in 70.70–71.99 s; TAR.XZ-to-TAR.GZ 239.9 MiB in 34.25–35.22 s; and TAR.XZ-to-TAR.BZ2 209.4 MiB in 42.39–42.73 s. Every route validated USTAR in flight, kept reads at 256 KiB and writes at 64 KiB with one pending operation, independently verified archive entry hashes, and stored no complete intermediate TAR.
- **Compressed TAR/ZIP-to-7Z:** TAR.GZ passed 3/3 256 MiB Chrome runs in 8.22–9.17 s at 225.8 MiB worst incremental private memory; TAR.BZ2 passed in 25.06–25.69 s at 187.2 MiB; optimized TAR.XZ passed in 8.25–8.42 s at 231.1 MiB; and ZIP passed in 9.25–9.45 s at 236.2 MiB. All four streamed directly without a complete intermediate TAR, produced repeatable hashes, used adaptive COPY for the incompressible fixture, independently validated every extracted entry, and deleted 7Z scratch after every run. TAR.XZ uses a specialist 24 MiB decode-only XZ module, reducing combined fixed Wasm from 104 MiB to 80 MiB and resolving the earlier 250.1 MiB boundary failure.
- **SVG-to-PNG:** 3/3 Chrome stress runs passed on a 3,840×2,160, 5,185-element fixture with pixel-exact independent validation (SSIM 1.0), 0.44–0.65 s conversion time, and 202.2 MiB worst incremental private memory.
- **GZIP compression evidence repair:** 3/3 256 MiB Chrome stress runs passed in 27.81–29.70 s with 211.8 MiB worst incremental private memory and cleanup recovery proven.
- **Adaptive TAR-to-7Z:** 3/3 256 MiB Chrome stress runs passed in 8.06–8.94 s with 216.9 MiB worst incremental private memory. The bounded sampler chose lossless COPY for incompressible input, all scratch reads/writes stayed at 61,440 bytes, and scratch returned to zero after every run. This is 6.2–6.9× faster than the measured 55.73-second always-LZMA2 baseline.
- **Compressed TAR-to-ZIP:** TAR.BZ2-to-ZIP passed 3/3 258 MiB Chrome runs in 51.19–51.31 s at 190.5 MiB worst incremental private memory; TAR.XZ-to-ZIP passed 3/3 256 MiB runs in 33.22–35.50 s at 228.8 MiB. Both used one bounded nested stream with 16 KiB maximum destination writes, repeatable output hashes, independent per-entry size/SHA-256 validation, and cleanup recovery.
- **ZIP-to-compressed TAR:** ZIP-to-TAR.BZ2 passed 3/3 256 MiB Chrome runs in 42.52–43.06 s at 160.6 MiB worst incremental private memory; ZIP-to-TAR.XZ passed 3/3 runs in 55.77–56.03 s at 195.7 MiB. Both bound the entire ZIP-inflate/TAR-build/codec/write pipeline to 64 KiB chunks with one pending destination operation, repeatable outputs, native per-entry size/SHA-256 validation, and cleanup recovery.
- **Production dependency audit:** Next.js was upgraded from 16.2.6 to 16.2.12 to clear the framework advisories with a compatible fix. `npm audit --omit=dev` still reports three high transitive findings through Next's pinned PostCSS 8.4.31 and Sharp 0.34.5; npm currently offers no compatible non-major remediation for those two packages.

## Retained Chrome stress evidence

| Profile | Source bytes | Runs | Output bytes | Conversion time | Worst incremental private memory | Peak Wasm | I/O bounds | Cleanup |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| 3gp-to-aac | 146,854,456 | 3 | 1,037,649 | 0.42 s–0.77 s | 186.7 MiB | 32.0 MiB | read 262,144 B / write 478 B | passed |
| 3gp-to-flac | 146,854,456 | 3 | 986,210 | 1.25 s–1.57 s | 214.7 MiB | 32.0 MiB | read 262,144 B / write 8,367 B | passed |
| 3gp-to-flv | 146,854,522 | 3 | 146,903,508 | 1.09 s–1.40 s | 173.5 MiB | 32.0 MiB | read 262,144 B / write 115,489 B | passed |
| 3gp-to-h264 | 146,854,456 | 3 | 145,801,019 | 1.61 s–2.00 s | 212.8 MiB | 32.0 MiB | read 262,144 B / write 115,516 B | passed |
| 3gp-to-m4a | 167,130,850 | 3 | 11,539,835 | 1.12 s–1.50 s | 204.8 MiB | 32.0 MiB | read 262,144 B / write 80,761 B | passed |
| 3gp-to-mkv | 146,854,522 | 3 | 146,855,025 | 0.92 s–1.22 s | 183.4 MiB | 32.0 MiB | read 262,144 B / write 262,144 B | passed |
| 3gp-to-mov | 146,854,522 | 3 | 146,854,516 | 0.76 s–1.07 s | 231.9 MiB | 76.1 MiB | read 262,144 B / write 262,144 B | passed |
| 3gp-to-mp4 | 167,130,850 | 3 | 167,156,758 | 1.66 s–1.93 s | 209.6 MiB | 32.0 MiB | read 262,144 B / write 262,144 B | passed |
| 3gp-to-mpeg-ts | 146,854,522 | 3 | 150,630,112 | 1.21 s–1.59 s | 186.4 MiB | 32.0 MiB | read 262,144 B / write 118,440 B | passed |
| 3gp-to-wav | 167,130,850 | 3 | 69,130,350 | 3.66 s–3.91 s | 193.7 MiB | 32.0 MiB | read 262,144 B / write 2,048 B | passed |
| 3gp-to-webm | 146,854,522 | 3 | 4,948,064 | 9.28 s–9.69 s | 236.4 MiB | 40.0 MiB | read 262,144 B / write 262,144 B | passed |
| 3gp-to-webm-vp9 | 146,854,522 | 3 | 3,372,711 | 13.55 s–14.19 s | 234.0 MiB | 56.0 MiB | read 262,144 B / write 262,144 B | passed |
| aac-to-aiff | 134,367,785 | 3 | 770,273,334 | 12.85 s–13.47 s | 172.8 MiB | 32.0 MiB | read 262,144 B / write 32,768 B | passed |
| aac-to-amr | 134,367,785 | 3 | 6,418,982 | 40.23 s–41.99 s | 164.9 MiB | 32.0 MiB | read 262,144 B / write 32 B | passed |
| aac-to-flac | 134,367,785 | 3 | 114,800,971 | 22.02 s–22.50 s | 167.1 MiB | 32.0 MiB | read 262,144 B / write 8,288 B | passed |
| aac-to-m4a | 134,367,785 | 3 | 133,906,114 | 1.81 s–2.23 s | 179.8 MiB | 32.0 MiB | read 262,144 B / write 167,549 B | passed |
| aac-to-mp3 | 134,367,785 | 3 | 96,285,357 | 61.12 s–62.00 s | 155.0 MiB | 32.0 MiB | read 262,144 B / write 621 B | passed |
| aac-to-ogg | 134,367,785 | 3 | 17,146,674 | 63.17 s–64.10 s | 165.1 MiB | 32.0 MiB | read 262,144 B / write 5,269 B | passed |
| aac-to-opus | 134,367,785 | 3 | 72,251,896 | 32.09 s–32.66 s | 146.0 MiB | 32.0 MiB | read 262,144 B / write 18,067 B | passed |
| aac-to-wav | 134,367,785 | 3 | 770,273,358 | 19.20 s–19.62 s | 186.5 MiB | 32.0 MiB | read 262,144 B / write 4,096 B | passed |
| aiff-to-aac | 201,600,102 | 3 | 21,872,668 | 86.45 s–86.76 s | 162.5 MiB | 32.0 MiB | read 262,144 B / write 557 B | passed |
| aiff-to-amr | 201,600,102 | 3 | 3,360,038 | 16.98 s–17.77 s | 152.5 MiB | 32.0 MiB | read 262,144 B / write 32 B | passed |
| aiff-to-flac | 220,800,108 | 3 | 32,365,732 | 6.06 s–7.02 s | 207.2 MiB | 32.0 MiB | read 262,144 B / write 8,344 B | passed |
| aiff-to-mp3 | 201,600,102 | 3 | 33,600,865 | 15.00 s–16.19 s | 154.4 MiB | 32.0 MiB | read 262,144 B / write 481 B | passed |
| aiff-to-ogg | 201,600,102 | 3 | 3,730,840 | 17.92 s–18.14 s | 164.0 MiB | 32.0 MiB | read 262,144 B / write 3,574 B | passed |
| aiff-to-opus | 201,600,102 | 3 | 19,260,362 | 9.34 s–10.01 s | 177.8 MiB | 32.0 MiB | read 262,144 B / write 9,173 B | passed |
| aiff-to-wav | 201,600,102 | 3 | 201,600,128 | 3.38 s–4.24 s | 194.4 MiB | 32.0 MiB | read 262,144 B / write 4,096 B | passed |
| amr-to-aac | 134,229,414 | 3 | 450,612,583 | 197.19 s–203.05 s | 153.0 MiB | 32.0 MiB | read 262,144 B / write 780 B | passed |
| amr-to-aiff | 134,229,414 | 3 | 1,342,294,134 | 65.92 s–66.64 s | 195.1 MiB | 32.0 MiB | read 262,144 B / write 16,384 B | passed |
| amr-to-flac | 134,229,414 | 3 | 760,765,211 | 124.23 s–126.93 s | 166.0 MiB | 32.0 MiB | read 262,144 B / write 8,288 B | passed |
| amr-to-mp3 | 134,229,414 | 3 | 1,342,295,469 | 417.56 s–428.36 s | 177.0 MiB | 32.0 MiB | read 262,144 B / write 621 B | passed |
| amr-to-ogg | 134,229,414 | 3 | 154,581,919 | 239.78 s–243.43 s | 156.0 MiB | 32.0 MiB | read 262,144 B / write 2,536 B | passed |
| amr-to-opus | 134,229,414 | 3 | 681,593,688 | 193.70 s–197.74 s | 155.6 MiB | 32.0 MiB | read 262,144 B / write 8,504 B | passed |
| amr-to-wav | 134,229,414 | 3 | 1,342,294,158 | 61.54 s–62.01 s | 209.7 MiB | 32.0 MiB | read 262,144 B / write 16,384 B | passed |
| ass-to-srt | 101,393,068 | 3 | 83,377,792 | 2.74 s–2.76 s | 175.1 MiB | 0.0 MiB | read 262,144 B / write 262,144 B | passed |
| ass-to-vtt | 101,393,068 | 3 | 75,928,906 | 2.59 s–2.67 s | 156.8 MiB | 0.0 MiB | read 262,144 B / write 262,144 B | passed |
| avi-to-flac | 159,500,442 | 3 | 1,017,396 | 1.26 s–1.60 s | 223.3 MiB | 32.0 MiB | read 262,144 B / write 8,316 B | passed |
| avi-to-m2v | 136,465,056 | 3 | 136,166,136 | 1.76 s–2.03 s | 206.2 MiB | 32.0 MiB | read 262,144 B / write 28,829 B | passed |
| avi-to-m4v | 179,650,578 | 3 | 179,609,473 | 1.74 s–1.98 s | 201.9 MiB | 32.0 MiB | read 262,144 B / write 150,681 B | passed |
| avi-to-mkv | 159,500,442 | 3 | 159,424,026 | 0.95 s–1.25 s | 166.2 MiB | 32.0 MiB | read 262,144 B / write 262,144 B | passed |
| avi-to-mp3 | 182,803,272 | 3 | 1,441,205 | 1.25 s–1.51 s | 214.9 MiB | 32.0 MiB | read 262,144 B / write 629 B | passed |
| avi-to-mp4 | 230,929,466 | 3 | 229,960,974 | 2.11 s–2.44 s | 199.4 MiB | 32.0 MiB | read 262,144 B / write 262,144 B | passed |
| avi-to-wav | 230,929,466 | 3 | 68,954,218 | 3.97 s–4.30 s | 225.1 MiB | 32.0 MiB | read 262,144 B / write 2,304 B | passed |
| avi-to-webm | 159,500,442 | 3 | 4,890,311 | 9.19 s–9.62 s | 214.5 MiB | 32.0 MiB | read 262,144 B / write 262,144 B | passed |
| avi-to-webm-vp9 | 159,500,442 | 3 | 3,510,077 | 14.62 s–15.00 s | 233.3 MiB | 56.0 MiB | read 262,144 B / write 262,144 B | passed |
| avif-to-bmp | 100,464 | 3 | 24,883,254 | 0.27 s–0.38 s | 171.5 MiB | 0.0 MiB | read 65,536 B / write 195,840 B | passed |
| avif-to-ico | 100,464 | 3 | 13,545 | 0.09 s–0.15 s | 84.7 MiB | 0.0 MiB | read 100,464 B / write 13,523 B | passed |
| avif-to-jpeg | 100,464 | 3 | 367,450 | 0.12 s–0.17 s | 69.3 MiB | 0.0 MiB | read 65,536 B / write 262,144 B | passed |
| avif-to-png | 100,464 | 3 | 1,300,494 | 0.10 s–0.16 s | 72.3 MiB | 0.0 MiB | read 65,536 B / write 262,144 B | passed |
| avif-to-webp | 100,464 | 3 | 250,656 | 0.39 s–0.45 s | 181.4 MiB | 0.0 MiB | read 65,536 B / write 250,656 B | passed |
| bmp-to-ico | 24,883,254 | 3 | 12,290 | 0.18 s–0.23 s | 86.3 MiB | 0.0 MiB | read 262,144 B / write 12,268 B | passed |
| bmp-to-jpeg | 24,883,254 | 3 | 374,384 | 0.21 s–0.25 s | 70.8 MiB | 0.0 MiB | read 262,144 B / write 243,312 B | passed |
| bmp-to-png | 24,883,254 | 3 | 1,019,495 | 0.18 s–0.24 s | 73.4 MiB | 0.0 MiB | read 262,144 B / write 262,144 B | passed |
| bmp-to-webp | 24,883,254 | 3 | 257,798 | 0.48 s–0.55 s | 239.6 MiB | 0.0 MiB | read 262,144 B / write 257,798 B | passed |
| bzip2-compress | 268,435,456 | 3 | 270,593,081 | 39.16 s–39.85 s | 139.2 MiB | 8.0 MiB | read 262,144 B / write 65,536 B | passed |
| bzip2-decompress | 270,593,081 | 3 | 268,435,456 | 23.68 s–23.94 s | 140.4 MiB | 8.0 MiB | read 262,144 B / write 65,536 B | passed |
| bzip2-to-gzip | 270,593,081 | 3 | 268,517,399 | 51.10 s–51.54 s | 179.4 MiB | 8.0 MiB | read 262,144 B / write 16,384 B | passed |
| bzip2-to-xz | 270,593,081 | 3 | 268,448,840 | 71.09 s–71.72 s | 201.3 MiB | 56.0 MiB | read 262,144 B / write 65,536 B | passed |
| csv-to-json | 134,423,894 | 3 | 299,123,885 | 18.76 s–19.14 s | 204.5 MiB | 0.0 MiB | read 262,144 B / write 262,144 B | passed |
| csv-to-ndjson | 134,423,894 | 3 | 288,143,880 | 9.76 s–9.97 s | 193.0 MiB | 0.0 MiB | read 262,144 B / write 262,144 B | passed |
| csv-to-tsv | 134,423,894 | 3 | 139,913,895 | 8.53 s–8.71 s | 192.7 MiB | 0.0 MiB | read 262,144 B / write 262,144 B | passed |
| docx-to-txt | 134,218,659 | 3 | 90,834,111 | 6.07 s–6.20 s | 217.9 MiB | 0.0 MiB | read 262,144 B / write 262,144 B | passed |
| epub-to-txt | 134,219,595 | 3 | 123,185,664 | 6.89 s–6.94 s | 205.5 MiB | 0.0 MiB | read 262,144 B / write 262,144 B | passed |
| flac-to-aac | 138,185,686 | 3 | 19,503,506 | 13.32 s–13.96 s | 162.5 MiB | 32.0 MiB | read 262,144 B / write 577 B | passed |
| flac-to-aiff | 138,185,686 | 3 | 153,600,102 | 3.10 s–3.59 s | 209.5 MiB | 32.0 MiB | read 262,144 B / write 32,768 B | passed |
| flac-to-alac | 138,185,686 | 3 | 140,941,506 | 7.52 s–7.73 s | 199.1 MiB | 32.0 MiB | read 262,144 B / write 262,144 B | passed |
| flac-to-amr | 138,185,686 | 3 | 1,280,038 | 8.71 s–9.44 s | 161.9 MiB | 32.0 MiB | read 262,144 B / write 32 B | passed |
| flac-to-mp3 | 138,185,686 | 3 | 19,201,633 | 13.93 s–14.49 s | 143.8 MiB | 32.0 MiB | read 262,144 B / write 673 B | passed |
| flac-to-ogg | 138,185,686 | 3 | 12,155,741 | 17.07 s–17.81 s | 158.0 MiB | 32.0 MiB | read 262,144 B / write 15,468 B | passed |
| flac-to-opus | 138,185,686 | 3 | 12,459,549 | 7.24 s–7.90 s | 173.1 MiB | 32.0 MiB | read 262,144 B / write 15,593 B | passed |
| flac-to-wav | 52,298,514 | 3 | 57,600,128 | 1.23 s–1.51 s | 161.0 MiB | 32.0 MiB | read 262,144 B / write 9,216 B | passed |
| flac-to-wma | 138,186,536 | 3 | 60,000,756 | 13.07 s–13.37 s | 159.9 MiB | 32.0 MiB | read 262,144 B / write 3,200 B | passed |
| flv-to-3gp | 146,903,539 | 3 | 146,859,702 | 0.84 s–1.13 s | 204.3 MiB | 58.0 MiB | read 262,144 B / write 262,144 B | passed |
| flv-to-aac | 146,903,486 | 3 | 1,037,649 | 0.50 s–0.85 s | 184.7 MiB | 32.0 MiB | read 262,144 B / write 478 B | passed |
| flv-to-flac | 146,903,486 | 3 | 988,027 | 1.25 s–1.57 s | 210.7 MiB | 32.0 MiB | read 262,144 B / write 8,367 B | passed |
| flv-to-h264 | 146,903,486 | 3 | 145,801,019 | 1.60 s–2.02 s | 209.1 MiB | 32.0 MiB | read 262,144 B / write 115,516 B | passed |
| flv-to-m4a | 167,517,193 | 3 | 11,456,012 | 1.16 s–1.42 s | 213.2 MiB | 32.0 MiB | read 262,144 B / write 80,260 B | passed |
| flv-to-mkv | 146,903,539 | 3 | 146,854,983 | 0.93 s–1.32 s | 183.7 MiB | 32.0 MiB | read 262,144 B / write 262,144 B | passed |
| flv-to-mov | 146,903,539 | 3 | 146,859,859 | 0.78 s–1.12 s | 213.3 MiB | 56.9 MiB | read 262,144 B / write 262,144 B | passed |
| flv-to-mp3 | 181,377,794 | 3 | 1,441,172 | 1.26 s–1.58 s | 221.2 MiB | 32.0 MiB | read 262,144 B / write 596 B | passed |
| flv-to-mp4 | 167,517,193 | 3 | 167,091,007 | 1.64 s–1.85 s | 193.1 MiB | 32.0 MiB | read 262,144 B / write 262,144 B | passed |
| flv-to-mpeg-ts | 146,903,539 | 3 | 150,630,112 | 1.23 s–1.57 s | 187.5 MiB | 32.0 MiB | read 262,144 B / write 118,440 B | passed |
| flv-to-wav | 167,517,193 | 3 | 68,776,058 | 3.44 s–3.93 s | 192.4 MiB | 32.0 MiB | read 262,144 B / write 2,048 B | passed |
| flv-to-webm | 146,903,539 | 3 | 4,948,077 | 9.22 s–9.71 s | 220.6 MiB | 40.0 MiB | read 262,144 B / write 262,144 B | passed |
| flv-to-webm-vp9 | 146,903,539 | 3 | 3,372,724 | 13.62 s–14.05 s | 222.1 MiB | 56.0 MiB | read 262,144 B / write 262,144 B | passed |
| gif-to-bmp | 281,853 | 3 | 2,359,350 | 0.05 s–0.11 s | 69.5 MiB | 0.0 MiB | read 131,072 B / write 196,608 B | passed |
| gif-to-ico | 281,853 | 3 | 16,065 | 0.03 s–0.09 s | 80.2 MiB | 0.0 MiB | read 216,317 B / write 16,043 B | passed |
| gif-to-jpeg | 281,853 | 3 | 87,358 | 0.03 s–0.08 s | 68.9 MiB | 0.0 MiB | read 216,317 B / write 87,358 B | passed |
| gif-to-png | 281,853 | 3 | 101,506 | 0.03 s–0.08 s | 70.3 MiB | 0.0 MiB | read 196,608 B / write 101,506 B | passed |
| gif-to-webp | 281,853 | 3 | 57,248 | 0.07 s–0.12 s | 67.3 MiB | 0.0 MiB | read 196,608 B / write 57,248 B | passed |
| gzip-compress | 268,435,456 | 3 | 268,517,399 | 27.81 s–29.70 s | 211.8 MiB | 0.0 MiB | read 262,144 B / write 16,384 B | passed |
| gzip-decompress | 268,517,399 | 3 | 268,435,456 | 3.71 s–4.08 s | 145.0 MiB | 0.0 MiB | read 2,097,152 B / write 65,536 B | not proven |
| gzip-to-bzip2 | 268,517,399 | 3 | 270,593,081 | 42.58 s–43.27 s | 159.2 MiB | 8.0 MiB | read 262,144 B / write 65,536 B | passed |
| gzip-to-xz | 268,517,399 | 3 | 268,448,840 | 55.81 s–56.43 s | 200.1 MiB | 48.0 MiB | read 262,144 B / write 65,536 B | passed |
| h264-to-mp4 | 145,801,019 | 3 | 145,812,361 | 1.75 s–2.26 s | 233.9 MiB | 54.4 MiB | read 262,144 B / write 262,144 B | passed |
| h264-to-webm | 145,801,019 | 3 | 4,752,826 | 9.46 s–9.87 s | 239.7 MiB | 40.0 MiB | read 262,144 B / write 262,144 B | passed |
| h264-to-webm-vp9 | 145,801,019 | 3 | 3,265,035 | 13.77 s–14.18 s | 243.7 MiB | 56.0 MiB | read 262,144 B / write 259,061 B | passed |
| html-to-txt | 143,850,123 | 3 | 101,380,000 | 15.71 s–15.93 s | 231.6 MiB | 0.0 MiB | read 262,144 B / write 262,144 B | passed |
| jpeg-to-bmp | 418,486 | 3 | 24,883,254 | 0.28 s–0.36 s | 169.9 MiB | 0.0 MiB | read 196,608 B / write 195,840 B | passed |
| jpeg-to-ico | 418,486 | 3 | 12,998 | 0.09 s–0.14 s | 80.5 MiB | 0.0 MiB | read 196,608 B / write 12,976 B | passed |
| jpeg-to-png | 418,486 | 3 | 1,792,327 | 0.11 s–0.16 s | 67.7 MiB | 0.0 MiB | read 221,878 B / write 262,144 B | passed |
| jpeg-to-webp | 418,486 | 3 | 244,588 | 0.40 s–0.46 s | 179.6 MiB | 0.0 MiB | read 221,878 B / write 179,052 B | passed |
| json-to-csv | 293,633,883 | 3 | 139,913,895 | 24.37 s–25.13 s | 185.8 MiB | 0.0 MiB | read 262,144 B / write 262,144 B | passed |
| json-to-ndjson | 293,633,883 | 3 | 288,143,880 | 12.09 s–12.39 s | 229.3 MiB | 0.0 MiB | read 262,144 B / write 262,144 B | passed |
| json-to-tsv | 293,633,883 | 3 | 139,913,895 | 24.43 s–24.94 s | 212.1 MiB | 0.0 MiB | read 262,144 B / write 262,144 B | passed |
| m2v-to-mp4-mpeg4 | 136,166,136 | 3 | 124,300,753 | 25.52 s–25.61 s | 177.1 MiB | 32.0 MiB | read 262,144 B / write 189,607 B | passed |
| m2v-to-mpeg-ts | 136,166,136 | 3 | 142,319,760 | 1.96 s–2.30 s | 202.0 MiB | 32.0 MiB | read 262,144 B / write 29,892 B | passed |
| m2v-to-webm | 136,166,136 | 3 | 37,835,173 | 30.57 s–32.39 s | 163.9 MiB | 32.0 MiB | read 262,144 B / write 42,619 B | passed |
| m2v-to-webm-vp9 | 136,166,136 | 3 | 44,351,703 | 68.34 s–69.32 s | 223.4 MiB | 56.0 MiB | read 262,144 B / write 45,682 B | passed |
| m4a-to-aac | 140,941,469 | 3 | 19,503,506 | 15.19 s–16.09 s | 202.5 MiB | 32.0 MiB | read 262,144 B / write 577 B | passed |
| m4a-to-aiff | 140,941,469 | 3 | 153,600,102 | 5.22 s–5.86 s | 226.2 MiB | 32.0 MiB | read 262,144 B / write 32,768 B | passed |
| m4a-to-amr | 140,941,469 | 3 | 1,280,038 | 10.95 s–11.18 s | 217.0 MiB | 32.0 MiB | read 262,144 B / write 32 B | passed |
| m4a-to-flac | 140,941,469 | 3 | 138,185,793 | 7.43 s–7.84 s | 230.4 MiB | 32.0 MiB | read 262,144 B / write 16,614 B | passed |
| m4a-to-mp3 | 140,941,469 | 3 | 19,201,732 | 10.38 s–16.69 s | 205.1 MiB | 32.0 MiB | read 262,144 B / write 772 B | passed |
| m4a-to-ogg | 140,941,469 | 3 | 12,155,861 | 19.07 s–19.45 s | 201.0 MiB | 32.0 MiB | read 262,144 B / write 15,468 B | passed |
| m4a-to-opus | 140,941,469 | 3 | 12,459,669 | 9.25 s–9.58 s | 225.6 MiB | 32.0 MiB | read 262,144 B / write 15,593 B | passed |
| m4a-to-wav | 140,941,469 | 3 | 153,600,128 | 5.11 s–5.39 s | 227.1 MiB | 32.0 MiB | read 262,144 B / write 16,384 B | passed |
| m4v-to-mp4 | 179,609,473 | 3 | 179,625,924 | 1.80 s–2.25 s | 234.2 MiB | 32.0 MiB | read 262,144 B / write 262,144 B | passed |
| md-to-html | 141,110,000 | 3 | 206,870,176 | 13.97 s–14.30 s | 211.5 MiB | 0.0 MiB | read 262,144 B / write 262,144 B | passed |
| mkv-to-3gp | 147,131,069 | 3 | 147,140,040 | 0.76 s–1.10 s | 182.5 MiB | 40.0 MiB | read 262,144 B / write 262,144 B | passed |
| mkv-to-aac | 146,855,294 | 3 | 1,037,649 | 0.35 s–0.69 s | 179.9 MiB | 32.0 MiB | read 262,144 B / write 478 B | passed |
| mkv-to-flac | 146,855,294 | 3 | 988,027 | 1.28 s–1.53 s | 212.6 MiB | 32.0 MiB | read 262,144 B / write 8,367 B | passed |
| mkv-to-flv | 147,131,070 | 3 | 147,164,014 | 0.95 s–1.27 s | 166.7 MiB | 32.0 MiB | read 262,144 B / write 262,144 B | passed |
| mkv-to-h264 | 146,855,294 | 3 | 145,801,019 | 1.62 s–1.95 s | 207.2 MiB | 32.0 MiB | read 262,144 B / write 115,516 B | passed |
| mkv-to-hevc | 148,952,609 | 3 | 134,752,786 | 2.07 s–2.40 s | 195.3 MiB | 32.0 MiB | read 262,144 B / write 262,144 B | passed |
| mkv-to-m2v | 136,294,704 | 3 | 136,166,136 | 1.82 s–2.21 s | 207.8 MiB | 32.0 MiB | read 262,144 B / write 28,829 B | passed |
| mkv-to-m4a | 2,958,573,265 | 3 | 249,427,974 | 2.49 s–4.04 s | 164.7 MiB | 32.0 MiB | read 262,144 B / write 103,136 B | passed |
| mkv-to-m4v | 180,576,319 | 3 | 179,609,473 | 1.88 s–2.10 s | 211.5 MiB | 32.0 MiB | read 262,144 B / write 150,681 B | passed |
| mkv-to-mov | 147,131,073 | 3 | 147,140,262 | 0.72 s–1.11 s | 215.8 MiB | 60.3 MiB | read 262,144 B / write 262,144 B | passed |
| mkv-to-mp3 | 181,340,062 | 3 | 1,440,788 | 1.22 s–1.54 s | 234.4 MiB | 32.0 MiB | read 262,144 B / write 576 B | passed |
| mkv-to-mp4 | 2,958,573,265 | 3 | 2,962,151,522 | 17.42 s–23.30 s | 247.5 MiB | 53.6 MiB | read 262,144 B / write 1,048,576 B | passed |
| mkv-to-mp4-mpeg4 | 2,958,573,265 | 3 | 3,086,358,463 | 3091.16 s–3096.06 s | 211.3 MiB | 89.6 MiB | read 262,144 B / write 262,144 B | passed |
| mkv-to-mpeg-ts | 147,131,071 | 3 | 150,835,596 | 1.20 s–1.40 s | 187.4 MiB | 32.0 MiB | read 262,144 B / write 262,144 B | passed |
| mkv-to-ogg | 222,125,242 | 3 | 106,739 | 0.39 s–0.70 s | 191.1 MiB | 32.0 MiB | read 262,144 B / write 3,533 B | passed |
| mkv-to-opus | 222,942,211 | 3 | 922,267 | 0.40 s–0.74 s | 207.8 MiB | 32.0 MiB | read 262,144 B / write 15,406 B | passed |
| mkv-to-wav | 2,958,573,265 | 3 | 7,107,834,734 | 156.72 s–161.53 s | 178.0 MiB | 32.0 MiB | read 262,144 B / write 24,576 B | passed |
| mkv-to-webm | 2,958,573,265 | 3 | 921,524,214 | 2682.01 s–2687.09 s | 208.8 MiB | 80.0 MiB | read 262,144 B / write 262,144 B | passed |
| mkv-to-webm-av1 | 222,942,211 | 3 | 222,940,541 | 1.98 s–2.40 s | 213.6 MiB | 32.0 MiB | read 262,144 B / write 262,144 B | passed |
| mkv-to-webm-vp9 | 181,825,549 | 3 | 65,122,757 | 329.00 s–330.04 s | 244.9 MiB | 88.0 MiB | read 262,144 B / write 262,144 B | passed |
| mov-to-3gp | 147,136,645 | 3 | 147,128,570 | 0.78 s–1.10 s | 205.5 MiB | 67.9 MiB | read 262,144 B / write 262,144 B | passed |
| mov-to-aac | 146,854,612 | 3 | 1,037,637 | 0.46 s–0.78 s | 184.7 MiB | 32.0 MiB | read 262,144 B / write 478 B | passed |
| mov-to-flac | 146,854,612 | 3 | 986,198 | 1.21 s–1.57 s | 213.9 MiB | 32.0 MiB | read 262,144 B / write 8,355 B | passed |
| mov-to-flv | 147,136,646 | 3 | 147,164,016 | 1.00 s–1.32 s | 191.7 MiB | 32.0 MiB | read 262,144 B / write 262,144 B | passed |
| mov-to-h264 | 146,854,612 | 3 | 145,801,019 | 1.64 s–3.09 s | 208.3 MiB | 32.0 MiB | read 262,144 B / write 115,516 B | passed |
| mov-to-hevc | 149,251,969 | 3 | 134,752,786 | 2.35 s–2.88 s | 197.9 MiB | 32.0 MiB | read 262,144 B / write 262,144 B | passed |
| mov-to-m2v | 136,284,843 | 3 | 136,166,136 | 1.69 s–1.99 s | 210.4 MiB | 32.0 MiB | read 262,144 B / write 28,829 B | passed |
| mov-to-m4a | 149,251,969 | 3 | 14,557,639 | 0.42 s–0.69 s | 164.5 MiB | 32.0 MiB | read 262,144 B / write 103,136 B | passed |
| mov-to-m4v | 179,625,169 | 3 | 179,609,473 | 1.63 s–2.02 s | 198.9 MiB | 32.0 MiB | read 262,144 B / write 150,681 B | passed |
| mov-to-mkv | 147,136,647 | 3 | 147,130,829 | 0.87 s–1.21 s | 169.4 MiB | 32.0 MiB | read 262,144 B / write 262,144 B | passed |
| mov-to-mp3 | 181,344,078 | 3 | 1,441,263 | 1.30 s–1.52 s | 243.9 MiB | 32.0 MiB | read 262,144 B / write 687 B | passed |
| mov-to-mp4 | 149,251,969 | 3 | 149,087,892 | 0.87 s–1.13 s | 168.2 MiB | 40.0 MiB | read 262,144 B / write 262,144 B | passed |
| mov-to-mpeg-ts | 147,136,646 | 3 | 150,830,332 | 0.77 s–1.43 s | 172.2 MiB | 32.0 MiB | read 262,144 B / write 262,144 B | passed |
| mov-to-wav | 149,251,969 | 3 | 414,733,404 | 9.31 s–9.77 s | 195.3 MiB | 32.0 MiB | read 262,144 B / write 24,576 B | passed |
| mov-to-webm | 147,136,647 | 3 | 5,100,809 | 9.53 s–10.14 s | 244.4 MiB | 48.0 MiB | read 262,144 B / write 262,144 B | passed |
| mov-to-webm-vp9 | 147,136,647 | 3 | 4,126,570 | 14.67 s–15.17 s | 236.8 MiB | 64.0 MiB | read 262,144 B / write 262,144 B | passed |
| mp3-to-aac | 50,401,224 | 3 | 31,240,176 | 31.25 s–32.64 s | 144.3 MiB | 32.0 MiB | read 262,144 B / write 584 B | passed |
| mp3-to-aiff | 50,401,224 | 3 | 201,600,102 | 5.00 s–5.96 s | 165.8 MiB | 32.0 MiB | read 262,144 B / write 16,384 B | passed |
| mp3-to-amr | 50,401,224 | 3 | 3,360,038 | 19.91 s–20.37 s | 150.1 MiB | 32.0 MiB | read 262,144 B / write 32 B | passed |
| mp3-to-flac | 50,401,224 | 3 | 33,022,489 | 7.26 s–8.16 s | 214.2 MiB | 32.0 MiB | read 262,144 B / write 8,338 B | passed |
| mp3-to-ogg | 50,401,224 | 3 | 3,710,193 | 20.05 s–20.48 s | 164.0 MiB | 32.0 MiB | read 262,144 B / write 3,574 B | passed |
| mp3-to-opus | 50,401,224 | 3 | 19,266,368 | 11.17 s–11.74 s | 148.6 MiB | 32.0 MiB | read 262,144 B / write 9,186 B | passed |
| mp3-to-wav | 50,401,224 | 3 | 201,600,128 | 3.36 s–3.60 s | 191.9 MiB | 32.0 MiB | read 262,144 B / write 260,574 B | passed |
| mp4-to-3gp | 147,136,621 | 3 | 147,128,560 | 0.75 s–1.10 s | 205.3 MiB | 67.9 MiB | read 262,144 B / write 262,144 B | passed |
| mp4-to-aac | 146,854,557 | 3 | 1,037,649 | 0.47 s–0.77 s | 175.7 MiB | 32.0 MiB | read 262,144 B / write 478 B | passed |
| mp4-to-flac | 146,854,557 | 3 | 986,210 | 1.23 s–1.54 s | 214.2 MiB | 32.0 MiB | read 262,144 B / write 8,367 B | passed |
| mp4-to-flv | 147,136,622 | 3 | 147,164,014 | 1.03 s–1.33 s | 187.5 MiB | 32.0 MiB | read 262,144 B / write 262,144 B | passed |
| mp4-to-h264 | 146,854,557 | 3 | 145,801,019 | 1.60 s–1.88 s | 213.8 MiB | 32.0 MiB | read 262,144 B / write 115,516 B | passed |
| mp4-to-hevc | 149,251,863 | 3 | 134,752,786 | 2.06 s–2.49 s | 206.1 MiB | 32.0 MiB | read 262,144 B / write 262,144 B | passed |
| mp4-to-m2v | 136,284,917 | 3 | 136,166,136 | 1.68 s–2.04 s | 210.8 MiB | 32.0 MiB | read 262,144 B / write 28,829 B | passed |
| mp4-to-m4a | 2,964,855,971 | 3 | 249,427,976 | 2.58 s–2.89 s | 203.3 MiB | 73.8 MiB | read 262,144 B / write 103,136 B | passed |
| mp4-to-m4v | 179,625,218 | 3 | 179,609,473 | 1.71 s–1.98 s | 195.4 MiB | 32.0 MiB | read 262,144 B / write 150,681 B | passed |
| mp4-to-mkv | 147,136,623 | 3 | 147,130,793 | 0.89 s–1.22 s | 172.9 MiB | 32.0 MiB | read 262,144 B / write 262,144 B | passed |
| mp4-to-mov | 147,136,624 | 3 | 147,128,782 | 0.73 s–1.06 s | 219.3 MiB | 67.9 MiB | read 262,144 B / write 262,144 B | passed |
| mp4-to-mp3 | 181,344,111 | 3 | 1,441,275 | 1.20 s–1.54 s | 229.2 MiB | 32.0 MiB | read 262,144 B / write 699 B | passed |
| mp4-to-mpeg-ts | 147,136,623 | 3 | 150,835,032 | 1.13 s–1.43 s | 170.0 MiB | 32.0 MiB | read 262,144 B / write 262,144 B | passed |
| mp4-to-wav | 2,964,855,971 | 3 | 7,107,834,950 | 93.11 s–93.94 s | 224.1 MiB | 73.8 MiB | read 262,144 B / write 24,576 B | passed |
| mp4-to-webm | 147,136,619 | 3 | 5,105,363 | 12.84 s–13.34 s | 226.9 MiB | 64.0 MiB | read 262,144 B / write 262,144 B | passed |
| mp4-to-webm-vp9 | 147,136,625 | 3 | 4,143,084 | 14.80 s–15.36 s | 237.1 MiB | 64.0 MiB | read 262,144 B / write 262,144 B | passed |
| mpeg-ts-to-3gp | 150,441,548 | 3 | 146,864,096 | 1.20 s–1.55 s | 218.7 MiB | 71.0 MiB | read 262,144 B / write 262,144 B | passed |
| mpeg-ts-to-aac | 150,441,548 | 3 | 1,037,546 | 0.75 s–1.08 s | 211.3 MiB | 32.0 MiB | read 262,144 B / write 478 B | passed |
| mpeg-ts-to-flac | 150,441,548 | 3 | 987,948 | 1.50 s–1.98 s | 211.6 MiB | 32.0 MiB | read 262,144 B / write 8,288 B | passed |
| mpeg-ts-to-flv | 150,441,548 | 3 | 146,913,131 | 1.55 s–1.88 s | 196.6 MiB | 32.0 MiB | read 262,144 B / write 115,545 B | passed |
| mpeg-ts-to-h264 | 150,441,548 | 3 | 145,810,379 | 1.90 s–2.28 s | 211.5 MiB | 32.0 MiB | read 262,144 B / write 115,522 B | passed |
| mpeg-ts-to-hevc | 157,710,004 | 3 | 134,873,760 | 2.82 s–3.78 s | 212.2 MiB | 32.0 MiB | read 262,144 B / write 262,144 B | passed |
| mpeg-ts-to-m2v | 142,273,136 | 3 | 136,166,136 | 1.96 s–2.31 s | 198.6 MiB | 32.0 MiB | read 262,144 B / write 28,829 B | passed |
| mpeg-ts-to-m4a | 175,444,796 | 3 | 11,455,964 | 1.51 s–1.69 s | 220.2 MiB | 56.0 MiB | read 262,144 B / write 80,260 B | passed |
| mpeg-ts-to-mkv | 150,441,548 | 3 | 146,864,538 | 1.35 s–1.64 s | 180.4 MiB | 32.0 MiB | read 262,144 B / write 262,144 B | passed |
| mpeg-ts-to-mov | 150,441,548 | 3 | 146,864,256 | 1.17 s–1.50 s | 227.9 MiB | 71.0 MiB | read 262,144 B / write 262,144 B | passed |
| mpeg-ts-to-mp3 | 185,645,300 | 3 | 1,441,172 | 1.78 s–2.14 s | 236.9 MiB | 32.0 MiB | read 262,144 B / write 596 B | passed |
| mpeg-ts-to-mp4 | 175,444,796 | 3 | 167,139,361 | 2.14 s–2.42 s | 215.6 MiB | 56.0 MiB | read 262,144 B / write 262,144 B | passed |
| mpeg-ts-to-wav | 175,444,796 | 3 | 68,776,014 | 4.21 s–4.81 s | 243.7 MiB | 56.0 MiB | read 262,144 B / write 2,048 B | passed |
| mpeg-ts-to-webm | 150,441,548 | 3 | 4,947,933 | 9.59 s–9.97 s | 220.4 MiB | 40.0 MiB | read 262,144 B / write 262,144 B | passed |
| mpeg-ts-to-webm-vp9 | 150,441,548 | 3 | 3,372,580 | 13.81 s–14.39 s | 222.9 MiB | 56.0 MiB | read 262,144 B / write 262,144 B | passed |
| ndjson-to-csv | 288,143,880 | 3 | 139,913,895 | 8.08 s–8.40 s | 183.2 MiB | 0.0 MiB | read 262,144 B / write 262,144 B | passed |
| ndjson-to-json | 288,143,880 | 3 | 299,123,885 | 7.48 s–7.69 s | 176.1 MiB | 0.0 MiB | read 262,144 B / write 262,144 B | passed |
| ndjson-to-tsv | 288,143,880 | 3 | 139,913,895 | 8.03 s–8.12 s | 186.5 MiB | 0.0 MiB | read 262,144 B / write 262,144 B | passed |
| odp-to-txt | 135,272,481 | 3 | 109,181,183 | 10.34 s–10.56 s | 199.1 MiB | 0.0 MiB | read 262,144 B / write 262,144 B | passed |
| ods-to-csv | 135,267,401 | 3 | 37,117,581 | 8.61 s–8.67 s | 196.2 MiB | 0.0 MiB | read 262,144 B / write 262,144 B | passed |
| odt-to-txt | 135,267,233 | 3 | 108,212,672 | 10.38 s–10.90 s | 191.1 MiB | 0.0 MiB | read 262,144 B / write 262,144 B | passed |
| ogg-to-aac | 144,431,506 | 3 | 56,072,323 | 38.05 s–38.55 s | 160.7 MiB | 32.0 MiB | read 262,144 B / write 578 B | passed |
| ogg-to-aiff | 144,431,506 | 3 | 441,600,054 | 9.63 s–10.03 s | 169.0 MiB | 32.0 MiB | read 262,144 B / write 32,768 B | passed |
| ogg-to-amr | 144,431,506 | 3 | 3,680,038 | 25.20 s–26.29 s | 155.7 MiB | 32.0 MiB | read 262,144 B / write 32 B | passed |
| ogg-to-flac | 144,431,506 | 3 | 397,265,921 | 15.35 s–15.46 s | 198.4 MiB | 32.0 MiB | read 262,144 B / write 16,617 B | passed |
| ogg-to-mp3 | 144,431,506 | 3 | 55,201,581 | 38.06 s–39.19 s | 178.6 MiB | 32.0 MiB | read 262,144 B / write 621 B | passed |
| ogg-to-opus | 144,431,506 | 3 | 35,820,420 | 20.66 s–21.68 s | 155.3 MiB | 32.0 MiB | read 262,144 B / write 15,598 B | passed |
| ogg-to-wav | 4,580,949 | 3 | 201,600,078 | 5.91 s–7.02 s | 196.7 MiB | 32.0 MiB | read 262,144 B / write 2,048 B | passed |
| ogv-to-flac | 137,218,662 | 3 | 10,205,021 | 3.39 s–3.75 s | 213.1 MiB | 32.0 MiB | read 262,144 B / write 8,288 B | passed |
| ogv-to-mkv | 137,218,662 | 3 | 136,874,076 | 1.26 s–1.67 s | 167.4 MiB | 32.0 MiB | read 262,144 B / write 100,120 B | passed |
| ogv-to-ogg | 137,218,662 | 3 | 1,346,492 | 0.56 s–0.93 s | 202.4 MiB | 32.0 MiB | read 262,144 B / write 3,502 B | passed |
| ogv-to-wav | 137,635,308 | 3 | 74,880,078 | 3.34 s–3.91 s | 204.9 MiB | 32.0 MiB | read 262,144 B / write 2,048 B | passed |
| ogv-to-webm | 137,778,644 | 3 | 61,043,196 | 44.03 s–45.01 s | 199.4 MiB | 32.0 MiB | read 262,144 B / write 71,004 B | passed |
| ogv-to-webm-vp9 | 137,635,308 | 3 | 67,478,525 | 97.19 s–97.53 s | 224.1 MiB | 64.0 MiB | read 262,144 B / write 79,087 B | passed |
| opus-to-aac | 147,964,541 | 3 | 56,072,780 | 46.90 s–48.38 s | 147.2 MiB | 32.0 MiB | read 262,144 B / write 578 B | passed |
| opus-to-aiff | 147,964,541 | 3 | 441,600,054 | 19.00 s–19.65 s | 180.2 MiB | 32.0 MiB | read 262,144 B / write 32,768 B | passed |
| opus-to-amr | 147,964,541 | 3 | 3,680,038 | 34.38 s–35.64 s | 163.1 MiB | 32.0 MiB | read 262,144 B / write 32 B | passed |
| opus-to-flac | 147,964,541 | 3 | 386,531,887 | 25.55 s–26.09 s | 194.4 MiB | 32.0 MiB | read 262,144 B / write 16,213 B | passed |
| opus-to-mp3 | 147,964,541 | 3 | 55,201,581 | 47.71 s–49.00 s | 144.0 MiB | 32.0 MiB | read 262,144 B / write 621 B | passed |
| opus-to-ogg | 147,964,541 | 3 | 36,194,998 | 57.51 s–58.47 s | 159.8 MiB | 32.0 MiB | read 262,144 B / write 16,243 B | passed |
| opus-to-wav | 40,289,464 | 3 | 201,600,078 | 11.63 s–11.80 s | 229.3 MiB | 32.0 MiB | read 262,144 B / write 1,920 B | passed |
| png-to-bmp | 780,611 | 3 | 24,883,254 | 0.29 s–0.39 s | 196.0 MiB | 0.0 MiB | read 262,144 B / write 195,840 B | passed |
| png-to-ico | 780,611 | 3 | 12,290 | 0.11 s–0.17 s | 89.3 MiB | 0.0 MiB | read 262,144 B / write 12,268 B | passed |
| png-to-jpeg | 780,611 | 3 | 374,384 | 0.14 s–0.19 s | 71.2 MiB | 0.0 MiB | read 262,144 B / write 262,144 B | passed |
| png-to-webp | 780,611 | 3 | 257,798 | 0.42 s–0.48 s | 189.5 MiB | 0.0 MiB | read 262,144 B / write 257,798 B | passed |
| pptx-to-txt | 135,296,355 | 3 | 92,391,679 | 10.50 s–10.93 s | 217.4 MiB | 0.0 MiB | read 262,144 B / write 262,144 B | passed |
| sevenzip-to-tar | 268,435,574 | 3 | 268,436,992 | 7.09 s–7.60 s | 199.8 MiB | 56.0 MiB | read 262,144 B / write 65,536 B | passed |
| sevenzip-to-tar-bz2 | 268,435,574 | 3 | 270,592,878 | 40.86 s–41.61 s | 186.5 MiB | 64.0 MiB | read 262,144 B / write 65,536 B | passed |
| sevenzip-to-tar-gz | 268,435,574 | 3 | 268,517,545 | 30.24 s–30.54 s | 222.7 MiB | 56.0 MiB | read 262,144 B / write 16,384 B | passed |
| sevenzip-to-tar-xz | 268,435,574 | 3 | 268,449,796 | 50.58 s–50.83 s | 234.9 MiB | 104.0 MiB | read 262,144 B / write 65,536 B | passed |
| sevenzip-to-zip | 268,435,574 | 3 | 268,517,517 | 29.88 s–31.08 s | 218.3 MiB | 56.0 MiB | read 262,144 B / write 16,384 B | passed |
| srt-to-ass | 67,327,792 | 3 | 83,203,467 | 4.00 s–4.09 s | 177.0 MiB | 0.0 MiB | read 262,144 B / write 262,144 B | passed |
| srt-to-ttml | 67,327,792 | 3 | 82,349,061 | 3.71 s–3.83 s | 201.3 MiB | 0.0 MiB | read 262,144 B / write 262,144 B | passed |
| srt-to-vtt | 67,327,792 | 3 | 63,088,906 | 2.89 s–2.93 s | 180.6 MiB | 0.0 MiB | read 262,144 B / write 262,144 B | passed |
| svg-to-png | 327,564 | 3 | 196,588 | 0.44 s–0.65 s | 202.2 MiB | not exposed | read 196,608 B / write 196,588 B | passed |
| tar-bz2-to-sevenzip | 270,592,763 | 3 | 268,435,574 | 25.06 s–25.69 s | 187.2 MiB | 64.0 MiB | read 262,144 B / write 65,536 B / scratch 61,440 B read/write | passed |
| tar-bz2-to-tar | 270,592,763 | 3 | 268,436,992 | 23.50 s–23.77 s | 137.0 MiB | 8.0 MiB | read 262,144 B / write 65,536 B | passed |
| tar-bz2-to-tar-gz | 270,592,763 | 3 | 268,517,551 | 51.26 s–52.65 s | 183.9 MiB | 8.0 MiB | read 262,144 B / write 16,384 B | passed |
| tar-bz2-to-tar-xz | 270,592,763 | 3 | 268,449,796 | 70.70 s–71.99 s | 195.9 MiB | 56.0 MiB | read 262,144 B / write 65,536 B | passed |
| tar-bz2-to-zip | 270,592,763 | 3 | 268,517,517 | 51.19 s–51.31 s | 190.5 MiB | 8.0 MiB | read 262,144 B / write 16,384 B | passed |
| tar-gz-to-sevenzip | 268,517,551 | 3 | 268,435,574 | 8.22 s–9.17 s | 225.8 MiB | 56.0 MiB | read 262,144 B / write 65,536 B / scratch 61,440 B read/write | passed |
| tar-gz-to-tar | 268,517,551 | 3 | 268,436,992 | 3.71 s–3.96 s | 146.6 MiB | 0.0 MiB | read 262,144 B / write 65,536 B | passed |
| tar-gz-to-tar-bz2 | 268,517,551 | 3 | 270,592,763 | 42.45 s–43.04 s | 168.7 MiB | 8.0 MiB | read 262,144 B / write 65,536 B | passed |
| tar-gz-to-tar-xz | 268,517,551 | 3 | 268,449,796 | 54.92 s–56.42 s | 191.6 MiB | 48.0 MiB | read 262,144 B / write 65,536 B | passed |
| tar-gz-to-zip | 268,517,551 | 3 | 268,517,517 | 21.19 s–21.49 s | 201.1 MiB | 0.0 MiB | read 262,144 B / write 16,384 B | passed |
| tar-to-sevenzip | 268,436,992 | 3 | 268,435,574 | 8.06 s–8.94 s | 216.9 MiB | 56.0 MiB | read 262,144 B / write 65,536 B / scratch 61,440 B read/write | passed |
| tar-to-tar-bz2 | 268,436,992 | 3 | 270,592,763 | 38.94 s–39.77 s | 136.6 MiB | 8.0 MiB | read 262,144 B / write 65,536 B | passed |
| tar-to-tar-gz | 268,436,992 | 3 | 268,517,551 | 15.86 s–16.02 s | 219.3 MiB | 0.0 MiB | read 262,144 B / write 16,384 B | passed |
| tar-to-tar-xz | 268,436,992 | 3 | 268,449,796 | 51.51 s–52.33 s | 175.0 MiB | 48.0 MiB | read 262,144 B / write 65,536 B | passed |
| tar-to-zip | 268,436,992 | 3 | 268,517,517 | 16.67 s–16.85 s | 183.1 MiB | 0.0 MiB | read 262,144 B / write 16,384 B | passed |
| tar-xz-to-sevenzip | 268,449,796 | 3 | 268,435,574 | 8.25 s–8.42 s | 231.1 MiB | 80.0 MiB | read 262,144 B / write 65,536 B / scratch 61,440 B read/write | passed |
| tar-xz-to-tar | 268,449,796 | 3 | 268,436,992 | 6.21 s–6.65 s | 173.7 MiB | 48.0 MiB | read 262,144 B / write 65,536 B | passed |
| tar-xz-to-tar-bz2 | 268,449,796 | 3 | 270,592,763 | 42.39 s–42.73 s | 209.4 MiB | 56.0 MiB | read 262,144 B / write 65,536 B | passed |
| tar-xz-to-tar-gz | 268,449,796 | 3 | 268,517,551 | 34.25 s–35.22 s | 239.9 MiB | 48.0 MiB | read 262,144 B / write 16,384 B | passed |
| tar-xz-to-zip | 268,449,796 | 3 | 268,517,517 | 33.22 s–35.50 s | 228.8 MiB | 48.0 MiB | read 262,144 B / write 16,384 B | passed |
| tiff-to-png | 50,338,032 | 3 | 577,310 | 1.67 s–1.81 s | 164.1 MiB | 40.0 MiB | read 49,152 B / write 32,768 B | passed |
| tsv-to-csv | 134,423,894 | 3 | 139,913,895 | 8.34 s–8.49 s | 200.3 MiB | 0.0 MiB | read 262,144 B / write 262,144 B | passed |
| tsv-to-json | 134,423,894 | 3 | 299,123,885 | 18.32 s–19.93 s | 194.1 MiB | 0.0 MiB | read 262,144 B / write 262,144 B | passed |
| tsv-to-ndjson | 134,423,894 | 3 | 288,143,880 | 9.67 s–9.77 s | 226.5 MiB | 0.0 MiB | read 262,144 B / write 262,144 B | passed |
| ttml-to-srt | 82,349,061 | 3 | 71,607,792 | 4.77 s–4.90 s | 194.9 MiB | 0.0 MiB | read 262,144 B / write 262,144 B | passed |
| ttml-to-vtt | 82,349,061 | 3 | 63,088,906 | 4.63 s–4.73 s | 198.4 MiB | 0.0 MiB | read 262,144 B / write 262,144 B | passed |
| txt-to-html | 67,130,000 | 3 | 94,530,182 | 0.79 s–0.88 s | 128.8 MiB | 0.0 MiB | read 262,144 B / write 262,144 B | passed |
| vtt-to-ass | 73,788,904 | 3 | 83,203,467 | 3.84 s–4.34 s | 187.1 MiB | 0.0 MiB | read 262,144 B / write 262,144 B | passed |
| vtt-to-srt | 73,788,904 | 3 | 71,607,792 | 2.79 s–2.84 s | 200.6 MiB | 0.0 MiB | read 262,144 B / write 262,144 B | passed |
| vtt-to-ttml | 73,788,904 | 3 | 82,349,061 | 3.48 s–3.58 s | 204.5 MiB | 0.0 MiB | read 262,144 B / write 262,144 B | passed |
| wav-to-aac | 153,600,106 | 3 | 19,503,506 | 12.20 s–13.08 s | 153.8 MiB | 32.0 MiB | read 262,144 B / write 577 B | passed |
| wav-to-aiff | 153,600,106 | 3 | 153,600,102 | 1.60 s–2.10 s | 172.5 MiB | 32.0 MiB | read 262,144 B / write 32,768 B | passed |
| wav-to-alac | 153,600,106 | 3 | 140,941,506 | 6.14 s–6.58 s | 200.2 MiB | 32.0 MiB | read 262,144 B / write 262,144 B | passed |
| wav-to-amr | 153,600,106 | 3 | 1,280,038 | 7.67 s–7.87 s | 162.1 MiB | 32.0 MiB | read 262,144 B / write 32 B | passed |
| wav-to-flac | 201,600,106 | 3 | 29,551,762 | 4.52 s–5.02 s | 181.7 MiB | 32.0 MiB | read 262,144 B / write 8,338 B | passed |
| wav-to-mp3 | 153,600,106 | 3 | 19,201,633 | 12.89 s–13.51 s | 159.4 MiB | 32.0 MiB | read 262,144 B / write 673 B | passed |
| wav-to-ogg | 153,600,106 | 3 | 12,155,741 | 16.12 s–16.44 s | 160.6 MiB | 32.0 MiB | read 262,144 B / write 15,468 B | passed |
| wav-to-opus | 153,600,106 | 3 | 12,459,549 | 6.08 s–6.42 s | 174.4 MiB | 32.0 MiB | read 262,144 B / write 15,593 B | passed |
| wav-to-wma | 153,600,104 | 3 | 60,000,756 | 11.72 s–11.98 s | 150.2 MiB | 32.0 MiB | read 262,144 B / write 3,200 B | passed |
| webm-to-mkv | 222,941,314 | 3 | 222,940,925 | 1.15 s–1.60 s | 178.4 MiB | 32.0 MiB | read 262,144 B / write 262,144 B | passed |
| webm-to-ogg | 222,124,822 | 3 | 106,739 | 0.40 s–0.74 s | 185.0 MiB | 32.0 MiB | read 262,144 B / write 3,533 B | passed |
| webm-to-opus | 222,941,314 | 3 | 922,267 | 0.40 s–0.76 s | 206.0 MiB | 32.0 MiB | read 262,144 B / write 15,406 B | passed |
| webp-to-bmp | 263,320 | 3 | 24,883,254 | 0.29 s–0.37 s | 196.5 MiB | 0.0 MiB | read 196,608 B / write 195,840 B | passed |
| webp-to-ico | 263,320 | 3 | 13,013 | 0.10 s–0.16 s | 77.6 MiB | 0.0 MiB | read 197,784 B / write 12,991 B | passed |
| webp-to-jpeg | 263,320 | 3 | 364,322 | 0.13 s–0.18 s | 69.9 MiB | 0.0 MiB | read 131,072 B / write 262,144 B | passed |
| webp-to-png | 263,320 | 3 | 1,528,103 | 0.12 s–0.17 s | 69.8 MiB | 0.0 MiB | read 197,784 B / write 262,144 B | passed |
| wma-to-aac | 142,503,082 | 3 | 46,316,859 | 29.67 s–30.28 s | 162.1 MiB | 32.0 MiB | read 262,144 B / write 582 B | passed |
| wma-to-aiff | 142,503,082 | 3 | 364,798,054 | 7.03 s–7.38 s | 179.0 MiB | 32.0 MiB | read 262,144 B / write 32,768 B | passed |
| wma-to-amr | 142,503,082 | 3 | 3,040,006 | 19.50 s–20.36 s | 149.8 MiB | 32.0 MiB | read 262,144 B / write 32 B | passed |
| wma-to-flac | 142,503,082 | 3 | 326,238,814 | 12.91 s–13.56 s | 191.2 MiB | 32.0 MiB | read 262,144 B / write 16,523 B | passed |
| wma-to-mp3 | 142,503,082 | 3 | 45,601,440 | 31.27 s–31.74 s | 149.7 MiB | 32.0 MiB | read 262,144 B / write 672 B | passed |
| wma-to-ogg | 142,503,082 | 3 | 28,839,568 | 38.79 s–39.21 s | 155.3 MiB | 32.0 MiB | read 262,144 B / write 15,441 B | passed |
| wma-to-opus | 142,503,082 | 3 | 29,589,154 | 15.66 s–16.21 s | 163.0 MiB | 32.0 MiB | read 262,144 B / write 15,595 B | passed |
| wma-to-wav | 142,503,082 | 3 | 364,798,078 | 7.95 s–8.20 s | 190.7 MiB | 32.0 MiB | read 262,144 B / write 8,192 B | passed |
| xlsx-to-csv | 135,267,834 | 3 | 55,148,347 | 14.67 s–15.26 s | 218.4 MiB | 0.0 MiB | read 262,144 B / write 262,144 B | passed |
| xml-to-ndjson | 134,218,700 | 3 | 156,960,149 | 2.29 s–2.46 s | 165.1 MiB | 0.0 MiB | read 262,144 B / write 262,144 B | passed |
| xz-compress | 268,435,456 | 3 | 268,448,840 | 52.48 s–56.84 s | 172.7 MiB | 48.0 MiB | read 262,144 B / write 65,536 B | passed |
| xz-decompress | 268,448,840 | 3 | 268,435,456 | 6.32 s–6.98 s | 203.0 MiB | 48.0 MiB | read 262,144 B / write 65,536 B | passed |
| xz-to-bzip2 | 268,448,840 | 3 | 270,593,081 | 42.36 s–42.72 s | 196.4 MiB | 56.0 MiB | read 262,144 B / write 65,536 B | passed |
| xz-to-gzip | 268,448,840 | 3 | 268,517,399 | 34.65 s–41.21 s | 236.2 MiB | 48.0 MiB | read 262,144 B / write 16,384 B | passed |
| zip-to-sevenzip | 268,517,517 | 3 | 268,435,574 | 9.25 s–9.45 s | 236.2 MiB | 56.0 MiB | read 262,144 B / write 65,536 B / scratch 61,440 B read/write | passed |
| zip-to-tar | 268,517,517 | 3 | 268,436,992 | 3.91 s–4.19 s | 194.4 MiB | 0.0 MiB | read 262,144 B / write 65,536 B | passed |
| zip-to-tar-bz2 | 268,517,517 | 3 | 270,592,831 | 42.52 s–43.06 s | 160.6 MiB | 8.0 MiB | read 262,144 B / write 65,536 B | passed |
| zip-to-tar-gz | 268,517,517 | 3 | 268,517,554 | 21.41 s–22.16 s | 194.5 MiB | 0.0 MiB | read 262,144 B / write 16,384 B | passed |
| zip-to-tar-xz | 268,517,517 | 3 | 268,449,796 | 55.77 s–56.03 s | 195.7 MiB | 48.0 MiB | read 262,144 B / write 65,536 B | passed |

## Retained failure evidence

These are historical failed attempts retained for diagnosis. A later passing report does not erase the failure or its measured boundary.

| When | Profile | Source bytes | Completed runs | Last input bytes | Failure |
| --- | --- | ---: | ---: | ---: | --- |
| 2026-07-31T01:31:20.401Z | mkv-to-webm | 936,003 | 3 | 936,003 | The retained Chrome stress report did not pass. |
| 2026-07-31T06:16:57.954Z | png-to-jpeg | 780,611 | 3 | 780,611 | Failed checks: readChunkBytes; measured 68.0 MiB against a 250.0 MiB limit. |
| 2026-07-31T06:39:21.714Z | webp-to-png | 263,320 | 3 | 263,320 | Failed checks: repeatableOutputHash; measured 74.8 MiB against a 250.0 MiB limit. |
| 2026-07-31T06:42:49.152Z | webp-to-jpeg | 263,320 | 3 | 263,320 | Failed checks: repeatableOutputHash; measured 70.6 MiB against a 250.0 MiB limit. |
| 2026-07-31T07:08:25.103Z | jpeg-to-bmp | 418,486 | 3 | 418,486 | Failed checks: repeatableOutputHash; measured 184.3 MiB against a 250.0 MiB limit. |
| 2026-07-31T07:42:28.891Z | jpeg-to-png | 418,486 | 3 | 418,486 | Failed checks: repeatableOutputHash; measured 68.2 MiB against a 250.0 MiB limit. |
| 2026-07-31T08:25:25.261Z | m4a-to-flac | 36,929,878 | 0 | 36,929,878 | Browser media metadata validation failed: audio-onlyxaudio-only, 1 channels, not-applicable, 2100.010667s. |
| 2026-07-31T08:36:37.569Z | csv-to-tsv | 134,423,894 | 3 | 134,423,894 | Failed checks: readChunkBytes; measured 190.4 MiB against a 250.0 MiB limit. |
| 2026-07-31T09:03:57.365Z | srt-to-vtt | 67,327,792 | 3 | 67,327,792 | Failed checks: cleanupRecovery; measured 183.8 MiB against a 250.0 MiB limit. |
| 2026-07-31T13:04:01.391Z | m4a-to-wav | 36,929,878 | 3 | 36,929,878 | Failed checks: processTreePrivateMemory; measured 271.7 MiB against a 250.0 MiB limit. |
| 2026-07-31T18:08:55.298Z | mkv-to-webm | 37,460,711 | 1 | 37,460,711 | Failed checks: processTreePrivateMemory; measured 267.3 MiB against a 250.0 MiB limit. |
| 2026-07-31T19:23:24.635Z | mkv-to-mp4-mpeg4 | 37,460,711 | 1 | 37,460,711 | Failed checks: processTreePrivateMemory; measured 254.2 MiB against a 250.0 MiB limit. |
| 2026-07-31T20:18:46.844Z | mkv-to-mp4-mpeg4 | 2,958,573,265 | 0 | 2,958,573,265 | Browser video midpoint visual validation failed: SSIM unavailable. |
| 2026-07-31T23:16:10.483Z | mkv-to-mp4 | 2,958,573,265 | 1 | 2,958,573,265 | Failed checks: queuedBytes, writeChunkBytes; measured 216.5 MiB against a 250.0 MiB limit. |
| 2026-07-31T23:46:30.284Z | xml-to-ndjson | 134,218,700 | 0 | 128,974,848 | Conversion run 1 failed: Conversion worker failed to start: the browser blocked or rejected the worker script. |
| 2026-08-01T01:43:50.327Z | epub-to-txt | 134,219,595 | 3 | 134,219,595 | Failed checks: processTreePrivateMemory; measured 254.3 MiB against a 250.0 MiB limit. |
| 2026-08-01T04:32:00.293Z | mpeg-ts-to-mp4 | 157,710,004 | 0 | 2,347,152 | Conversion run 1 failed: [aac @ 0x474110] Error decoding AAC frame header. \| [aac @ 0x474110] Error decoding AAC frame header. \| [aac @ 0x474110] Error decoding AAC frame header. \| |
| 2026-08-01T04:37:07.771Z | mpeg-ts-to-mp4 | 161,109,984 | 0 | 2,347,152 | Conversion run 1 failed: [aac @ 0x473a90] Error decoding AAC frame header. \| [aac @ 0x473a90] Error decoding AAC frame header. \| [aac @ 0x473a90] Error decoding AAC frame header. \| |
| 2026-08-01T04:38:44.400Z | mpeg-ts-to-mp4 | 175,444,796 | 0 | 175,444,796 | Unexpected browser MP4 streams: h264, aac. |
| 2026-08-01T04:43:46.389Z | mpeg-ts-to-wav | 175,444,796 | 0 | 175,444,796 | Browser media metadata validation failed: audio-onlyxaudio-only, 1 channels, not-applicable, 716.416s. |
| 2026-08-01T05:02:40.476Z | flv-to-m4a | 167,517,193 | 0 | 167,517,193 | Browser media metadata validation failed: audio-onlyxaudio-only, 1 channels, und, 720.035s. |
| 2026-08-01T05:26:46.307Z | avi-to-wav | 230,929,466 | 0 | 230,929,466 | Browser media metadata validation failed: audio-onlyxaudio-only, 1 channels, not-applicable, 718.272s. |
| 2026-08-01T08:45:53.233Z | amr-to-wav | 134,229,414 | 0 | 262,144 | Conversion run 1 failed: [amrnb @ 0x481f70] Corrupt bitstream \| Audio decode or encode failed: Invalid data found when processing input |
| 2026-08-01T11:47:20.151Z | tar-xz-to-tar | 268,449,796 | 3 | 268,449,796 | Failed checks: cleanupRecovery; measured 177.3 MiB against a 250.0 MiB limit. |
| 2026-08-01T12:46:34.682Z | sevenzip-to-tar | 1,087,945 | 0 | 1,087,945 | Conversion run 1 failed: 7Z exceeds the 100:1 expansion safety limit |
| 2026-08-01T12:49:18.626Z | sevenzip-to-tar | 268,435,574 | 3 | 268,435,574 | Failed checks: processTreePrivateMemory; measured 277.0 MiB against a 250.0 MiB limit. |
| 2026-08-01T14:59:04.416Z | tiff-to-png | 50,338,032 | 0 | 50,338,032 | Browser image visual validation failed: SSIM 0.000001. |
| 2026-08-01T18:31:33.371Z | tar-xz-to-sevenzip | 268,449,796 | 3 | 268,449,796 | Failed checks: processTreePrivateMemory; measured 250.1 MiB against a 250.0 MiB limit. |
| 2026-08-01T20:55:44.715Z | m2v-to-webm-vp9 | 136,166,136 | 0 | 786,432 | Conversion run 1 failed: [libvpx-vp9 @ 0x4dace0] v1.16.0 \| [libvpx-vp9 @ 0x4dace0] Error encoding frame: Unspecified internal error \| [libvpx-vp9 @ 0x4dace0]   Additional informati |
| 2026-08-01T21:04:36.605Z | mkv-to-webm-vp9 | 181,825,549 | 0 | 173,771,355 | Conversion run 1 failed: [libvpx-vp9 @ 0x92af60] v1.16.0 \| Video decode or VP9 encode failed: Out of memory |
| 2026-08-01T22:28:35.943Z | mp4-to-webm-vp9 | 161,758,724 | 3 | 161,758,724 | Failed checks: processTreePrivateMemory; measured 256.1 MiB against a 250.0 MiB limit. |
| 2026-08-01T22:34:47.662Z | mp4-to-webm-vp9 | 147,136,619 | 3 | 147,136,619 | Failed checks: processTreePrivateMemory; measured 254.5 MiB against a 250.0 MiB limit. |
| 2026-08-01T22:37:44.431Z | mp4-to-webm-vp9 | 147,499,419 | 3 | 147,499,419 | Failed checks: processTreePrivateMemory; measured 268.5 MiB against a 250.0 MiB limit. |
| 2026-08-01T23:19:09.425Z | flv-to-webm | 147,164,019 | 3 | 147,164,019 | Failed checks: processTreePrivateMemory; measured 266.2 MiB against a 250.0 MiB limit. |
| 2026-08-01T23:22:42.411Z | 3gp-to-webm | 146,854,481 | 3 | 146,854,481 | Failed checks: processTreePrivateMemory; measured 255.2 MiB against a 250.0 MiB limit. |
| 2026-08-01T23:54:48.472Z | avi-to-webm | 159,500,442 | 0 | 159,500,442 | Browser media metadata validation failed: 640x266, video-only channels, not-applicable, 64.25s. |
| 2026-08-02T00:39:29.177Z | ogv-to-flac | 137,778,644 | 0 | 137,778,644 | Browser media metadata validation failed: audio-onlyxaudio-only, 1 channels, not-applicable, 782.586667s. |
| 2026-08-02T01:14:58.482Z | h264-to-mp4 | 145,801,019 | 0 | 145,801,019 | Command failed: ffmpeg -v error -i H:\Github Repositories\fileconverter\work\memory-profile-chrome\Default\File System\000\t\00\00000000 -map 0:v:0 -map 0:a:0 -f null NUL
Stream ma |
| 2026-08-02T01:17:50.059Z | h264-to-webm | 145,801,019 | 0 | 145,801,019 | Browser video midpoint visual validation failed: SSIM unavailable. Validator tail:   Metadata: \|     encoder         : Lavf62.9.100 \|   Stream #0:0: Video: wrapped_avframe, yuv420p |
| 2026-08-09T13:00:28.900Z | m4v-to-mp4 | 135,961,430 | 0 | 1,310,720 | Conversion run 1 failed: [mp4 @ 0x52de90] pts (0) < dts (4750000) in stream 0 \| MP4 packet write failed: Invalid argument \| Remux failed: Invalid argument |
| 2026-08-09T14:56:03.039Z | mkv-to-aac | 146,855,294 | 0 | 146,855,294 | Browser media metadata validation failed: audio-onlyxaudio-only, 1 channels, not-applicable, 66.39529s. |
| 2026-08-09T15:06:09.738Z | flv-to-aac | 146,903,486 | 3 | 146,903,486 | Failed checks: processTreePrivateMemory; measured 291.4 MiB against a 250.0 MiB limit. |
| 2026-08-09T18:07:00.589Z | mp4-to-mkv | 147,136,622 | 3 | 147,136,622 | Failed checks: processTreePrivateMemory; measured 295.5 MiB against a 250.0 MiB limit. |
| 2026-08-09T18:35:07.249Z | avi-to-mkv | 159,500,442 | 0 | 159,500,442 | Browser media metadata validation failed: 1282x536, 1 channels, not-applicable, 65s. |
| 2026-08-09T19:21:59.802Z | mkv-to-mpeg-ts | 2,958,573,265 | 0 | 157,249 | Conversion run 1 failed: [mpegts @ 0x4dc7e0] Application provided invalid, non monotonically increasing dts to muxer in stream 0: 15030 >= 7470 \| MPEG-TS packet write failed: Inval |
| 2026-08-09T19:34:01.230Z | mkv-to-mpeg-ts | 147,131,069 | 0 | 147,131,069 | Browser MPEG-TS normalized compressed video packets or AAC access units do not exactly match the source. |
| 2026-08-09T19:35:29.058Z | mkv-to-mpeg-ts | 147,131,073 | 0 | 147,131,073 | Browser MPEG-TS decoded video frames or AAC access units do not exactly match the source. |
| 2026-08-12T15:21:54.859Z | m4a-to-amr | 36,929,878 | 0 | 36,929,878 | Browser media metadata validation failed: audio-onlyxaudio-only, 1 channels, not-applicable, 2167.762625s. |
| 2026-08-12T15:45:53.778Z | ogg-to-amr | 144,431,506 | 0 | 0 | Chromium selected 0 bytes; expected 144431506. |
| 2026-08-12T16:48:35.085Z | m4a-to-mp3 | 36,929,878 | 0 | 36,929,878 | Browser MP3 output packets do not exactly match the source MP3 payload. |
| 2026-08-12T17:10:33.003Z | amr-to-mp3 | 134,229,414 | 0 | 134,229,414 | Browser media output size is outside the validated range: 1342295469 bytes. |
| 2026-08-12T20:22:49.212Z | amr-to-aac | 134,229,414 | 0 | 134,229,414 | Browser media metadata validation failed: audio-onlyxaudio-only, 1 channels, not-applicable, 83893.632s. |
| 2026-08-12T22:16:24.159Z | m4a-to-opus | 36,929,878 | 0 | 36,929,878 | Browser media output size is outside the validated range: 19261785 bytes. |

## Every public passed profile

| Profile | Input category | Engine | Method | Largest tested source | Evidence snapshot |
| --- | --- | --- | --- | ---: | --- |
| 3gp-to-aac | video | ffmpeg-remux | stream-copy | 146,854,456 B | 3-run Chrome report |
| 3gp-to-flac | video | ffmpeg-audio | re-encode | 146,854,456 B | 3-run Chrome report |
| 3gp-to-flv | video | ffmpeg-remux | stream-copy | 146,854,522 B | 3-run Chrome report |
| 3gp-to-h264 | video | ffmpeg-remux | stream-copy | 146,854,456 B | 3-run Chrome report |
| 3gp-to-m4a | video | ffmpeg-remux | stream-copy | 167,130,850 B | 3-run Chrome report |
| 3gp-to-mkv | video | ffmpeg-remux | stream-copy | 146,854,522 B | 3-run Chrome report |
| 3gp-to-mov | video | ffmpeg-remux | stream-copy | 146,854,522 B | 3-run Chrome report |
| 3gp-to-mp4 | video | ffmpeg-remux | stream-copy | 167,130,850 B | 3-run Chrome report |
| 3gp-to-mpeg-ts | video | ffmpeg-remux | stream-copy | 146,854,522 B | 3-run Chrome report |
| 3gp-to-wav | video | ffmpeg-audio | re-encode | 167,130,850 B | 3-run Chrome report |
| 3gp-to-webm | video | ffmpeg-video | re-encode | 146,854,522 B | 3-run Chrome report |
| 3gp-to-webm-vp9 | video | ffmpeg-video | re-encode | 146,854,522 B | 3-run Chrome report |
| aac-to-aiff | audio | ffmpeg-audio | re-encode | 134,367,785 B | 3-run Chrome report |
| aac-to-amr | audio | ffmpeg-audio | re-encode | 134,367,785 B | 3-run Chrome report |
| aac-to-flac | audio | ffmpeg-audio | re-encode | 134,367,785 B | 3-run Chrome report |
| aac-to-m4a | audio | ffmpeg-remux | stream-copy | 134,367,785 B | 3-run Chrome report |
| aac-to-mp3 | audio | ffmpeg-audio | re-encode | 134,367,785 B | 3-run Chrome report |
| aac-to-ogg | audio | ffmpeg-audio | re-encode | 134,367,785 B | 3-run Chrome report |
| aac-to-opus | audio | ffmpeg-audio | re-encode | 134,367,785 B | 3-run Chrome report |
| aac-to-wav | audio | ffmpeg-audio | re-encode | 134,367,785 B | 3-run Chrome report |
| aiff-to-aac | audio | ffmpeg-audio | re-encode | 201,600,102 B | 3-run Chrome report |
| aiff-to-amr | audio | ffmpeg-audio | re-encode | 201,600,102 B | 3-run Chrome report |
| aiff-to-flac | audio | ffmpeg-audio | re-encode | 220,800,108 B | 3-run Chrome report |
| aiff-to-mp3 | audio | ffmpeg-audio | re-encode | 201,600,102 B | 3-run Chrome report |
| aiff-to-ogg | audio | ffmpeg-audio | re-encode | 201,600,102 B | 3-run Chrome report |
| aiff-to-opus | audio | ffmpeg-audio | re-encode | 201,600,102 B | 3-run Chrome report |
| aiff-to-wav | audio | ffmpeg-audio | re-encode | 201,600,102 B | 3-run Chrome report |
| amr-to-aac | audio | ffmpeg-audio | re-encode | 134,229,414 B | 3-run Chrome report |
| amr-to-aiff | audio | ffmpeg-audio | re-encode | 134,229,414 B | 3-run Chrome report |
| amr-to-flac | audio | ffmpeg-audio | re-encode | 134,229,414 B | 3-run Chrome report |
| amr-to-mp3 | audio | ffmpeg-audio | re-encode | 134,229,414 B | 3-run Chrome report |
| amr-to-ogg | audio | ffmpeg-audio | re-encode | 134,229,414 B | 3-run Chrome report |
| amr-to-opus | audio | ffmpeg-audio | re-encode | 134,229,414 B | 3-run Chrome report |
| amr-to-wav | audio | ffmpeg-audio | re-encode | 134,229,414 B | 3-run Chrome report |
| ass-to-srt | subtitle | subtitle-stream | stream | 101,393,068 B | 3-run Chrome report |
| ass-to-vtt | subtitle | subtitle-stream | stream | 101,393,068 B | 3-run Chrome report |
| avi-to-flac | video | ffmpeg-audio | re-encode | 159,500,442 B | 3-run Chrome report |
| avi-to-m2v | video | ffmpeg-remux | stream-copy | 136,465,056 B | 3-run Chrome report |
| avi-to-m4v | video | ffmpeg-remux | stream-copy | 179,650,578 B | 3-run Chrome report |
| avi-to-mkv | video | ffmpeg-remux | stream-copy | 159,500,442 B | 3-run Chrome report |
| avi-to-mp3 | video | ffmpeg-remux | stream-copy | 182,803,272 B | 3-run Chrome report |
| avi-to-mp4 | video | ffmpeg-remux | stream-copy | 230,929,466 B | 3-run Chrome report |
| avi-to-wav | video | ffmpeg-audio | re-encode | 230,929,466 B | 3-run Chrome report |
| avi-to-webm | video | ffmpeg-video | re-encode | 159,500,442 B | 3-run Chrome report |
| avi-to-webm-vp9 | video | ffmpeg-video | re-encode | 159,500,442 B | 3-run Chrome report |
| avif-to-bmp | image | image-browser | re-encode | 100,464 B | 3-run Chrome report |
| avif-to-ico | image | image-browser | re-encode | 100,464 B | 3-run Chrome report |
| avif-to-jpeg | image | image-browser | re-encode | 100,464 B | 3-run Chrome report |
| avif-to-png | image | image-browser | re-encode | 100,464 B | 3-run Chrome report |
| avif-to-webp | image | image-browser | re-encode | 100,464 B | 3-run Chrome report |
| bmp-to-ico | image | image-browser | re-encode | 24,883,254 B | 3-run Chrome report |
| bmp-to-jpeg | image | image-browser | re-encode | 24,883,254 B | 3-run Chrome report |
| bmp-to-png | image | image-browser | re-encode | 24,883,254 B | 3-run Chrome report |
| bmp-to-webp | image | image-browser | re-encode | 24,883,254 B | 3-run Chrome report |
| bzip2-compress | compression | bzip2-wasm | stream | 268,435,456 B | 3-run Chrome report |
| bzip2-decompress | compression | bzip2-wasm | stream | 270,593,081 B | 3-run Chrome report |
| bzip2-to-gzip | compression | compression-codec-pipeline | stream | 270,593,081 B | 3-run Chrome report |
| bzip2-to-xz | compression | compression-codec-pipeline | stream | 270,593,081 B | 3-run Chrome report |
| csv-to-json | data | records-stream | stream | 134,423,894 B | 3-run Chrome report |
| csv-to-ndjson | data | records-stream | stream | 134,423,894 B | 3-run Chrome report |
| csv-to-tsv | data | records-stream | stream | 134,423,894 B | 3-run Chrome report |
| docx-to-txt | document | document-stream | stream | 134,218,659 B | 3-run Chrome report |
| epub-to-txt | ebook | ebook-stream | stream | 134,219,595 B | 3-run Chrome report |
| flac-to-aac | audio | ffmpeg-audio | re-encode | 138,185,686 B | 3-run Chrome report |
| flac-to-aiff | audio | ffmpeg-audio | re-encode | 138,185,686 B | 3-run Chrome report |
| flac-to-alac | audio | ffmpeg-audio | re-encode | 138,185,686 B | 3-run Chrome report |
| flac-to-amr | audio | ffmpeg-audio | re-encode | 138,185,686 B | 3-run Chrome report |
| flac-to-mp3 | audio | ffmpeg-audio | re-encode | 138,185,686 B | 3-run Chrome report |
| flac-to-ogg | audio | ffmpeg-audio | re-encode | 138,185,686 B | 3-run Chrome report |
| flac-to-opus | audio | ffmpeg-audio | re-encode | 138,185,686 B | 3-run Chrome report |
| flac-to-wav | audio | ffmpeg-audio | re-encode | 52,298,514 B | 3-run Chrome report |
| flac-to-wma | audio | ffmpeg-audio | re-encode | 138,186,536 B | 3-run Chrome report |
| flv-to-3gp | video | ffmpeg-remux | stream-copy | 146,903,539 B | 3-run Chrome report |
| flv-to-aac | video | ffmpeg-remux | stream-copy | 146,903,486 B | 3-run Chrome report |
| flv-to-flac | video | ffmpeg-audio | re-encode | 146,903,486 B | 3-run Chrome report |
| flv-to-h264 | video | ffmpeg-remux | stream-copy | 146,903,486 B | 3-run Chrome report |
| flv-to-m4a | video | ffmpeg-remux | stream-copy | 167,517,193 B | 3-run Chrome report |
| flv-to-mkv | video | ffmpeg-remux | stream-copy | 146,903,539 B | 3-run Chrome report |
| flv-to-mov | video | ffmpeg-remux | stream-copy | 146,903,539 B | 3-run Chrome report |
| flv-to-mp3 | video | ffmpeg-remux | stream-copy | 181,377,794 B | 3-run Chrome report |
| flv-to-mp4 | video | ffmpeg-remux | stream-copy | 167,517,193 B | 3-run Chrome report |
| flv-to-mpeg-ts | video | ffmpeg-remux | stream-copy | 146,903,539 B | 3-run Chrome report |
| flv-to-wav | video | ffmpeg-audio | re-encode | 167,517,193 B | 3-run Chrome report |
| flv-to-webm | video | ffmpeg-video | re-encode | 146,903,539 B | 3-run Chrome report |
| flv-to-webm-vp9 | video | ffmpeg-video | re-encode | 146,903,539 B | 3-run Chrome report |
| gif-to-bmp | image | image-browser | re-encode | 281,853 B | 3-run Chrome report |
| gif-to-ico | image | image-browser | re-encode | 281,853 B | 3-run Chrome report |
| gif-to-jpeg | image | image-browser | re-encode | 281,853 B | 3-run Chrome report |
| gif-to-png | image | image-browser | re-encode | 281,853 B | 3-run Chrome report |
| gif-to-webp | image | image-browser | re-encode | 281,853 B | 3-run Chrome report |
| gzip-compress | compression | compression-stream | stream | 268,435,456 B | 3-run Chrome report |
| gzip-decompress | compression | compression-stream | stream | 268,517,399 B | 3-run Chrome report |
| gzip-to-bzip2 | compression | compression-codec-pipeline | stream | 268,517,399 B | 3-run Chrome report |
| gzip-to-xz | compression | compression-codec-pipeline | stream | 268,517,399 B | 3-run Chrome report |
| h264-to-mp4 | video | ffmpeg-remux | stream-copy | 145,801,019 B | 3-run Chrome report |
| h264-to-webm | video | ffmpeg-video | re-encode | 145,801,019 B | 3-run Chrome report |
| h264-to-webm-vp9 | video | ffmpeg-video | re-encode | 145,801,019 B | 3-run Chrome report |
| html-to-txt | document | document-stream | stream | 143,850,123 B | 3-run Chrome report |
| jpeg-to-bmp | image | image-browser | re-encode | 418,486 B | 3-run Chrome report |
| jpeg-to-ico | image | image-browser | re-encode | 418,486 B | 3-run Chrome report |
| jpeg-to-png | image | image-browser | re-encode | 418,486 B | 3-run Chrome report |
| jpeg-to-webp | image | image-browser | re-encode | 418,486 B | 3-run Chrome report |
| json-to-csv | data | records-stream | stream | 293,633,883 B | 3-run Chrome report |
| json-to-ndjson | data | records-stream | stream | 293,633,883 B | 3-run Chrome report |
| json-to-tsv | data | records-stream | stream | 293,633,883 B | 3-run Chrome report |
| m2v-to-mp4-mpeg4 | video | ffmpeg-video | re-encode | 136,166,136 B | 3-run Chrome report |
| m2v-to-mpeg-ts | video | ffmpeg-remux | stream-copy | 136,166,136 B | 3-run Chrome report |
| m2v-to-webm | video | ffmpeg-video | re-encode | 136,166,136 B | 3-run Chrome report |
| m2v-to-webm-vp9 | video | ffmpeg-video | re-encode | 136,166,136 B | 3-run Chrome report |
| m4a-to-aac | audio | ffmpeg-audio | re-encode | 140,941,469 B | 3-run Chrome report |
| m4a-to-aiff | audio | ffmpeg-audio | re-encode | 140,941,469 B | 3-run Chrome report |
| m4a-to-amr | audio | ffmpeg-audio | re-encode | 140,941,469 B | 3-run Chrome report |
| m4a-to-flac | audio | ffmpeg-audio | re-encode | 140,941,469 B | 3-run Chrome report |
| m4a-to-mp3 | audio | ffmpeg-audio | re-encode | 140,941,469 B | 3-run Chrome report |
| m4a-to-ogg | audio | ffmpeg-audio | re-encode | 140,941,469 B | 3-run Chrome report |
| m4a-to-opus | audio | ffmpeg-audio | re-encode | 140,941,469 B | 3-run Chrome report |
| m4a-to-wav | audio | ffmpeg-audio | re-encode | 140,941,469 B | 3-run Chrome report |
| m4v-to-mp4 | video | ffmpeg-remux | stream-copy | 179,609,473 B | 3-run Chrome report |
| md-to-html | document | document-stream | stream | 141,110,000 B | 3-run Chrome report |
| mkv-to-3gp | video | ffmpeg-remux | stream-copy | 147,131,069 B | 3-run Chrome report |
| mkv-to-aac | video | ffmpeg-remux | stream-copy | 146,855,294 B | 3-run Chrome report |
| mkv-to-flac | video | ffmpeg-audio | re-encode | 146,855,294 B | 3-run Chrome report |
| mkv-to-flv | video | ffmpeg-remux | stream-copy | 147,131,070 B | 3-run Chrome report |
| mkv-to-h264 | video | ffmpeg-remux | stream-copy | 146,855,294 B | 3-run Chrome report |
| mkv-to-hevc | video | ffmpeg-remux | stream-copy | 148,952,609 B | 3-run Chrome report |
| mkv-to-m2v | video | ffmpeg-remux | stream-copy | 136,294,704 B | 3-run Chrome report |
| mkv-to-m4a | video | ffmpeg-remux | stream-copy | 2,958,573,265 B | 3-run Chrome report |
| mkv-to-m4v | video | ffmpeg-remux | stream-copy | 180,576,319 B | 3-run Chrome report |
| mkv-to-mov | video | ffmpeg-remux | stream-copy | 147,131,073 B | 3-run Chrome report |
| mkv-to-mp3 | video | ffmpeg-remux | stream-copy | 181,340,062 B | 3-run Chrome report |
| mkv-to-mp4 | video | ffmpeg-remux | stream-copy | 10,737,988,703 B | 3-run Chrome report |
| mkv-to-mp4-mpeg4 | video | ffmpeg-video | re-encode | 2,958,573,265 B | 3-run Chrome report |
| mkv-to-mpeg-ts | video | ffmpeg-remux | stream-copy | 147,131,071 B | 3-run Chrome report |
| mkv-to-ogg | video | ffmpeg-remux | stream-copy | 222,125,242 B | 3-run Chrome report |
| mkv-to-opus | video | ffmpeg-remux | stream-copy | 222,942,211 B | 3-run Chrome report |
| mkv-to-wav | video | ffmpeg-audio | re-encode | 2,958,573,265 B | 3-run Chrome report |
| mkv-to-webm | video | ffmpeg-video | re-encode | 2,958,573,265 B | 3-run Chrome report |
| mkv-to-webm-av1 | video | ffmpeg-remux | stream-copy | 222,942,211 B | 3-run Chrome report |
| mkv-to-webm-vp9 | video | ffmpeg-video | re-encode | 181,825,549 B | 3-run Chrome report |
| mov-to-3gp | video | ffmpeg-remux | stream-copy | 147,136,645 B | 3-run Chrome report |
| mov-to-aac | video | ffmpeg-remux | stream-copy | 146,854,612 B | 3-run Chrome report |
| mov-to-flac | video | ffmpeg-audio | re-encode | 146,854,612 B | 3-run Chrome report |
| mov-to-flv | video | ffmpeg-remux | stream-copy | 147,136,646 B | 3-run Chrome report |
| mov-to-h264 | video | ffmpeg-remux | stream-copy | 146,854,612 B | 3-run Chrome report |
| mov-to-hevc | video | ffmpeg-remux | stream-copy | 149,251,969 B | 3-run Chrome report |
| mov-to-m2v | video | ffmpeg-remux | stream-copy | 136,284,843 B | 3-run Chrome report |
| mov-to-m4a | video | ffmpeg-remux | stream-copy | 149,251,969 B | 3-run Chrome report |
| mov-to-m4v | video | ffmpeg-remux | stream-copy | 179,625,169 B | 3-run Chrome report |
| mov-to-mkv | video | ffmpeg-remux | stream-copy | 147,136,647 B | 3-run Chrome report |
| mov-to-mp3 | video | ffmpeg-remux | stream-copy | 181,344,078 B | 3-run Chrome report |
| mov-to-mp4 | video | ffmpeg-remux | stream-copy | 149,251,969 B | 3-run Chrome report |
| mov-to-mpeg-ts | video | ffmpeg-remux | stream-copy | 147,136,646 B | 3-run Chrome report |
| mov-to-wav | video | ffmpeg-audio | re-encode | 149,251,969 B | 3-run Chrome report |
| mov-to-webm | video | ffmpeg-video | re-encode | 147,136,647 B | 3-run Chrome report |
| mov-to-webm-vp9 | video | ffmpeg-video | re-encode | 147,136,647 B | 3-run Chrome report |
| mp3-to-aac | audio | ffmpeg-audio | re-encode | 50,401,224 B | 3-run Chrome report |
| mp3-to-aiff | audio | ffmpeg-audio | re-encode | 50,401,224 B | 3-run Chrome report |
| mp3-to-amr | audio | ffmpeg-audio | re-encode | 50,401,224 B | 3-run Chrome report |
| mp3-to-flac | audio | ffmpeg-audio | re-encode | 50,401,224 B | 3-run Chrome report |
| mp3-to-ogg | audio | ffmpeg-audio | re-encode | 50,401,224 B | 3-run Chrome report |
| mp3-to-opus | audio | ffmpeg-audio | re-encode | 50,401,224 B | 3-run Chrome report |
| mp3-to-wav | audio | ffmpeg-audio | re-encode | 50,401,224 B | 3-run Chrome report |
| mp4-to-3gp | video | ffmpeg-remux | stream-copy | 147,136,621 B | 3-run Chrome report |
| mp4-to-aac | video | ffmpeg-remux | stream-copy | 146,854,557 B | 3-run Chrome report |
| mp4-to-flac | video | ffmpeg-audio | re-encode | 146,854,557 B | 3-run Chrome report |
| mp4-to-flv | video | ffmpeg-remux | stream-copy | 147,136,622 B | 3-run Chrome report |
| mp4-to-h264 | video | ffmpeg-remux | stream-copy | 146,854,557 B | 3-run Chrome report |
| mp4-to-hevc | video | ffmpeg-remux | stream-copy | 149,251,863 B | 3-run Chrome report |
| mp4-to-m2v | video | ffmpeg-remux | stream-copy | 136,284,917 B | 3-run Chrome report |
| mp4-to-m4a | video | ffmpeg-remux | stream-copy | 2,964,855,971 B | 3-run Chrome report |
| mp4-to-m4v | video | ffmpeg-remux | stream-copy | 179,625,218 B | 3-run Chrome report |
| mp4-to-mkv | video | ffmpeg-remux | stream-copy | 147,136,623 B | 3-run Chrome report |
| mp4-to-mov | video | ffmpeg-remux | stream-copy | 147,136,624 B | 3-run Chrome report |
| mp4-to-mp3 | video | ffmpeg-remux | stream-copy | 181,344,111 B | 3-run Chrome report |
| mp4-to-mpeg-ts | video | ffmpeg-remux | stream-copy | 147,136,623 B | 3-run Chrome report |
| mp4-to-wav | video | ffmpeg-audio | re-encode | 2,964,855,971 B | 3-run Chrome report |
| mp4-to-webm | video | ffmpeg-video | re-encode | 161,758,724 B | 3-run Chrome report |
| mp4-to-webm-vp9 | video | ffmpeg-video | re-encode | 147,136,625 B | 3-run Chrome report |
| mpeg-ts-to-3gp | video | ffmpeg-remux | stream-copy | 150,441,548 B | 3-run Chrome report |
| mpeg-ts-to-aac | video | ffmpeg-remux | stream-copy | 150,441,548 B | 3-run Chrome report |
| mpeg-ts-to-flac | video | ffmpeg-audio | re-encode | 150,441,548 B | 3-run Chrome report |
| mpeg-ts-to-flv | video | ffmpeg-remux | stream-copy | 150,441,548 B | 3-run Chrome report |
| mpeg-ts-to-h264 | video | ffmpeg-remux | stream-copy | 150,441,548 B | 3-run Chrome report |
| mpeg-ts-to-hevc | video | ffmpeg-remux | stream-copy | 157,710,004 B | 3-run Chrome report |
| mpeg-ts-to-m2v | video | ffmpeg-remux | stream-copy | 142,273,136 B | 3-run Chrome report |
| mpeg-ts-to-m4a | video | ffmpeg-remux | stream-copy | 175,444,796 B | 3-run Chrome report |
| mpeg-ts-to-mkv | video | ffmpeg-remux | stream-copy | 150,441,548 B | 3-run Chrome report |
| mpeg-ts-to-mov | video | ffmpeg-remux | stream-copy | 150,441,548 B | 3-run Chrome report |
| mpeg-ts-to-mp3 | video | ffmpeg-remux | stream-copy | 185,645,300 B | 3-run Chrome report |
| mpeg-ts-to-mp4 | video | ffmpeg-remux | stream-copy | 175,444,796 B | 3-run Chrome report |
| mpeg-ts-to-wav | video | ffmpeg-audio | re-encode | 175,444,796 B | 3-run Chrome report |
| mpeg-ts-to-webm | video | ffmpeg-video | re-encode | 150,441,548 B | 3-run Chrome report |
| mpeg-ts-to-webm-vp9 | video | ffmpeg-video | re-encode | 150,441,548 B | 3-run Chrome report |
| ndjson-to-csv | data | records-stream | stream | 288,143,880 B | 3-run Chrome report |
| ndjson-to-json | data | records-stream | stream | 288,143,880 B | 3-run Chrome report |
| ndjson-to-tsv | data | records-stream | stream | 288,143,880 B | 3-run Chrome report |
| odp-to-txt | presentation | odf-stream | stream | 135,272,481 B | 3-run Chrome report |
| ods-to-csv | spreadsheet | odf-stream | stream | 135,267,401 B | 3-run Chrome report |
| odt-to-txt | document | odf-stream | stream | 135,267,233 B | 3-run Chrome report |
| ogg-to-aac | audio | ffmpeg-audio | re-encode | 144,431,506 B | 3-run Chrome report |
| ogg-to-aiff | audio | ffmpeg-audio | re-encode | 144,431,506 B | 3-run Chrome report |
| ogg-to-amr | audio | ffmpeg-audio | re-encode | 144,431,506 B | 3-run Chrome report |
| ogg-to-flac | audio | ffmpeg-audio | re-encode | 144,431,506 B | 3-run Chrome report |
| ogg-to-mp3 | audio | ffmpeg-audio | re-encode | 144,431,506 B | 3-run Chrome report |
| ogg-to-opus | audio | ffmpeg-audio | re-encode | 144,431,506 B | 3-run Chrome report |
| ogg-to-wav | audio | ffmpeg-audio | re-encode | 4,580,949 B | 3-run Chrome report |
| ogv-to-flac | video | ffmpeg-audio | re-encode | 137,218,662 B | 3-run Chrome report |
| ogv-to-mkv | video | ffmpeg-remux | stream-copy | 137,218,662 B | 3-run Chrome report |
| ogv-to-ogg | video | ffmpeg-remux | stream-copy | 137,218,662 B | 3-run Chrome report |
| ogv-to-wav | video | ffmpeg-audio | re-encode | 137,635,308 B | 3-run Chrome report |
| ogv-to-webm | video | ffmpeg-video | re-encode | 137,778,644 B | 3-run Chrome report |
| ogv-to-webm-vp9 | video | ffmpeg-video | re-encode | 137,635,308 B | 3-run Chrome report |
| opus-to-aac | audio | ffmpeg-audio | re-encode | 147,964,541 B | 3-run Chrome report |
| opus-to-aiff | audio | ffmpeg-audio | re-encode | 147,964,541 B | 3-run Chrome report |
| opus-to-amr | audio | ffmpeg-audio | re-encode | 147,964,541 B | 3-run Chrome report |
| opus-to-flac | audio | ffmpeg-audio | re-encode | 147,964,541 B | 3-run Chrome report |
| opus-to-mp3 | audio | ffmpeg-audio | re-encode | 147,964,541 B | 3-run Chrome report |
| opus-to-ogg | audio | ffmpeg-audio | re-encode | 147,964,541 B | 3-run Chrome report |
| opus-to-wav | audio | ffmpeg-audio | re-encode | 40,289,464 B | 3-run Chrome report |
| png-to-bmp | image | image-browser | re-encode | 780,611 B | 3-run Chrome report |
| png-to-ico | image | image-browser | re-encode | 780,611 B | 3-run Chrome report |
| png-to-jpeg | image | image-browser | re-encode | 780,611 B | 3-run Chrome report |
| png-to-webp | image | image-browser | re-encode | 780,611 B | 3-run Chrome report |
| pptx-to-txt | presentation | presentation-stream | stream | 135,296,355 B | 3-run Chrome report |
| sevenzip-to-tar | archive | libarchive7z-wasm | stream | 268,435,574 B | 3-run Chrome report |
| sevenzip-to-tar-bz2 | archive | libarchive7z-wasm | stream | 268,435,574 B | 3-run Chrome report |
| sevenzip-to-tar-gz | archive | libarchive7z-wasm | stream | 268,435,574 B | 3-run Chrome report |
| sevenzip-to-tar-xz | archive | libarchive7z-wasm | stream | 268,435,574 B | 3-run Chrome report |
| sevenzip-to-zip | archive | libarchive7z-wasm | stream | 268,435,574 B | 3-run Chrome report |
| srt-to-ass | subtitle | subtitle-stream | stream | 67,327,792 B | 3-run Chrome report |
| srt-to-ttml | subtitle | subtitle-stream | stream | 67,327,792 B | 3-run Chrome report |
| srt-to-vtt | subtitle | subtitle-stream | stream | 67,327,792 B | 3-run Chrome report |
| svg-to-png | image | svg-browser | re-encode | 327,564 B | 3-run Chrome report |
| tar-bz2-to-sevenzip | archive | libarchive7z-wasm | stream | 270,592,763 B | 3-run Chrome report |
| tar-bz2-to-tar | archive | bzip2-wasm | stream | 270,592,763 B | 3-run Chrome report |
| tar-bz2-to-tar-gz | archive | archive-codec-pipeline | stream | 270,592,763 B | 3-run Chrome report |
| tar-bz2-to-tar-xz | archive | archive-codec-pipeline | stream | 270,592,763 B | 3-run Chrome report |
| tar-bz2-to-zip | archive | bzip2-wasm | stream | 270,592,763 B | 3-run Chrome report |
| tar-gz-to-sevenzip | archive | libarchive7z-wasm | stream | 268,517,551 B | 3-run Chrome report |
| tar-gz-to-tar | archive | compression-stream | stream | 268,517,551 B | 3-run Chrome report |
| tar-gz-to-tar-bz2 | archive | archive-codec-pipeline | stream | 268,517,551 B | 3-run Chrome report |
| tar-gz-to-tar-xz | archive | archive-codec-pipeline | stream | 268,517,551 B | 3-run Chrome report |
| tar-gz-to-zip | archive | archive-browser | stream | 268,517,551 B | 3-run Chrome report |
| tar-to-sevenzip | archive | libarchive7z-wasm | stream | 268,436,992 B | 3-run Chrome report |
| tar-to-tar-bz2 | archive | bzip2-wasm | stream | 268,436,992 B | 3-run Chrome report |
| tar-to-tar-gz | archive | compression-stream | stream | 268,436,992 B | 3-run Chrome report |
| tar-to-tar-xz | archive | xz-wasm | stream | 268,436,992 B | 3-run Chrome report |
| tar-to-zip | archive | archive-browser | stream | 268,436,992 B | 3-run Chrome report |
| tar-xz-to-sevenzip | archive | libarchive7z-wasm | stream | 268,449,796 B | 3-run Chrome report |
| tar-xz-to-tar | archive | xz-wasm | stream | 268,449,796 B | 3-run Chrome report |
| tar-xz-to-tar-bz2 | archive | archive-codec-pipeline | stream | 268,449,796 B | 3-run Chrome report |
| tar-xz-to-tar-gz | archive | archive-codec-pipeline | stream | 268,449,796 B | 3-run Chrome report |
| tar-xz-to-zip | archive | xz-wasm | stream | 268,449,796 B | 3-run Chrome report |
| tiff-to-png | image | libtiff-wasm | re-encode | 50,348,250 B | 3-run Chrome report |
| tsv-to-csv | data | records-stream | stream | 134,423,894 B | 3-run Chrome report |
| tsv-to-json | data | records-stream | stream | 134,423,894 B | 3-run Chrome report |
| tsv-to-ndjson | data | records-stream | stream | 134,423,894 B | 3-run Chrome report |
| ttml-to-srt | subtitle | subtitle-stream | stream | 82,349,061 B | 3-run Chrome report |
| ttml-to-vtt | subtitle | subtitle-stream | stream | 82,349,061 B | 3-run Chrome report |
| txt-to-html | document | document-stream | stream | 67,130,000 B | 3-run Chrome report |
| vtt-to-ass | subtitle | subtitle-stream | stream | 73,788,904 B | 3-run Chrome report |
| vtt-to-srt | subtitle | subtitle-stream | stream | 73,788,904 B | 3-run Chrome report |
| vtt-to-ttml | subtitle | subtitle-stream | stream | 73,788,904 B | 3-run Chrome report |
| wav-to-aac | audio | ffmpeg-audio | re-encode | 153,600,106 B | 3-run Chrome report |
| wav-to-aiff | audio | ffmpeg-audio | re-encode | 153,600,106 B | 3-run Chrome report |
| wav-to-alac | audio | ffmpeg-audio | re-encode | 153,600,106 B | 3-run Chrome report |
| wav-to-amr | audio | ffmpeg-audio | re-encode | 153,600,106 B | 3-run Chrome report |
| wav-to-flac | audio | ffmpeg-audio | re-encode | 201,600,106 B | 3-run Chrome report |
| wav-to-mp3 | audio | ffmpeg-audio | re-encode | 153,600,106 B | 3-run Chrome report |
| wav-to-ogg | audio | ffmpeg-audio | re-encode | 153,600,106 B | 3-run Chrome report |
| wav-to-opus | audio | ffmpeg-audio | re-encode | 153,600,106 B | 3-run Chrome report |
| wav-to-wma | audio | ffmpeg-audio | re-encode | 153,600,104 B | 3-run Chrome report |
| webm-to-mkv | video | ffmpeg-remux | stream-copy | 222,941,314 B | 3-run Chrome report |
| webm-to-ogg | video | ffmpeg-remux | stream-copy | 222,124,822 B | 3-run Chrome report |
| webm-to-opus | video | ffmpeg-remux | stream-copy | 222,941,314 B | 3-run Chrome report |
| webp-to-bmp | image | image-browser | re-encode | 263,320 B | 3-run Chrome report |
| webp-to-ico | image | image-browser | re-encode | 263,320 B | 3-run Chrome report |
| webp-to-jpeg | image | image-browser | re-encode | 263,320 B | 3-run Chrome report |
| webp-to-png | image | image-browser | re-encode | 263,320 B | 3-run Chrome report |
| wma-to-aac | audio | ffmpeg-audio | re-encode | 142,503,082 B | 3-run Chrome report |
| wma-to-aiff | audio | ffmpeg-audio | re-encode | 142,503,082 B | 3-run Chrome report |
| wma-to-amr | audio | ffmpeg-audio | re-encode | 142,503,082 B | 3-run Chrome report |
| wma-to-flac | audio | ffmpeg-audio | re-encode | 142,503,082 B | 3-run Chrome report |
| wma-to-mp3 | audio | ffmpeg-audio | re-encode | 142,503,082 B | 3-run Chrome report |
| wma-to-ogg | audio | ffmpeg-audio | re-encode | 142,503,082 B | 3-run Chrome report |
| wma-to-opus | audio | ffmpeg-audio | re-encode | 142,503,082 B | 3-run Chrome report |
| wma-to-wav | audio | ffmpeg-audio | re-encode | 142,503,082 B | 3-run Chrome report |
| xlsx-to-csv | spreadsheet | spreadsheet-stream | stream | 135,267,834 B | 3-run Chrome report |
| xml-to-ndjson | data | xml-stream | stream | 134,218,700 B | 3-run Chrome report |
| xz-compress | compression | xz-wasm | stream | 268,435,456 B | 3-run Chrome report |
| xz-decompress | compression | xz-wasm | stream | 268,448,840 B | 3-run Chrome report |
| xz-to-bzip2 | compression | compression-codec-pipeline | stream | 268,448,840 B | 3-run Chrome report |
| xz-to-gzip | compression | compression-codec-pipeline | stream | 268,448,840 B | 3-run Chrome report |
| zip-to-sevenzip | archive | libarchive7z-wasm | stream | 268,517,517 B | 3-run Chrome report |
| zip-to-tar | archive | archive-browser | stream | 268,517,517 B | 3-run Chrome report |
| zip-to-tar-bz2 | archive | bzip2-wasm | stream | 268,517,517 B | 3-run Chrome report |
| zip-to-tar-gz | archive | archive-browser | stream | 268,517,517 B | 3-run Chrome report |
| zip-to-tar-xz | archive | xz-wasm | stream | 268,517,517 B | 3-run Chrome report |

## Explicit remaining gaps — not tested or advertised

This project is not complete yet. The specification still names major surfaces that are not in the public registry, including:

- Video/container: additional elementary-stream codecs and raw outputs beyond H.264, MPEG-2, MPEG-4 Part 2, and the certified container-to-HEVC outputs; raw HEVC input wrapping remains unavailable because B-frame timing cannot be reconstructed losslessly without container timestamps. Broader OGV, 3GP, AVI, VP9, AV1, and MPEG-2 audio/codec combinations beyond the certified Matroska, WebM, extraction, and transcode routes also remain.
- Audio: AMR-WB and 3GP-contained AMR; broader AAC/ALAC/WMA variants plus user-selectable bitrate, sample-rate, channel-layout, and artwork/tag handling.
- Images: HEIF/HEIC, JPEG XL, animated WebP/AVIF, camera raw formats, multipage TIFF, separated-planar TIFF, transposed TIFF orientations, and broader SVG features such as text, CSS, animation, filters, masks, and linked resources remain absent.
- Archives/compression: additional entry-level conversion among 7Z, XZ/TAR.XZ, BZIP2/TAR.BZ2, ZIP, and TAR.GZ where safe bounded routes are added.
- Product validation: broader headed-browser/manual interaction evidence, more direct-destination profiles, and continued multi-gigabyte scaling coverage for newly added media routes.

## Cleanup invariant

Stress generators write only under `fixtures/stress`, browser copies stay under project-owned test/profile locations, and category runners invoke cleanup in `finally`. The protected root `test.mkv` is never deleted or modified.

Regenerate this ledger with `npm run tested:ledger` after new evidence is produced.
