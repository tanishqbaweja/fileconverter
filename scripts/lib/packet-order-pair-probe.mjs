// Supplemental independent validation only; never participates in conversion.
import assert from "node:assert/strict";
export function withPacketOrderProbe(spec) {
  const before = "      const after = await probe(output);";
  const additional = `
      const packetText = (await native(["-v", "error", "-show_packets", "-show_data_hash", "sha256", "-of", "json", output], "ffprobe")).stdout;
      expect(Buffer.byteLength(packetText)).toBeLessThanOrEqual(1048576);
      const packetProof = JSON.parse(packetText);
      expect(packetProof.packets.length).toBeGreaterThanOrEqual(96);
      expect(packetProof.packets.length).toBeLessThanOrEqual(1024);
      for (const packet of packetProof.packets) expect(packet.data_hash).toMatch(/^SHA256:[a-f0-9]{64}$/);
      const decodedVideoHash = (await native(["-v", "error", "-xerror", "-i", output, "-map", "0:v:0",
        "-c:v", "rawvideo", "-fps_mode", "passthrough", "-f", "streamhash", "-hash", "sha256", "pipe:1"])).stdout.trim();
      expect(decodedVideoHash).toMatch(/^0,v,SHA256=[a-f0-9]{64}$/);
      const boxFile = await open(output, "r"), boxHeader = Buffer.alloc(16);
      const topLevelBoxes = []; const boxFileBytes = (await stat(output)).size;
      try {
        let position = 0;
        while (position < boxFileBytes) {
          expect(topLevelBoxes.length).toBeLessThan(1024);
          const wanted = Math.min(16, boxFileBytes - position);
          const { bytesRead } = await boxFile.read(boxHeader, 0, wanted, position);
          expect(bytesRead).toBe(wanted); expect(bytesRead).toBeGreaterThanOrEqual(8);
          const type = boxHeader.toString("latin1", 4, 8);
          let size = boxHeader.readUInt32BE(0), headerBytes = 8;
          if (size === 1) {
            expect(bytesRead).toBe(16); const large = boxHeader.readBigUInt64BE(8);
            expect(large <= BigInt(Number.MAX_SAFE_INTEGER)).toBe(true);
            size = Number(large); headerBytes = 16;
          } else if (size === 0) size = boxFileBytes - position;
          expect(size).toBeGreaterThanOrEqual(headerBytes); expect(position + size).toBeLessThanOrEqual(boxFileBytes);
          topLevelBoxes.push({ type, position, size, headerBytes }); position += size;
        }
        expect(position).toBe(boxFileBytes);
      } finally { await boxFile.close(); }
      rows.push({ kind: "independent-packet-order-proof", scope: "bounded-small-fixture-independent-validation-not-conversion",
        packets: packetProof.packets, decodedVideoHash, topLevelBoxes, outputBytes: boxFileBytes,
        maximumPackets: 1024, maximumProbeJsonBytes: 1048576, maximumBoxHeaderBytes: 16 });
`;
  assert.equal(spec.split(before).length, 2);
  const generated = spec.replace(before, before + additional);
  assert.equal(generated.replace(before + additional, before), spec);
  return generated;
}
