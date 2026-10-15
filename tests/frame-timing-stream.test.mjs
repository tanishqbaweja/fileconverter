import assert from "node:assert/strict";
import { test } from "node:test";
import { createFrameTimingCollector } from "../scripts/lib/frame-timing-stream.mjs";
test("bounded CSV collector matches legacy parseFloat timing digest across every byte boundary",()=>{
  const bytes=Buffer.from("0.000000,side data\r\n\n0.041667\n0.083333"),a=createFrameTimingCollector(),b=createFrameTimingCollector();
  a.push(bytes);for(const byte of bytes)b.push(Buffer.from([byte]));
  assert.deepEqual(a.finish(3),b.finish(3));assert.equal(a.snapshot().frames,3);
});
test("missing, duplicated, backwards or oversized timing data cannot become a successful validation",()=>{
  for(const input of ["N/A\n0.041667\n","0\n0\n","0.1\n0.05\n"]){const collector=createFrameTimingCollector();assert.throws(()=>{collector.push(Buffer.from(input));collector.finish(2);});}
  assert.throws(()=>createFrameTimingCollector({maximumBytes:4}).push(Buffer.from("0.000\n")));
  assert.throws(()=>createFrameTimingCollector({maximumLineBytes:4}).push(Buffer.from("123456")));
  assert.throws(()=>createFrameTimingCollector({maximumFrames:1}).push(Buffer.from("0\n1\n")));
});
