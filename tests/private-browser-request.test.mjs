import assert from "node:assert/strict";
import test from "node:test";
import { classifyPrivateRequest } from "../scripts/lib/private-browser-request.mjs";

test("private browser guard permits only static app reads or the exact locally initiated TTS script", () => {
  const origin = "http://127.0.0.1:3000", local = "chrome-extension://fignfifoniblkonapihmkfakmlgkbkcf";
  const request = { url: `${local}/tts_extension.js`, method: "GET", postData: null, frameUrl: `${local}/background.html` };
  assert.equal(classifyPrivateRequest(request, origin), "browser-local");
  assert.equal(classifyPrivateRequest({ ...request, frameUrl: origin }, origin), "forbidden");
  assert.equal(classifyPrivateRequest({ ...request, url: `${request.url}?filename=private.mkv` }, origin), "forbidden");
  assert.equal(classifyPrivateRequest({ ...request, method: "POST", postData: "secret" }, origin), "forbidden");
  assert.equal(classifyPrivateRequest({ ...request, url: "https://external.example/script.js" }, origin), "forbidden");
  assert.equal(classifyPrivateRequest({ ...request, url: `${origin}/engines/remux/within-remux.wasm` }, origin), "app-static");
});
