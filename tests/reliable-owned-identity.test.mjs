import assert from "node:assert/strict";
import { test } from "node:test";
import { queryReliableProcessIdentity } from "../scripts/lib/reliable-owned-identity.mjs";
test("launch identity retries unavailable query, but never fabricates absence",async()=>{
  let calls=0;const expected={pid:7,parentPid:6,createdAt:"2026-10-15T17:15:45Z"};
  assert.deepEqual(await queryReliableProcessIdentity(7,{query:async()=>{if(++calls<3)throw new Error("CIM unavailable");return expected;},pause:async()=>{}}),expected);
  assert.equal(calls,3);calls=0;
  await assert.rejects(queryReliableProcessIdentity(7,{query:async()=>{calls++;throw new Error("CIM unavailable");},pause:async()=>{}}),/CIM unavailable/);
  assert.equal(calls,3);
  assert.equal(await queryReliableProcessIdentity(7,{query:async()=>null}),null);
  await assert.rejects(queryReliableProcessIdentity(7,{query:async()=>({...expected,pid:8}),pause:async()=>{}}));
});
