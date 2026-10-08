// Component-only React rendering; not a simulated conversion or browser acceptance.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { createElement, Fragment, useMemo, useState } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { formatById, conversionProfiles } from "../lib/capability-registry.ts";
import { makeStableProgressUiSource, STABLE_PROGRESS_UI_DEPENDENCIES } from "../scripts/lib/stable-progress-ui-recipe.mjs";

const baseline = await readFile(new URL("../app/converter/ConverterApp.tsx", import.meta.url), "utf8");
const candidate = makeStableProgressUiSource(baseline);
const parse = text => ts.createSourceFile("ConverterApp.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const before = parse(baseline), after = parse(candidate);
const names = Object.keys(STABLE_PROGRESS_UI_DEPENDENCIES);
const props = ["file", "inputFormat", "batchFiles", "totalInputBytes", "sourceMediaInspection", "sourceStructuredInspection",
  "sourceImageInspection", "sourcePackageInspection", "sourceInspectionStatus", "sourceInspectionError", "profiles",
  "mediaConversionPlan", "capabilities", "workerReady", "mediaProfile", "selectedProfile", "inputMimeType"];
const declarations = source => {
  const component = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "ConverterApp");
  return component.body.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations]);
};
const helpers = before.statements.filter(node => ts.isFunctionDeclaration(node) &&
  ["formatMediaDuration", "formatBitrate", "describeSourceStream", "mediaPlanActionLabel"].includes(node.name?.text)).map(node => node.getText(before)).join("\n");
const candidateDeclarations = declarations(after).filter(node => ["capabilityItems", ...names].includes(node.name.getText(after)));
assert.equal(candidateDeclarations.length, 5);
const find = (predicate, source = before) => {
  let result;
  const visit = node => { if (predicate(node)) { assert.equal(result, undefined); result = node; } ts.forEachChild(node, visit); };
  visit(source); assert.ok(result); return result;
};
const originalSections = [
  find(node => ts.isJsxExpression(node) && node.getText(before).startsWith("{file ? (") && node.getText(before).includes('className="source-inspection"')).expression.getText(before),
  find(node => ts.isJsxExpression(node) && node.getText(before).startsWith("{profiles.map(")).expression.getText(before),
  find(node => ts.isJsxExpression(node) && node.getText(before).startsWith("{mediaConversionPlan ? (")).expression.getText(before),
  find(node => ts.isJsxElement(node) && node.openingElement.getText(before) === '<div className="capability-strip">').getText(before),
];
const compile = (optimized, trackRerenders = false) => {
  const body = optimized ? candidateDeclarations.map(node => `const ${node.getText(after)};`).join("\n") :
    `const capabilityItems = ${declarations(before).find(node => node.name.getText(before) === "capabilityItems").initializer.getText(before)};`;
  const sections = optimized || trackRerenders ? names : originalSections;
  const originalNamed = !optimized && trackRerenders ? names.map((name, index) => `const ${name} = (${originalSections[index]});`).join("\n") : "";
  const rerender = trackRerenders ? `parameters.observe(index, { capabilityItems, ${names.join(", ")} });
    if (index + 1 < parameters.states.length) setIndex(index + 1);` : "";
  const setup = trackRerenders ? "const [index, setIndex] = useState(0); const props = parameters.states[index];" : "const props = parameters;";
  const source = `function View(parameters) { ${setup} const { ${props.join(", ")} } = props; ${body}\n${originalNamed}\n${rerender}\n return <>${sections.map(section => `{${section}}`).join("")}</>; }\n${helpers}\nView;`;
  const result = ts.transpileModule(source, { fileName: "view.tsx", reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
  assert.deepEqual(result.diagnostics, []);
  return runInNewContext(result.outputText, { useMemo, useState, formatById, exports: {}, require: id => {
    assert.equal(id, "react/jsx-runtime"); return jsxRuntime;
  } }, { timeout: 1000 });
};
const OriginalView = compile(false), CandidateView = compile(true);
const initial = {
  file: null, inputFormat: null, batchFiles: [], totalInputBytes: 0, sourceMediaInspection: null,
  sourceStructuredInspection: null, sourceImageInspection: null, sourcePackageInspection: null,
  sourceInspectionStatus: "idle", sourceInspectionError: null, profiles: [], mediaConversionPlan: null,
  capabilities: null, workerReady: false, mediaProfile: false, selectedProfile: null, inputMimeType: undefined,
};
const equalMarkup = state => {
  const original = renderToStaticMarkup(createElement(OriginalView, state));
  const optimized = renderToStaticMarkup(createElement(CandidateView, state));
  assert.equal(optimized, original); return optimized;
};

test("Real React output matches original for absent, changing, batch, error and every inspection category", () => {
  assert.equal(equalMarkup(initial), '<div class="capability-strip"></div>');
  const selected = { ...initial, file: { name: "UNIT_ONLY_café.mkv", type: "video/x-matroska", lastModified: 1700000000000 },
    inputFormat: "mkv", batchFiles: [{}], totalInputBytes: 1048577, sourceInspectionStatus: "inspecting" };
  assert.ok(equalMarkup(selected).includes("Reading a bounded local header slice"));
  assert.ok(equalMarkup({ ...selected, sourceInspectionStatus: "error", sourceInspectionError: "UNIT_ONLY_changed error" }).includes("UNIT_ONLY_changed error"));
  const common = { inspectedBytes: 65536, maximumInspectionBytes: 1048576, notes: ["UNIT_ONLY_note"] };
  const media = { ...common, container: "Matroska", codec: "hevc", durationSeconds: 90.5, bitrateBps: 1234567,
    mediaType: "video", width: 1920, height: 804, frameRate: 24, metadataSignals: ["chapters", "language"],
    streams: [{ mediaType: "video", codec: "hevc", width: 1920, height: 804, frameRate: 24 },
      { mediaType: "audio", codec: "aac", sampleRateHz: 48000, channelLayout: "5.1", bitsPerSample: 24, durationSeconds: 90.5 },
      { mediaType: "subtitle", codec: "subrip" }] };
  assert.ok(equalMarkup({ ...selected, sourceInspectionStatus: "ready", sourceMediaInspection: media }).includes("1920×804"));
  assert.ok(equalMarkup({ ...selected, sourceMediaInspection: { ...media, mediaType: "audio", sampleRateHz: 44100, channelLayout: "stereo", bitsPerSample: 16 } }).includes("44,100 Hz"));
  const facts = [{ label: "UNIT_ONLY_records", value: "23" }];
  assert.ok(equalMarkup({ ...selected, sourceStructuredInspection: { ...common, structure: "CSV rows", facts } }).includes("CSV rows"));
  assert.ok(equalMarkup({ ...selected, sourcePackageInspection: { ...common, structure: "EPUB package", facts } }).includes("EPUB package"));
  assert.ok(equalMarkup({ ...selected, sourceImageInspection: { ...common, format: "PNG", width: 100, height: 200,
    colorModel: "RGBA", bitDepth: 8, animation: "Static", metadataSignals: ["ICC"] } }).includes("100×200"));
  assert.ok(equalMarkup({ ...selected, batchFiles: [{}, {}], totalInputBytes: 2097154 }).includes("Varies by file"));
  assert.ok(!equalMarkup({ ...selected, file: null }).includes("source-inspection"));
});

test("Real React output matches changed selector, blocking stream plans and browser capability disclosures", () => {
  const profiles = conversionProfiles.filter(profile => profile.public && profile.input === "mkv").slice(0, 3);
  assert.equal(profiles.length, 3);
  assert.ok(equalMarkup({ ...initial, profiles }).includes(`value="${profiles[0].id}"`));
  const plan = { blockingReasons: ["UNIT_ONLY_incompatible"], metadataSummary: "UNIT_ONLY_metadata",
    streams: ["copy", "re-encode", "reject", "exclude"].map((action, streamIndex) => ({ action, streamIndex,
      mediaType: streamIndex ? "audio" : "video", codec: "UNIT_ONLY_codec", detail: `UNIT_ONLY_${action}` })) };
  const markup = equalMarkup({ ...initial, mediaConversionPlan: plan, batchFiles: [{}, {}] });
  for (const label of ["Copy", "Re-encode", "Reject", "Exclude", "UNIT_ONLY_incompatible", "first selected file"]) assert.ok(markup.includes(label));
  const capabilities = { secure: true, directoryAccess: false, fileSystemAccess: true, workers: true, wasm: true,
    wasmSimd: true, sharedArrayBuffer: true, imageDecoderTypes: { "image/heic": true }, imageDecoder: true,
    offscreenCanvas: true, opfs: true, storageEstimate: true, crossOriginIsolated: true, webCrypto: true,
    webCodecsVideo: false, webCodecsAudio: false };
  const capable = { ...initial, capabilities, workerReady: true, mediaProfile: true, batchFiles: [{}],
    selectedProfile: { browserRequirements: ["ImageDecoder"] }, inputMimeType: "image/heic" };
  assert.ok(equalMarkup(capable).includes("Image decoder: image/heic"));
  assert.ok(equalMarkup({ ...capable, batchFiles: [{}, {}], workerReady: false, inputMimeType: "image/png" }).includes('class="no"'));
  assert.ok(!equalMarkup({ ...capable, selectedProfile: null, mediaProfile: false }).includes("Image decoder:"));
});

test("Actual React rerenders reuse unchanged trees and refresh every relevant source/profile/batch/capability input", () => {
  const shared = { ...initial, file: { name: "UNIT_ONLY_a.mkv", type: "video/x-matroska", lastModified: 1700000000000 },
    inputFormat: "mkv", batchFiles: [{}], totalInputBytes: 1234, profiles: conversionProfiles.filter(profile => profile.public && profile.input === "mkv").slice(0, 2),
    capabilities: { secure: true, workers: true, wasm: true, imageDecoderTypes: {} },
    mediaConversionPlan: { streams: [], blockingReasons: [], metadataSummary: "UNIT_ONLY_summary" },
    selectedProfile: { browserRequirements: [] } };
  const steps = [
    { change: {}, refreshed: [] },
    { change: {}, refreshed: [] }, // Unrelated render, not simulated converter progress.
    { change: { file: { ...shared.file, name: "UNIT_ONLY_b.mkv" } }, refreshed: ["sourceInspectionSection"] },
    { change: { inputFormat: "mp4" }, refreshed: ["sourceInspectionSection"] },
    { change: { totalInputBytes: 4567 }, refreshed: ["sourceInspectionSection"] },
    { change: { sourceInspectionStatus: "error", sourceInspectionError: "UNIT_ONLY_changed" }, refreshed: ["sourceInspectionSection"] },
    { change: { sourceStructuredInspection: { structure: "UNIT_ONLY_JSON", facts: [], notes: [], inspectedBytes: 1, maximumInspectionBytes: 64 } }, refreshed: ["sourceInspectionSection"] },
    { change: { sourcePackageInspection: { structure: "UNIT_ONLY_EPUB", facts: [], notes: [], inspectedBytes: 2, maximumInspectionBytes: 64 } }, refreshed: ["sourceInspectionSection"] },
    { change: { sourceImageInspection: { format: "PNG", width: 1, height: 2, colorModel: "RGBA", animation: "Static", metadataSignals: [], notes: [], inspectedBytes: 3, maximumInspectionBytes: 64 } }, refreshed: ["sourceInspectionSection"] },
    { change: { sourceMediaInspection: { container: "Matroska", codec: "hevc", metadataSignals: [], notes: [], inspectedBytes: 4, maximumInspectionBytes: 64 } }, refreshed: ["sourceInspectionSection"] },
    { change: { profiles: [...shared.profiles].reverse() }, refreshed: ["outputFormatOptions"] },
    { change: { mediaConversionPlan: { ...shared.mediaConversionPlan, metadataSummary: "UNIT_ONLY_changed" } }, refreshed: ["mediaPlanSection"] },
    { change: { batchFiles: [{}, {}] }, refreshed: ["sourceInspectionSection", "mediaPlanSection", "capabilityStrip", "capabilityItems"] },
    { change: { capabilities: { ...shared.capabilities, secure: false } }, refreshed: ["capabilityStrip", "capabilityItems"] },
    { change: { workerReady: true }, refreshed: ["capabilityStrip", "capabilityItems"] },
    { change: { mediaProfile: true }, refreshed: ["capabilityStrip", "capabilityItems"] },
    { change: { selectedProfile: { browserRequirements: ["ImageDecoder"] } }, refreshed: ["capabilityStrip", "capabilityItems"] },
    { change: { inputMimeType: "image/png" }, refreshed: ["capabilityStrip", "capabilityItems"] },
    { change: {}, refreshed: [] },
    { change: { file: null }, refreshed: ["sourceInspectionSection"] },
  ];
  const states = []; let state = shared;
  for (const step of steps) { state = { ...state, ...step.change }; states.push(state); }
  const observe = View => {
    const rows = [];
    renderToStaticMarkup(createElement(View, { states, observe(index, trees) {
      assert.equal(index, rows.length); assert.ok(rows.length < 24); rows.push(trees);
    } }));
    assert.equal(rows.length, states.length); return rows;
  };
  const originalRows = observe(compile(false, true)), optimizedRows = observe(compile(true, true));
  const markup = row => renderToStaticMarkup(createElement(Fragment, null, ...names.map(name => row[name])));
  for (let index = 0; index < steps.length; index++) {
    assert.equal(markup(optimizedRows[index]), markup(originalRows[index]), `Same original markup at render ${index}`);
    if (!index) continue;
    for (const name of ["capabilityItems", ...names]) {
      assert.equal(optimizedRows[index][name] !== optimizedRows[index - 1][name], steps[index].refreshed.includes(name), `${name} dependency invalidation at render ${index}`);
    }
  }
  assert.equal(optimizedRows.at(-1).sourceInspectionSection, null, "Clearing source releases the current inspection tree");
});
