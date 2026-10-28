// Native tools validate browser output only. Never called as a converter.
import assert from "node:assert/strict";
import path from "node:path";
export function svgStripSeamGraph(width,height,centralRows=64) {
  assert.ok([width,height,centralRows].every(Number.isSafeInteger));
  assert.ok(width>0&&width<=8192&&height>8&&height<=8192&&width*height<=8388608&&centralRows>=8);
  const seams=[];for(let y=centralRows;y+4<=height;y+=centralRows)seams.push(y);
  assert.ok(seams.length>0&&seams.length<=127);
  const split=(input,prefix)=>`[${input}:v]format=rgb24,split=${seams.length}`+seams.map((_y,i)=>`[${prefix}${i}]`).join("");
  const graph=[split(0,"a"),split(1,"b")];
  seams.forEach((y,i)=>{
    graph.push(`[a${i}]crop=${width}:8:0:${y-4}[c${i}]`,`[b${i}]crop=${width}:8:0:${y-4}[d${i}]`);
    graph.push(`[c${i}][d${i}]ssim[seam${i}]`);
    if(i<seams.length-1)graph.push(`[seam${i}]nullsink`);
  });
  return {seams,filter:graph.join(";"),map:`[seam${seams.length-1}]`};
}
export async function validateSvgStripSeams({outputPath,referencePath,width,height,centralRows=64,execute,cwd}) {
  assert.ok(path.isAbsolute(cwd));
  for(const file of [outputPath,referencePath])assert.ok(path.isAbsolute(file)&&path.relative(cwd,file).split(path.sep)[0]!==".."&&file!==cwd);
  const graph=svgStripSeamGraph(width,height,centralRows);
  const result=await execute("ffmpeg",["-v","info","-filter_complex_threads","1","-threads","1","-i",referencePath,
    "-threads","1","-i",outputPath,"-filter_complex",graph.filter,"-map",graph.map,"-frames:v","1","-f","null","NUL"],
    {cwd,windowsHide:true,maxBuffer:131072,timeout:30000});
  const scores=[...result.stderr.matchAll(/SSIM[^\r\n]*All:([0-9.]+)/g)].map(match=>Number(match[1]));
  assert.equal(scores.length,graph.seams.length,"Every strip boundary must have an available independent SSIM score");
  assert.ok(scores.every(score=>Number.isFinite(score)&&score>=-1&&score<=1));
  const alpha=async file=>{
    const {stdout}=await execute("ffmpeg",["-v","error","-threads","1","-i",file,"-vf","format=rgba,alphaextract","-frames:v","1","-f","rawvideo","-"],
      {cwd,windowsHide:true,maxBuffer:width*height+65536,timeout:30000,encoding:"buffer"});
    assert.ok(Buffer.isBuffer(stdout));assert.equal(stdout.length,width*height);return stdout;
  };
  const referenceAlpha=await alpha(referencePath),outputAlpha=await alpha(outputPath),alphaExact=referenceAlpha.equals(outputAlpha);
  const allReferenceAlphaOpaque=referenceAlpha.every(value=>value===255),minimumSsim=Math.min(...scores);
  return {seamRows:graph.seams,seamBandHeight:8,scores,minimumSsim,requiredMinimumSsim:0.99,
    alphaExact,alphaComparedPixels:width*height,allReferenceAlphaOpaque,
    transparentInputCoverage:!allReferenceAlphaOpaque,passed:minimumSsim>=0.99&&alphaExact,
    validator:"independent-native-FFmpeg-per-boundary-SSIM-and-exact-alpha"};
}
