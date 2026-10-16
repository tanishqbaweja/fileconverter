// Independently verify all actual native CSV fields against a reconstructible,
// immutable source-only reference. No conversion and no output acceptance.
import assert from "node:assert/strict";
import {access,lstat,readFile,unlink,writeFile} from "node:fs/promises";
import path from "node:path";
import {gunzipSync} from "node:zlib";
import {verifyEveryCapturedSourceTimestamp,createQualifiedSourceTimeline} from "./lib/qualified-source-timeline.mjs";
import {verifyThreadValidatorQualification} from "./lib/threaded-validator-qualification.mjs";
import {observeOwnedProcessExit} from "./lib/owned-process-exit-observation.mjs";
import {sha} from "./lib/stable-ui-headless-baseline-recipe.mjs";
const root=path.resolve(import.meta.dirname,".."),read=file=>readFile(path.join(root,file));
assert.equal(process.argv.length,2);
const diagnosticPath="evidence/2026-10-16T21-01-48-525Z-source-timestamp-csv-diagnostic.json",bytes=await read(diagnosticPath),proof=JSON.parse(bytes);
assert.equal(Object.keys(proof.sourcePins).length,9);assert.deepEqual(proof.sourcePins,proof.postSourcePins);
for(const [file,hash]of Object.entries(proof.sourcePins)){assert.equal(sha(Buffer.from(proof.preimages[file],"base64")),hash,file);assert.equal(sha(await read(file)),hash,file);}
const native=await verifyThreadValidatorQualification(root);assert.deepEqual(native.reference,proof.qualification);
const absence=await observeOwnedProcessExit(proof.launch.identity);assert.equal(absence.status,"owned-identity-absent");await assert.rejects(access(proof.runtime),{code:"ENOENT"});
const file=path.join(root,proof.localRawCsv.path);assert.equal(path.dirname(file),path.join(root,"outputs/reports"));
const before=await lstat(file,{bigint:true});assert.ok(before.isFile()&&!before.isSymbolicLink());
const zip=await readFile(file);assert.equal(zip.length,proof.localRawCsv.bytes);assert.equal(sha(zip),proof.localRawCsv.sha256);
const raw=gunzipSync(zip,{maxOutputLength:33554432});assert.equal(raw.length,proof.localRawCsv.restoredBytes);assert.equal(sha(raw),proof.localRawCsv.restoredSha256);
const analysis=verifyEveryCapturedSourceTimestamp(raw.toString("utf8"),proof),values=createQualifiedSourceTimeline(proof);
const ownSources={};for(const name of ["scripts/qualify-source-timeline-reference.mjs","scripts/lib/qualified-source-timeline.mjs","tests/qualified-source-timeline.test.mjs"]){const data=await read(name);ownSources[name]={sha256:sha(data),preimage:data.toString("base64")};}
const output="evidence/2026-10-16T21-01-48-525Z-qualified-source-timeline-reference.json";
await writeFile(path.join(root,output),JSON.stringify({status:"all-native-source-timestamps-exactly-reconstructible-reference-only",
  recordedAt:new Date().toISOString(),diagnostic:{path:diagnosticPath,sha256:sha(bytes)},analysis,
  source:proof.protectedAfter,nativeQualification:native.reference,sourcePinsVerified:9,ownSources,absence,
  timelineBytes:values.byteLength,firstTimestampSeconds:values[0],lastTimestampSeconds:values.at(-1),
  nativeRawCsvFullyVerified:proof.localRawCsv,rawCsvRetention:"deleted-after-every-field-verification; exact reference and hashes retained",
  fullOriginalAcceptance:false,publicAcceptance:false,conversionSpeedGainProven:false,validationReferenceReuseOnly:true},null,2)+"\n",{flag:"wx"});
const after=await lstat(file,{bigint:true});assert.equal(after.dev,before.dev);assert.equal(after.ino,before.ino);assert.equal(sha(await readFile(file)),proof.localRawCsv.sha256);
await unlink(file);
console.log(JSON.stringify({output,analysis,timelineBytes:values.byteLength,redundantRawCsvRemoved:true}));
