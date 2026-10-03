// Keep browser-local extension resource reads distinct from HTTP transmission.
// This exact TTS resource was observed in a fresh owned Chrome profile. It is
// allowed only from its own extension frame/worker, never from the converter.
const ttsOrigin = "chrome-extension://fignfifoniblkonapihmkfakmlgkbkcf";
export function classifyPrivateRequest(request, origin) {
  if (!["GET", "HEAD"].includes(request.method) || request.postData) return "forbidden";
  if (new URL(request.url).origin === origin) return "app-static";
  if (request.url === `${ttsOrigin}/tts_extension.js` &&
      [request.frameUrl, request.serviceWorkerUrl].some((url) => url?.startsWith(`${ttsOrigin}/`))) {
    return "browser-local";
  }
  return "forbidden";
}
