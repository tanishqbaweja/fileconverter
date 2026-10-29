// Synthetic framework dependency diagnostic only, never an application converter.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parentPort,workerData } from "node:worker_threads";
import { pathToFileURL } from "node:url";
const requests=[];
globalThis.fetch=async resource=>{requests.push(String(resource).slice(0,256));throw new Error("Framework security fixture must not fetch");};
try{
  const {ImageResponse,withinBundledSatori}=await import(pathToFileURL(workerData.probePath).href);
  assert.equal(typeof ImageResponse,"function");assert.equal(typeof withinBundledSatori,"function");
  const font=await readFile(workerData.fontPath);assert.ok(font.length>0&&font.length<=1048576);
  const options={width:100,height:100,fonts:[{name:"fixture",data:font,weight:400,style:"normal"}],embedFont:false};
  const element=(type,props={})=>({type,props});
  const payload='red"/><path data-pwned="true"/><text fill="red';
  const cases=[];
  for(const [name,node]of [
    ["benign-text",element("div",{style:{color:"red"},children:"safe"})],
    ["escaped-text",element("div",{children:'A & B "><path data-pwned="true"/>'})],
    ["attribute-value",element("div",{style:{color:payload},children:"safe"})],
    ["invalid-element",element("svg",{width:100,height:100,children:element('path><path data-pwned="true"')})],
    ["invalid-attribute",element("svg",{width:100,height:100,children:element("path",{'data-label" data-pwned':"true"})})],
    ["internal-style",element("div",{style:{_inheritedClipPathId:'x)"/><rect width="100" height="100"/><g data-x="'},children:"safe"})],
  ]){
    try{
      const svg=await withinBundledSatori(node,options);assert.equal(typeof svg,"string");assert.ok(Buffer.byteLength(svg)<=65536);
      cases.push({name,kind:"svg",bytes:Buffer.byteLength(svg),injectedPath:svg.includes('<path data-pwned="true"'),
        escapedAttribute:svg.includes('red&quot;/&gt;&lt;path data-pwned=&quot;true&quot;'),hasSvg:svg.startsWith("<svg")});
    }catch(error){cases.push({name,kind:"rejected",error:String(error).slice(0,512)});}
  }
  const response=new ImageResponse(element("div",{style:{display:"flex",width:32,height:16,backgroundColor:"#00ff00"}}),{width:32,height:16});
  assert.equal(response.headers.get("content-type"),"image/png");const reader=response.body.getReader();let png=Buffer.alloc(0);
  try{for(;;){const {done,value}=await reader.read();if(done)break;assert.ok(png.length+value.byteLength<=65536);png=Buffer.concat([png,Buffer.from(value)]);}}
  finally{await reader.cancel();reader.releaseLock();}
  assert.equal(png.subarray(1,4).toString(),"PNG");assert.equal(png.readUInt32BE(16),32);assert.equal(png.readUInt32BE(20),16);
  parentPort.postMessage({cases,requests,pngBase64:png.toString("base64")});
}catch(error){parentPort.postMessage({failure:String(error.stack??error).slice(0,4096),requests});}
