import test from 'node:test';
import assert from 'node:assert/strict';
import handler,{access,methods} from '../cloud/hatchable/api/brain/cloudflare-edge-health.js';

const owner={member:{handle:'michaeljwilliams0123'}};
const response=()=>{
 let code=200,payload=null;
 return {
  setHeader(name,value){assert.equal(name,'Cache-Control');assert.equal(value,'private, no-store');},
  status(value){code=value;return this;},
  json(value){payload=value;return this;},
  get code(){return code;},get payload(){return payload;}
 };
};

test('Cloudflare health is owner-only GET and never authorizes a provider write',async()=>{
 assert.equal(access,'admin');
 assert.deepEqual(methods,['GET']);
 const oldFetch=globalThis.fetch,calls=[];
 globalThis.fetch=async(url,opts)=>{
  calls.push({url,opts});
  return new Response(JSON.stringify({service:'uuam-edge-staging',status:'available',accepting:false}),{status:200});
 };
 try{
  const res=response();
  await handler(owner,res);
  assert.equal(res.code,200);
  assert.equal(res.payload.state,'observed');
  assert.equal(res.payload.ingressAccepting,false);
  assert.equal(res.payload.executionAuthorized,false);
  assert.equal(calls.length,1);
  assert.match(calls[0].url,/^https:\/\/ultron-mw-edge-staging\.mahoraga-mjw0123\.workers\.dev\/healthz$/);
  assert.equal(calls[0].opts.method,'GET');
 }finally{globalThis.fetch=oldFetch;}
});

test('wrong collaborator is denied before any Cloudflare fetch',async()=>{
 const oldFetch=globalThis.fetch;
 globalThis.fetch=()=>{throw Error('must not fetch')};
 try{
  const res=response();
  await handler({member:{handle:'untrusted'}},res);
  assert.equal(res.code,403);
  assert.equal(res.payload.error,'owner-identity-required');
 }finally{globalThis.fetch=oldFetch;}
});

test('incorrect health service fails closed and does not claim acceptance',async()=>{
 const oldFetch=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({service:'unexpected',status:'available',accepting:true}),{status:200});
 try{
  const res=response();
  await handler(owner,res);
  assert.equal(res.code,502);
  assert.equal(res.payload.state,'invalid-readback');
  assert.equal(res.payload.executionAuthorized,false);
 }finally{globalThis.fetch=oldFetch;}
});

test('Cloudflare outage returns unavailable without emitting effects',async()=>{
 const oldFetch=globalThis.fetch;
 globalThis.fetch=async()=>{throw Error('offline')};
 try{
  const res=response();
  await handler(owner,res);
  assert.equal(res.code,503);
  assert.equal(res.payload.state,'unavailable');
  assert.equal(res.payload.executionAuthorized,false);
 }finally{globalThis.fetch=oldFetch;}
});
