import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {gunzipSync} from "node:zlib";
import test from "node:test";
import {createTimestampCsvDiagnostic,executedFrameTimesBody,replayExecutedFrameTimes} from "../scripts/lib/timestamp-csv-diagnostic.mjs";
const root=path.resolve(import.meta.dirname,".."),proof=JSON.parse(await readFile(path.join(root,"evidence/2026-10-16T17-01-47-260Z-updated-chrome-full-terminal.json")));
const archive=JSON.parse(gunzipSync(await readFile(path.join(root,proof.sourceArchive.path)),{maxOutputLength:8388608}));
const body=executedFrameTimesBody(archive.driver);
test("chunk-split CRLF and real FFprobe side-data names replay the exact executed parser",async()=>{
  const stdout="0.000000,H.26[45] User Data Unregistered SEI message\r\n0.042000\r\n0.083000\n";
  const collector=createTimestampCsvDiagnostic();for(const byte of Buffer.from(stdout))collector.push(Buffer.from([byte]));
  const result=collector.finish(),legacy=await replayExecutedFrameTimes(body,stdout);
  assert.equal(result.strictFrames,3);assert.equal(result.floatFrames,3);assert.equal(legacy.frames,3);
  assert.equal(result.strictTimestampSha256,legacy.orderedTimestampSha256);assert.deepEqual(result.disagreements,[]);
  assert.equal(legacy.argumentsUsed.executable,"ffprobe");assert.deepEqual(legacy.argumentsUsed.args.slice(0,4),["-v","error","-threads","4"]);
});
test("permissive float/strict disagreements are retained as evidence, not quietly accepted",async()=>{
  const stdout="0.000000\n0.042000 trailing-text\n0.083000\t\ninvalid\n";
  const collector=createTimestampCsvDiagnostic();collector.push(Buffer.from(stdout));const result=collector.finish();
  assert.equal(result.strictFrames,1);assert.equal(result.floatFrames,3);assert.equal(result.disagreements.length,2);
  assert.equal((await replayExecutedFrameTimes(body,stdout)).frames,1);assert.equal(result.acceptanceParserChanged,false);
});
test("stdout and carry are capped and a completed collector cannot be reused",()=>{
  const tiny=createTimestampCsvDiagnostic({maximumBytes:8});assert.throws(()=>tiny.push(Buffer.from("x".repeat(9))));
  const line=createTimestampCsvDiagnostic();assert.throws(()=>line.push(Buffer.from("x".repeat(4097))));
  const done=createTimestampCsvDiagnostic();done.finish();assert.throws(()=>done.push(Buffer.from("0\n")));assert.throws(()=>done.finish());
});
