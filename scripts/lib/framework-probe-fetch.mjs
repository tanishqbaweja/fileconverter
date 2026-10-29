// Diagnostic network guard. Embedded Wasm data decoding is not a network request.
export function frameworkProbeFetch(nativeFetch){
  const proof={embeddedWasmDataDecodes:0,maximumEmbeddedDataUrlBytes:0,blockedRequests:[],blockedRequestOverflow:false};
  return {proof,async fetch(resource,options){
    const value=String(resource);
    if(value.startsWith("data:application/octet-stream;base64,")&&value.length<=4*1048576){
      proof.embeddedWasmDataDecodes++;proof.maximumEmbeddedDataUrlBytes=Math.max(proof.maximumEmbeddedDataUrlBytes,value.length);
      return nativeFetch(resource,options);
    }
    if(proof.blockedRequests.length<16)proof.blockedRequests.push(value.slice(0,256));else proof.blockedRequestOverflow=true;
    throw new Error("Framework security fixture must not fetch external resources");
  }};
}
