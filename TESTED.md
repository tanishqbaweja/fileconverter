# Tested conversion ledger

Updated 2026-08-02 from the capability registry and retained successful Chrome stress reports.

This is the living progress record. It is regenerated after each test/profile cycle so completed work is not repeated or inferred from memory.

## What the labels mean

- **Public passed**: implemented, small production-browser correctness tested, independently validated, cleanup tested, and accepted by the registry.
- **Chrome stress report**: a retained full Chromium process-tree measurement using a real project-local source. Three-run evidence is preferred when multiple reports exist.
- **Not claimed**: formats and features still absent remain listed at the end of this file; passing one route never implies every codec/container combination.

## Current totals

- Public passed conversion profiles: **164**
- Public profiles with a retained successful Chrome stress report: **164**
- PDF profiles: **0** (intentionally prohibited)

## Latest full verification cycle

- **2026-08-02:** 371/371 production-browser tests passed; 13/13 unit tests passed; TypeScript, ESLint, and the production build passed.
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
| 3gp-to-m4a | 167,130,850 | 3 | 11,539,835 | 1.12 s–1.50 s | 204.8 MiB | 32.0 MiB | read 262,144 B / write 80,761 B | passed |
| 3gp-to-mp4 | 167,130,850 | 3 | 167,156,758 | 1.66 s–1.93 s | 209.6 MiB | 32.0 MiB | read 262,144 B / write 262,144 B | passed |
| 3gp-to-wav | 167,130,850 | 3 | 69,130,350 | 3.66 s–3.91 s | 193.7 MiB | 32.0 MiB | read 262,144 B / write 2,048 B | passed |
| 3gp-to-webm | 146,854,522 | 3 | 4,948,064 | 9.28 s–9.69 s | 236.4 MiB | 40.0 MiB | read 262,144 B / write 262,144 B | passed |
| 3gp-to-webm-vp9 | 146,854,522 | 3 | 3,372,711 | 13.55 s–14.19 s | 234.0 MiB | 56.0 MiB | read 262,144 B / write 262,144 B | passed |
| aac-to-flac | 134,367,785 | 3 | 114,800,971 | 22.02 s–22.50 s | 167.1 MiB | 32.0 MiB | read 262,144 B / write 8,288 B | passed |
| aac-to-m4a | 134,367,785 | 3 | 133,906,114 | 1.81 s–2.23 s | 179.8 MiB | 32.0 MiB | read 262,144 B / write 167,549 B | passed |
| aac-to-wav | 134,367,785 | 3 | 770,273,358 | 19.20 s–19.62 s | 186.5 MiB | 32.0 MiB | read 262,144 B / write 4,096 B | passed |
| aiff-to-flac | 220,800,108 | 3 | 32,365,732 | 6.06 s–7.02 s | 207.2 MiB | 32.0 MiB | read 262,144 B / write 8,344 B | passed |
| aiff-to-wav | 201,600,102 | 3 | 201,600,128 | 3.38 s–4.24 s | 194.4 MiB | 32.0 MiB | read 262,144 B / write 4,096 B | passed |
| amr-to-flac | 134,229,414 | 3 | 760,765,211 | 124.23 s–126.93 s | 166.0 MiB | 32.0 MiB | read 262,144 B / write 8,288 B | passed |
| amr-to-wav | 134,229,414 | 3 | 1,342,294,158 | 61.54 s–62.01 s | 209.7 MiB | 32.0 MiB | read 262,144 B / write 16,384 B | passed |
| ass-to-srt | 101,393,068 | 3 | 83,377,792 | 2.74 s–2.76 s | 175.1 MiB | 0.0 MiB | read 262,144 B / write 262,144 B | passed |
| ass-to-vtt | 101,393,068 | 3 | 75,928,906 | 2.59 s–2.67 s | 156.8 MiB | 0.0 MiB | read 262,144 B / write 262,144 B | passed |
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
| flac-to-alac | 138,185,686 | 3 | 140,941,506 | 7.52 s–7.73 s | 199.1 MiB | 32.0 MiB | read 262,144 B / write 262,144 B | passed |
| flac-to-wav | 52,298,514 | 3 | 57,600,128 | 1.23 s–1.51 s | 161.0 MiB | 32.0 MiB | read 262,144 B / write 9,216 B | passed |
| flac-to-wma | 138,186,536 | 3 | 60,000,756 | 13.07 s–13.37 s | 159.9 MiB | 32.0 MiB | read 262,144 B / write 3,200 B | passed |
| flv-to-m4a | 167,517,193 | 3 | 11,456,012 | 1.16 s–1.42 s | 213.2 MiB | 32.0 MiB | read 262,144 B / write 80,260 B | passed |
| flv-to-mp4 | 167,517,193 | 3 | 167,091,007 | 1.64 s–1.85 s | 193.1 MiB | 32.0 MiB | read 262,144 B / write 262,144 B | passed |
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
| html-to-txt | 143,850,123 | 3 | 101,380,000 | 15.71 s–15.93 s | 231.6 MiB | 0.0 MiB | read 262,144 B / write 262,144 B | passed |
| jpeg-to-bmp | 418,486 | 3 | 24,883,254 | 0.28 s–0.36 s | 169.9 MiB | 0.0 MiB | read 196,608 B / write 195,840 B | passed |
| jpeg-to-ico | 418,486 | 3 | 12,998 | 0.09 s–0.14 s | 80.5 MiB | 0.0 MiB | read 196,608 B / write 12,976 B | passed |
| jpeg-to-png | 418,486 | 3 | 1,792,327 | 0.11 s–0.16 s | 67.7 MiB | 0.0 MiB | read 221,878 B / write 262,144 B | passed |
| jpeg-to-webp | 418,486 | 3 | 244,588 | 0.40 s–0.46 s | 179.6 MiB | 0.0 MiB | read 221,878 B / write 179,052 B | passed |
| json-to-csv | 293,633,883 | 3 | 139,913,895 | 24.37 s–25.13 s | 185.8 MiB | 0.0 MiB | read 262,144 B / write 262,144 B | passed |
| json-to-ndjson | 293,633,883 | 3 | 288,143,880 | 12.09 s–12.39 s | 229.3 MiB | 0.0 MiB | read 262,144 B / write 262,144 B | passed |
| json-to-tsv | 293,633,883 | 3 | 139,913,895 | 24.43 s–24.94 s | 212.1 MiB | 0.0 MiB | read 262,144 B / write 262,144 B | passed |
| m2v-to-mp4-mpeg4 | 136,166,136 | 3 | 124,300,753 | 25.52 s–25.61 s | 177.1 MiB | 32.0 MiB | read 262,144 B / write 189,607 B | passed |
| m2v-to-webm | 136,166,136 | 3 | 37,835,173 | 30.57 s–32.39 s | 163.9 MiB | 32.0 MiB | read 262,144 B / write 42,619 B | passed |
| m2v-to-webm-vp9 | 136,166,136 | 3 | 44,351,703 | 68.34 s–69.32 s | 223.4 MiB | 56.0 MiB | read 262,144 B / write 45,682 B | passed |
| m4a-to-flac | 140,941,469 | 3 | 138,185,793 | 7.43 s–7.84 s | 230.4 MiB | 32.0 MiB | read 262,144 B / write 16,614 B | passed |
| m4a-to-wav | 140,941,469 | 3 | 153,600,128 | 5.11 s–5.39 s | 227.1 MiB | 32.0 MiB | read 262,144 B / write 16,384 B | passed |
| md-to-html | 141,110,000 | 3 | 206,870,176 | 13.97 s–14.30 s | 211.5 MiB | 0.0 MiB | read 262,144 B / write 262,144 B | passed |
| mkv-to-m4a | 2,958,573,265 | 3 | 249,427,974 | 2.49 s–4.04 s | 164.7 MiB | 32.0 MiB | read 262,144 B / write 103,136 B | passed |
| mkv-to-mp4 | 2,958,573,265 | 3 | 2,962,151,522 | 17.42 s–23.30 s | 247.5 MiB | 53.6 MiB | read 262,144 B / write 1,048,576 B | passed |
| mkv-to-mp4-mpeg4 | 2,958,573,265 | 3 | 3,086,358,463 | 3091.16 s–3096.06 s | 211.3 MiB | 89.6 MiB | read 262,144 B / write 262,144 B | passed |
| mkv-to-wav | 2,958,573,265 | 3 | 7,107,834,734 | 156.72 s–161.53 s | 178.0 MiB | 32.0 MiB | read 262,144 B / write 24,576 B | passed |
| mkv-to-webm | 2,958,573,265 | 3 | 921,524,214 | 2682.01 s–2687.09 s | 208.8 MiB | 80.0 MiB | read 262,144 B / write 262,144 B | passed |
| mkv-to-webm-vp9 | 181,825,549 | 3 | 65,122,757 | 329.00 s–330.04 s | 244.9 MiB | 88.0 MiB | read 262,144 B / write 262,144 B | passed |
| mov-to-m4a | 149,251,969 | 3 | 14,557,639 | 0.42 s–0.69 s | 164.5 MiB | 32.0 MiB | read 262,144 B / write 103,136 B | passed |
| mov-to-mp4 | 149,251,969 | 3 | 149,087,892 | 0.87 s–1.13 s | 168.2 MiB | 40.0 MiB | read 262,144 B / write 262,144 B | passed |
| mov-to-wav | 149,251,969 | 3 | 414,733,404 | 9.31 s–9.77 s | 195.3 MiB | 32.0 MiB | read 262,144 B / write 24,576 B | passed |
| mov-to-webm | 147,136,647 | 3 | 5,100,809 | 9.53 s–10.14 s | 244.4 MiB | 48.0 MiB | read 262,144 B / write 262,144 B | passed |
| mov-to-webm-vp9 | 147,136,647 | 3 | 4,126,570 | 14.67 s–15.17 s | 236.8 MiB | 64.0 MiB | read 262,144 B / write 262,144 B | passed |
| mp3-to-flac | 50,401,224 | 3 | 33,022,489 | 7.26 s–8.16 s | 214.2 MiB | 32.0 MiB | read 262,144 B / write 8,338 B | passed |
| mp3-to-wav | 50,401,224 | 3 | 201,600,128 | 3.36 s–3.60 s | 191.9 MiB | 32.0 MiB | read 262,144 B / write 260,574 B | passed |
| mp4-to-m4a | 2,964,855,971 | 3 | 249,427,976 | 2.58 s–2.89 s | 203.3 MiB | 73.8 MiB | read 262,144 B / write 103,136 B | passed |
| mp4-to-wav | 2,964,855,971 | 3 | 7,107,834,950 | 93.11 s–93.94 s | 224.1 MiB | 73.8 MiB | read 262,144 B / write 24,576 B | passed |
| mp4-to-webm | 147,136,619 | 3 | 5,105,363 | 12.84 s–13.34 s | 226.9 MiB | 64.0 MiB | read 262,144 B / write 262,144 B | passed |
| mp4-to-webm-vp9 | 147,136,625 | 3 | 4,143,084 | 14.80 s–15.36 s | 237.1 MiB | 64.0 MiB | read 262,144 B / write 262,144 B | passed |
| mpeg-ts-to-m4a | 175,444,796 | 3 | 11,455,964 | 1.51 s–1.69 s | 220.2 MiB | 56.0 MiB | read 262,144 B / write 80,260 B | passed |
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
| ogg-to-flac | 144,431,506 | 3 | 397,265,921 | 15.35 s–15.46 s | 198.4 MiB | 32.0 MiB | read 262,144 B / write 16,617 B | passed |
| ogg-to-wav | 4,580,949 | 3 | 201,600,078 | 5.91 s–7.02 s | 196.7 MiB | 32.0 MiB | read 262,144 B / write 2,048 B | passed |
| ogv-to-wav | 137,635,308 | 3 | 74,880,078 | 3.34 s–3.91 s | 204.9 MiB | 32.0 MiB | read 262,144 B / write 2,048 B | passed |
| ogv-to-webm | 137,778,644 | 3 | 61,043,196 | 44.03 s–45.01 s | 199.4 MiB | 32.0 MiB | read 262,144 B / write 71,004 B | passed |
| ogv-to-webm-vp9 | 137,635,308 | 3 | 67,478,525 | 97.19 s–97.53 s | 224.1 MiB | 64.0 MiB | read 262,144 B / write 79,087 B | passed |
| opus-to-flac | 147,964,541 | 3 | 386,531,887 | 25.55 s–26.09 s | 194.4 MiB | 32.0 MiB | read 262,144 B / write 16,213 B | passed |
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
| vtt-to-srt | 73,788,904 | 3 | 71,607,792 | 2.79 s–2.84 s | 200.6 MiB | 0.0 MiB | read 262,144 B / write 262,144 B | passed |
| vtt-to-ttml | 73,788,904 | 3 | 82,349,061 | 3.48 s–3.58 s | 204.5 MiB | 0.0 MiB | read 262,144 B / write 262,144 B | passed |
| wav-to-alac | 153,600,106 | 3 | 140,941,506 | 6.14 s–6.58 s | 200.2 MiB | 32.0 MiB | read 262,144 B / write 262,144 B | passed |
| wav-to-flac | 201,600,106 | 3 | 29,551,762 | 4.52 s–5.02 s | 181.7 MiB | 32.0 MiB | read 262,144 B / write 8,338 B | passed |
| wav-to-wma | 153,600,104 | 3 | 60,000,756 | 11.72 s–11.98 s | 150.2 MiB | 32.0 MiB | read 262,144 B / write 3,200 B | passed |
| webp-to-bmp | 263,320 | 3 | 24,883,254 | 0.29 s–0.37 s | 196.5 MiB | 0.0 MiB | read 196,608 B / write 195,840 B | passed |
| webp-to-ico | 263,320 | 3 | 13,013 | 0.10 s–0.16 s | 77.6 MiB | 0.0 MiB | read 197,784 B / write 12,991 B | passed |
| webp-to-jpeg | 263,320 | 3 | 364,322 | 0.13 s–0.18 s | 69.9 MiB | 0.0 MiB | read 131,072 B / write 262,144 B | passed |
| webp-to-png | 263,320 | 3 | 1,528,103 | 0.12 s–0.17 s | 69.8 MiB | 0.0 MiB | read 197,784 B / write 262,144 B | passed |
| wma-to-flac | 142,503,082 | 3 | 326,238,814 | 12.91 s–13.56 s | 191.2 MiB | 32.0 MiB | read 262,144 B / write 16,523 B | passed |
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

## Every public passed profile

| Profile | Input category | Engine | Method | Largest tested source | Evidence snapshot |
| --- | --- | --- | --- | ---: | --- |
| 3gp-to-m4a | video | ffmpeg-remux | stream-copy | 167,130,850 B | 3-run Chrome report |
| 3gp-to-mp4 | video | ffmpeg-remux | stream-copy | 167,130,850 B | 3-run Chrome report |
| 3gp-to-wav | video | ffmpeg-audio | re-encode | 167,130,850 B | 3-run Chrome report |
| 3gp-to-webm | video | ffmpeg-video | re-encode | 146,854,522 B | 3-run Chrome report |
| 3gp-to-webm-vp9 | video | ffmpeg-video | re-encode | 146,854,522 B | 3-run Chrome report |
| aac-to-flac | audio | ffmpeg-audio | re-encode | 134,367,785 B | 3-run Chrome report |
| aac-to-m4a | audio | ffmpeg-remux | stream-copy | 134,367,785 B | 3-run Chrome report |
| aac-to-wav | audio | ffmpeg-audio | re-encode | 134,367,785 B | 3-run Chrome report |
| aiff-to-flac | audio | ffmpeg-audio | re-encode | 220,800,108 B | 3-run Chrome report |
| aiff-to-wav | audio | ffmpeg-audio | re-encode | 201,600,102 B | 3-run Chrome report |
| amr-to-flac | audio | ffmpeg-audio | re-encode | 134,229,414 B | 3-run Chrome report |
| amr-to-wav | audio | ffmpeg-audio | re-encode | 134,229,414 B | 3-run Chrome report |
| ass-to-srt | subtitle | subtitle-stream | stream | 101,393,068 B | 3-run Chrome report |
| ass-to-vtt | subtitle | subtitle-stream | stream | 101,393,068 B | 3-run Chrome report |
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
| flac-to-alac | audio | ffmpeg-audio | re-encode | 138,185,686 B | 3-run Chrome report |
| flac-to-wav | audio | ffmpeg-audio | re-encode | 52,298,514 B | 3-run Chrome report |
| flac-to-wma | audio | ffmpeg-audio | re-encode | 138,186,536 B | 3-run Chrome report |
| flv-to-m4a | video | ffmpeg-remux | stream-copy | 167,517,193 B | 3-run Chrome report |
| flv-to-mp4 | video | ffmpeg-remux | stream-copy | 167,517,193 B | 3-run Chrome report |
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
| html-to-txt | document | document-stream | stream | 143,850,123 B | 3-run Chrome report |
| jpeg-to-bmp | image | image-browser | re-encode | 418,486 B | 3-run Chrome report |
| jpeg-to-ico | image | image-browser | re-encode | 418,486 B | 3-run Chrome report |
| jpeg-to-png | image | image-browser | re-encode | 418,486 B | 3-run Chrome report |
| jpeg-to-webp | image | image-browser | re-encode | 418,486 B | 3-run Chrome report |
| json-to-csv | data | records-stream | stream | 293,633,883 B | 3-run Chrome report |
| json-to-ndjson | data | records-stream | stream | 293,633,883 B | 3-run Chrome report |
| json-to-tsv | data | records-stream | stream | 293,633,883 B | 3-run Chrome report |
| m2v-to-mp4-mpeg4 | video | ffmpeg-video | re-encode | 136,166,136 B | 3-run Chrome report |
| m2v-to-webm | video | ffmpeg-video | re-encode | 136,166,136 B | 3-run Chrome report |
| m2v-to-webm-vp9 | video | ffmpeg-video | re-encode | 136,166,136 B | 3-run Chrome report |
| m4a-to-flac | audio | ffmpeg-audio | re-encode | 140,941,469 B | 3-run Chrome report |
| m4a-to-wav | audio | ffmpeg-audio | re-encode | 140,941,469 B | 3-run Chrome report |
| md-to-html | document | document-stream | stream | 141,110,000 B | 3-run Chrome report |
| mkv-to-m4a | video | ffmpeg-remux | stream-copy | 2,958,573,265 B | 3-run Chrome report |
| mkv-to-mp4 | video | ffmpeg-remux | stream-copy | 10,737,988,703 B | 3-run Chrome report |
| mkv-to-mp4-mpeg4 | video | ffmpeg-video | re-encode | 2,958,573,265 B | 3-run Chrome report |
| mkv-to-wav | video | ffmpeg-audio | re-encode | 2,958,573,265 B | 3-run Chrome report |
| mkv-to-webm | video | ffmpeg-video | re-encode | 2,958,573,265 B | 3-run Chrome report |
| mkv-to-webm-vp9 | video | ffmpeg-video | re-encode | 181,825,549 B | 3-run Chrome report |
| mov-to-m4a | video | ffmpeg-remux | stream-copy | 149,251,969 B | 3-run Chrome report |
| mov-to-mp4 | video | ffmpeg-remux | stream-copy | 149,251,969 B | 3-run Chrome report |
| mov-to-wav | video | ffmpeg-audio | re-encode | 149,251,969 B | 3-run Chrome report |
| mov-to-webm | video | ffmpeg-video | re-encode | 147,136,647 B | 3-run Chrome report |
| mov-to-webm-vp9 | video | ffmpeg-video | re-encode | 147,136,647 B | 3-run Chrome report |
| mp3-to-flac | audio | ffmpeg-audio | re-encode | 50,401,224 B | 3-run Chrome report |
| mp3-to-wav | audio | ffmpeg-audio | re-encode | 50,401,224 B | 3-run Chrome report |
| mp4-to-m4a | video | ffmpeg-remux | stream-copy | 2,964,855,971 B | 3-run Chrome report |
| mp4-to-wav | video | ffmpeg-audio | re-encode | 2,964,855,971 B | 3-run Chrome report |
| mp4-to-webm | video | ffmpeg-video | re-encode | 161,758,724 B | 3-run Chrome report |
| mp4-to-webm-vp9 | video | ffmpeg-video | re-encode | 147,136,625 B | 3-run Chrome report |
| mpeg-ts-to-m4a | video | ffmpeg-remux | stream-copy | 175,444,796 B | 3-run Chrome report |
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
| ogg-to-flac | audio | ffmpeg-audio | re-encode | 144,431,506 B | 3-run Chrome report |
| ogg-to-wav | audio | ffmpeg-audio | re-encode | 4,580,949 B | 3-run Chrome report |
| ogv-to-wav | video | ffmpeg-audio | re-encode | 137,635,308 B | 3-run Chrome report |
| ogv-to-webm | video | ffmpeg-video | re-encode | 137,778,644 B | 3-run Chrome report |
| ogv-to-webm-vp9 | video | ffmpeg-video | re-encode | 137,635,308 B | 3-run Chrome report |
| opus-to-flac | audio | ffmpeg-audio | re-encode | 147,964,541 B | 3-run Chrome report |
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
| vtt-to-srt | subtitle | subtitle-stream | stream | 73,788,904 B | 3-run Chrome report |
| vtt-to-ttml | subtitle | subtitle-stream | stream | 73,788,904 B | 3-run Chrome report |
| wav-to-alac | audio | ffmpeg-audio | re-encode | 153,600,106 B | 3-run Chrome report |
| wav-to-flac | audio | ffmpeg-audio | re-encode | 201,600,106 B | 3-run Chrome report |
| wav-to-wma | audio | ffmpeg-audio | re-encode | 153,600,104 B | 3-run Chrome report |
| webp-to-bmp | image | image-browser | re-encode | 263,320 B | 3-run Chrome report |
| webp-to-ico | image | image-browser | re-encode | 263,320 B | 3-run Chrome report |
| webp-to-jpeg | image | image-browser | re-encode | 263,320 B | 3-run Chrome report |
| webp-to-png | image | image-browser | re-encode | 263,320 B | 3-run Chrome report |
| wma-to-flac | audio | ffmpeg-audio | re-encode | 142,503,082 B | 3-run Chrome report |
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

- Video/container: additional elementary-stream inputs/outputs; broader OGV, 3GP, AVI, and VP9 container/codec combinations plus AV1, MPEG-2 container/audio combinations, and additional codec conversions.
- Audio: AMR-WB and 3GP-contained AMR; broader AAC/ALAC/WMA variants plus user-selectable bitrate, sample-rate, channel-layout, and artwork/tag handling.
- Images: HEIF/HEIC, JPEG XL, animated WebP/AVIF, camera raw formats, multipage TIFF, separated-planar TIFF, transposed TIFF orientations, and broader SVG features such as text, CSS, animation, filters, masks, and linked resources remain absent.
- Archives/compression: additional entry-level conversion among 7Z, XZ/TAR.XZ, BZIP2/TAR.BZ2, ZIP, and TAR.GZ where safe bounded routes are added.
- Product validation: broader headed-browser/manual interaction evidence, more direct-destination profiles, and continued multi-gigabyte scaling coverage for newly added media routes.

## Cleanup invariant

Stress generators write only under `fixtures/stress`, browser copies stay under project-owned test/profile locations, and category runners invoke cleanup in `finally`. The protected root `test.mkv` is never deleted or modified.

Regenerate this ledger with `npm run tested:ledger` after new evidence is produced.

