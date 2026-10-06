import { captureBoundedLocalScopes } from "./cdp-bounded-local-scopes.mjs";

export async function attachFailureLocalCapture(transport, targetId, functionNames = null) {
  const { sessionId } = await transport.send("Target.attachToTarget", { targetId, flatten: true });
  const wasmScriptIds = new Set(), captures = [], errors = [];
  let active = null, pauses = 0;
  const send = (method, params) => transport.send(method, params, sessionId);
  const remove = transport.onEvent(event => {
    if (event.sessionId !== sessionId) return;
    if (event.method === "Debugger.scriptParsed" && event.params.scriptLanguage === "WebAssembly") {
      if (wasmScriptIds.size === 16) throw new Error("Wasm script diagnostic cap");
      wasmScriptIds.add(event.params.scriptId);
    }
    if (event.method !== "Debugger.paused") return;
    // Pause only at the existing abort callback. Never introduce a hot codec
    // breakpoint, evaluate native functions, dereference pointers, or mutate data.
    active = (async () => {
      try {
        if (++pauses > 1) throw new Error("Unexpected repeated failure pause");
        captures.push(await captureBoundedLocalScopes(send, event.params, wasmScriptIds, functionNames));
      } catch (error) { if (errors.length < 4) errors.push(String(error).slice(0, 512)); }
      finally {
        try { await send("Debugger.resume"); }
        catch (error) { if (errors.length < 4) errors.push(`Resume unavailable: ${String(error).slice(0, 512)}`); }
      }
    })();
  });
  await send("Debugger.enable");
  return {
    async report() {
      if (active) await active;
      return { sessionId, pauses, wasmScriptsObserved: wasmScriptIds.size, captures, errors,
        publicAcceptance: false, sourceEvaluation: false };
    },
    async close() {
      if (active) await active;
      await send("Debugger.resume").catch(() => {});
      remove();
      await transport.send("Target.detachFromTarget", { sessionId }).catch(() => {});
      transport.close();
    },
  };
}
