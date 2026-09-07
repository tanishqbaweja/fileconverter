import { expect, test } from "@playwright/test";

test.use({ channel: "chrome" });

test("benchmarks bounded WebCodecs video and audio primitives", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/?test=1");

  const audit = await page.evaluate(async () => {
    type Run = {
      elapsedMs: number;
      chunks: number;
      bytes: number;
      maxChunkBytes: number;
      peakEncodeQueue: number;
      hash: string;
    };

    const updateHash = (state: number, bytes: Uint8Array) => {
      let hash = state;
      for (const byte of bytes) {
        hash ^= byte;
        hash = Math.imul(hash, 0x01000193) >>> 0;
      }
      return hash;
    };
    const nextDequeue = (codec: EventTarget) =>
      new Promise<void>((resolve) =>
        codec.addEventListener("dequeue", () => resolve(), { once: true }),
      );

    const videoConfig: VideoEncoderConfig = {
      codec: "vp8",
      width: 640,
      height: 360,
      bitrate: 1_000_000,
      framerate: 30,
      latencyMode: "quality",
    };
    const videoHardwareConfig: VideoEncoderConfig = {
      ...videoConfig,
      hardwareAcceleration: "prefer-hardware",
    };
    const videoSoftwareConfig: VideoEncoderConfig = {
      ...videoConfig,
      hardwareAcceleration: "prefer-software",
    };
    const vp9HardwareConfig: VideoEncoderConfig = {
      ...videoConfig,
      codec: "vp09.00.10.08",
      hardwareAcceleration: "prefer-hardware",
    };
    const audioConfig: AudioEncoderConfig = {
      codec: "opus",
      sampleRate: 48_000,
      numberOfChannels: 2,
      bitrate: 128_000,
    };
    const [videoSupport, videoHardwareSupport, videoSoftwareSupport] =
      await Promise.all([
        VideoEncoder.isConfigSupported(videoConfig),
        VideoEncoder.isConfigSupported(videoHardwareConfig),
        VideoEncoder.isConfigSupported(videoSoftwareConfig),
      ]);
    const audioSupport = await AudioEncoder.isConfigSupported(audioConfig);
    const videoCapabilityEntries = await Promise.all(
      [
        ["vp8", "vp8"],
        ["vp9", "vp09.00.10.08"],
        ["h264", "avc1.42001e"],
        ["av1", "av01.0.01M.08"],
      ].map(async ([name, codec]) => {
        const base: VideoEncoderConfig = {
          codec,
          width: 640,
          height: 360,
          bitrate: 1_000_000,
          framerate: 30,
        };
        const [automatic, hardware, software] = await Promise.all([
          VideoEncoder.isConfigSupported(base),
          VideoEncoder.isConfigSupported({
            ...base,
            hardwareAcceleration: "prefer-hardware",
          }),
          VideoEncoder.isConfigSupported({
            ...base,
            hardwareAcceleration: "prefer-software",
          }),
        ]);
        return [
          name,
          {
            automatic: automatic.supported,
            preferHardware: hardware.supported,
            preferSoftware: software.supported,
          },
        ] as const;
      }),
    );
    const audioCapabilityEntries = await Promise.all(
      [
        ["opus", "opus"],
        ["aac-lc", "mp4a.40.2"],
        ["flac", "flac"],
        ["mp3", "mp3"],
      ].map(async ([name, codec]) => {
        const support = await AudioEncoder.isConfigSupported({
          codec,
          sampleRate: 48_000,
          numberOfChannels: 2,
          bitrate: 128_000,
        }).catch(() => ({ supported: false }));
        return [name, support.supported] as const;
      }),
    );

    const runVideo = async (config: VideoEncoderConfig): Promise<Run> => {
      let chunks = 0;
      let bytes = 0;
      let maxChunkBytes = 0;
      let peakEncodeQueue = 0;
      let hash = 0x811c9dc5;
      let failure: Error | undefined;
      const encoder = new VideoEncoder({
        output(chunk) {
          const view = new Uint8Array(chunk.byteLength);
          chunk.copyTo(view);
          chunks += 1;
          bytes += view.byteLength;
          maxChunkBytes = Math.max(maxChunkBytes, view.byteLength);
          hash = updateHash(hash, view);
        },
        error(error) {
          failure = error;
        },
      });
      encoder.configure(config);
      const canvas = new OffscreenCanvas(640, 360);
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("OffscreenCanvas 2D context unavailable");

      const started = performance.now();
      for (let index = 0; index < 300; index += 1) {
        while (encoder.encodeQueueSize > 2) await nextDequeue(encoder);
        context.fillStyle = `rgb(${index % 251}, ${(index * 3) % 251}, ${(index * 7) % 251})`;
        context.fillRect(0, 0, 640, 360);
        context.fillStyle = "white";
        context.fillRect((index * 13) % 600, (index * 5) % 320, 40, 40);
        const frame = new VideoFrame(canvas, {
          timestamp: index * 33_333,
          duration: 33_333,
        });
        encoder.encode(frame, { keyFrame: index % 150 === 0 });
        peakEncodeQueue = Math.max(peakEncodeQueue, encoder.encodeQueueSize);
        frame.close();
      }
      await encoder.flush();
      const elapsedMs = performance.now() - started;
      encoder.close();
      if (failure) throw failure;
      return {
        elapsedMs,
        chunks,
        bytes,
        maxChunkBytes,
        peakEncodeQueue,
        hash: hash.toString(16).padStart(8, "0"),
      };
    };

    const runAudio = async (): Promise<Run> => {
      let chunks = 0;
      let bytes = 0;
      let maxChunkBytes = 0;
      let peakEncodeQueue = 0;
      let hash = 0x811c9dc5;
      let failure: Error | undefined;
      const encoder = new AudioEncoder({
        output(chunk) {
          const view = new Uint8Array(chunk.byteLength);
          chunk.copyTo(view);
          chunks += 1;
          bytes += view.byteLength;
          maxChunkBytes = Math.max(maxChunkBytes, view.byteLength);
          hash = updateHash(hash, view);
        },
        error(error) {
          failure = error;
        },
      });
      encoder.configure(audioSupport.config ?? audioConfig);
      const framesPerPacket = 960;
      const samples = new Float32Array(framesPerPacket * 2);
      for (let frame = 0; frame < framesPerPacket; frame += 1) {
        const sample = Math.sin((frame * 2 * Math.PI * 440) / 48_000) * 0.2;
        samples[frame] = sample;
        samples[framesPerPacket + frame] = sample;
      }

      const started = performance.now();
      for (let index = 0; index < 500; index += 1) {
        while (encoder.encodeQueueSize > 2) await nextDequeue(encoder);
        const data = new AudioData({
          format: "f32-planar",
          sampleRate: 48_000,
          numberOfFrames: framesPerPacket,
          numberOfChannels: 2,
          timestamp: index * 20_000,
          data: samples,
        });
        encoder.encode(data);
        peakEncodeQueue = Math.max(peakEncodeQueue, encoder.encodeQueueSize);
        data.close();
      }
      await encoder.flush();
      const elapsedMs = performance.now() - started;
      encoder.close();
      if (failure) throw failure;
      return {
        elapsedMs,
        chunks,
        bytes,
        maxChunkBytes,
        peakEncodeQueue,
        hash: hash.toString(16).padStart(8, "0"),
      };
    };

    const videoRuns: Run[] = [];
    const vp9HardwareRuns: Run[] = [];
    const audioRuns: Run[] = [];
    if (videoSupport.supported) {
      for (let run = 0; run < 3; run += 1) {
        videoRuns.push(await runVideo(videoSupport.config ?? videoConfig));
      }
    }
    if (
      videoCapabilityEntries.find(([name]) => name === "vp9")?.[1]
        .preferHardware
    ) {
      for (let run = 0; run < 3; run += 1) {
        vp9HardwareRuns.push(await runVideo(vp9HardwareConfig));
      }
    }
    if (audioSupport.supported) {
      for (let run = 0; run < 3; run += 1) audioRuns.push(await runAudio());
    }
    return {
      userAgent: navigator.userAgent,
      secureContext: window.isSecureContext,
      crossOriginIsolated: window.crossOriginIsolated,
      videoSupport: videoSupport.supported,
      videoHardwareSupport: videoHardwareSupport.supported,
      videoSoftwareSupport: videoSoftwareSupport.supported,
      audioSupport: audioSupport.supported,
      videoCapabilities: Object.fromEntries(videoCapabilityEntries),
      audioCapabilities: Object.fromEntries(audioCapabilityEntries),
      videoConfig: videoSupport.config,
      audioConfig: audioSupport.config,
      videoRuns,
      vp9HardwareRuns,
      audioRuns,
    };
  });

  console.log(`WEB_CODECS_ACCELERATION_AUDIT=${JSON.stringify(audit)}`);
  expect(audit.secureContext).toBe(true);
  expect(audit.crossOriginIsolated).toBe(true);
  expect(audit.videoSupport).toBe(true);
  expect(audit.audioSupport).toBe(true);
  expect(typeof audit.videoHardwareSupport).toBe("boolean");
  expect(typeof audit.videoSoftwareSupport).toBe("boolean");
  expect(audit.videoRuns).toHaveLength(3);
  expect(audit.vp9HardwareRuns).toHaveLength(
    audit.videoCapabilities.vp9.preferHardware ? 3 : 0,
  );
  expect(audit.audioRuns).toHaveLength(3);
  for (const run of [
    ...audit.videoRuns,
    ...audit.vp9HardwareRuns,
    ...audit.audioRuns,
  ]) {
    expect(run.chunks).toBeGreaterThan(0);
    expect(run.bytes).toBeGreaterThan(0);
    expect(run.maxChunkBytes).toBeLessThanOrEqual(262_144);
    expect(run.peakEncodeQueue).toBeLessThanOrEqual(3);
  }
});
