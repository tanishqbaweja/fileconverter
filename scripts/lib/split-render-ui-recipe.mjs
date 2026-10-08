// Private structural candidate. No cache/markup/engine/quality change or native-cause claim.
import assert from "node:assert/strict";
import path from "node:path";
import ts from "typescript";
import { sha, baselineBinding } from "./stable-ui-headless-baseline-recipe.mjs";
import { STABLE_PROGRESS_UI_BASELINE_SHA256 } from "./stable-progress-ui-recipe.mjs";
export { baselineBinding };
export function makeSplitRenderUiSource(original, root) {
  assert.equal(sha(original), STABLE_PROGRESS_UI_BASELINE_SHA256);
  const text=original.replaceAll("\r\n","\n"), appPath=path.join(root,"app/converter/ConverterApp.tsx");
  const config=ts.readConfigFile(path.join(root,"tsconfig.json"),ts.sys.readFile);assert.equal(config.error,undefined);
  const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,root);
  const host=ts.createCompilerHost({...parsed.options,incremental:false}),read=host.readFile;
  host.readFile=file=>path.resolve(file).toLowerCase()===appPath.toLowerCase()?text:read(file);
  const program=ts.createProgram([appPath],{...parsed.options,incremental:false},host),file=program.getSourceFile(appPath),checker=program.getTypeChecker();
  assert.ok(file);
  const component=file.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==="ConverterApp");assert.ok(component?.body);
  const returns=component.body.statements.filter(ts.isReturnStatement);assert.equal(returns.length,1);
  const returned=returns[0],page=returned.expression;assert.ok(page);
  const found=[];const visit=node=>{found.push(node);ts.forEachChild(node,visit);};visit(page);
  const attribute=(node,name)=>ts.isJsxElement(node)?node.openingElement.attributes.properties.find(attr=>ts.isJsxAttribute(attr)&&attr.name.getText(file)===name)?.initializer?.getText(file):undefined;
  const pick=(name,value)=>{const matches=found.filter(node=>attribute(node,name)===JSON.stringify(value));assert.equal(matches.length,1,`${name}=${value}`);return matches[0];};
  const enclosingExpression=node=>{while(node&&!ts.isJsxExpression(node))node=node.parent;assert.ok(node?.expression);return node;};
  const enclosingField=node=>{while(node&&!(ts.isJsxElement(node)&&node.openingElement.tagName.getText(file)==="fieldset"))node=node.parent;assert.ok(node);return node;};
  const selected=[
    ["renderConverterPage",page],
    ["renderSiteHeader",pick("className","site-header")],
    ["renderHeroIntro",pick("className","hero-copy")],
    ["renderConverterCard",pick("className","converter-card")],
    ["renderSourceInspection",enclosingExpression(pick("data-testid","source-inspection"))],
    ["renderOutputControls",pick("className","control-grid")],
    ["renderAudioControls",enclosingExpression(enclosingField(pick("data-testid","audio-codec-select")))],
    ["renderVideoControls",enclosingExpression(enclosingField(pick("data-testid","video-codec-select")))],
    ["renderMediaPlan",enclosingExpression(pick("data-testid","media-conversion-plan"))],
    ["renderProgressPanel",enclosingExpression(pick("className","progress-panel"))],
    ["renderPrivacyProof",pick("className","proof-section")],
    ["renderCapabilities",pick("className","capability-strip")],
    ["renderStorageManagement",pick("className","storage-card")],
  ];
  const footer=found.filter(node=>ts.isJsxElement(node)&&node.openingElement.tagName.getText(file)==="footer");assert.equal(footer.length,1);
  selected.push(["renderSiteFooter",footer[0]]);
  const drop=found.filter(node=>attribute(node,"className")?.startsWith('{`drop-zone '));assert.equal(drop.length,1);
  selected.push(["renderFileDrop",drop[0]]);
  const sections=selected.map(([name,node])=>({name,node,start:node.getStart(file),end:node.getEnd(),children:[]}));
  for(const child of sections.slice(1)){
    const parent=sections.filter(row=>row.start<=child.start&&row.end>=child.end&&row!==child).sort((a,b)=>(a.end-a.start)-(b.end-b.start))[0];
    assert.ok(parent,child.name);parent.children.push(child);
  }
  const locals=(node,excluded=[])=>{
    const names=new Set(),start=node.getStart(file),end=node.getEnd();
    const walk=part=>{
      if(excluded.some(row=>part===row.node))return;
      if(ts.isIdentifier(part)){
        let symbol=checker.getSymbolAtLocation(part);
        if(ts.isShorthandPropertyAssignment(part.parent))symbol=checker.getShorthandAssignmentValueSymbol(part.parent)??symbol;
        const decls=symbol?.declarations??[];
        if(decls.some(decl=>decl.getSourceFile()===file&&decl.getStart(file)>component.body.getStart(file)&&decl.getEnd()<component.body.getEnd()&&
          !(decl.getStart(file)>=start&&decl.getEnd()<=end)))names.add(part.text);
      }
      ts.forEachChild(part,walk);
    };walk(node);return [...names].sort();
  };
  const allNames=locals(page);assert.ok(allNames.length>20&&allNames.length<128);assert.ok(!allNames.includes("model"));
  for(const row of sections){row.locals=locals(row.node,row.children);row.needsModel=Boolean(row.locals.length||row.children.length);}
  const functions=sections.map(row=>{
    const expression=ts.isJsxExpression(row.node)?row.node.expression:row.node;
    assert.ok(expression);let value=expression.getText(file),offset=expression.getStart(file);
    for(const child of row.children.toSorted((a,b)=>b.start-a.start)){
      assert.ok(child.start>=offset&&child.end<=expression.getEnd());
      const replacement=`{${child.name}(${child.needsModel?"model":""})}`;
      value=value.slice(0,child.start-offset)+replacement+value.slice(child.end-offset);
    }
    return `function ${row.name}(${row.needsModel?"model: ConverterAppModel":""}) {\n`+
      (row.locals.length?`  const { ${row.locals.join(", ")} } = model;\n`:"")+`  return (\n${value}\n  );\n}\n`;
  });
  const oldFunction=component.getText(file);
  const model=`function useConverterAppModel() {${text.slice(component.body.getStart(file)+1,returned.getStart(file))}`+
    `return { ${allNames.join(", ")} };\n}\n\ntype ConverterAppModel = ReturnType<typeof useConverterAppModel>;\n\n`;
  const replacement=model+functions.join("\n")+'\nexport function ConverterApp() {\n  return renderConverterPage(useConverterAppModel());\n}';
  assert.equal(text.split(oldFunction).length,2);const source=text.replace(oldFunction,replacement);
  const recovered=source.replace(replacement,oldFunction);assert.equal(recovered,text);
  assert.equal(sha(original.includes("\r\n")?recovered.replaceAll("\n","\r\n"):recovered),sha(original));
  // Every original hook/lifecycle/handler statement is byte-identical and in the same order.
  assert.ok(source.includes(text.slice(component.body.getStart(file)+1,returned.getStart(file))));
  return {source,baselineSha256:sha(original),candidateSha256:sha(source),snapshotFields:allNames,
    sections:sections.map(({name,locals,needsModel,start,end,children})=>({name,locals,needsModel,originalBytes:end-start,children:children.map(row=>row.name)})),
    originalComponentBytes:oldFunction.length,modelFunctionBytes:model.indexOf("\ntype ConverterAppModel"),
    renderHelperBytes:functions.map((value,index)=>({name:sections[index].name,bytes:value.length})),
    hooksHandlersAndLifecycleUnchanged:true,markupChanged:false,newReactComponentBoundaries:0,
    nativeAllocationCauseProven:false,publicAcceptance:false,conversionSpeedAcceptance:false,completeChromiumMemoryAcceptance:false};
}
