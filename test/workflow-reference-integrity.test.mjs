import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {auditWorkflowReferences} from '../scripts/check-workflow-references.mjs';

const projectRoot=new URL('../',import.meta.url);
function withRepo(files,fn){
  const root=mkdtempSync(join(tmpdir(),'ultron-workflow-refs-'));
  try{
    for(const [name,text] of Object.entries(files)){
      const target=join(root,name);
      mkdirSync(join(target,'..'),{recursive:true});
      writeFileSync(target,text);
    }
    return fn(root);
  }finally{rmSync(root,{recursive:true,force:true});}
}
test('current consolidated workflow names, reusable callees and executable paths are valid',()=>{
  const result=auditWorkflowReferences(projectRoot);
  assert.deepEqual(result.errors,[]);
  assert.ok(result.workflowCount>=9);
  assert.ok(result.referencesChecked>=50);
});
test('Core Verify runs static reference preflight before installing dependencies',()=>{const workflow=readFileSync(new URL('../.github/workflows/verify.yml',import.meta.url),'utf8');const check=workflow.indexOf('node scripts/check-workflow-references.mjs');const install=workflow.indexOf('npm ci --ignore-scripts');assert.ok(check>0&&check<install,'reference preflight must precede dependency installation');});
test('missing script or deleted reusable workflow fails with exact path',()=>withRepo({
  '.github/workflows/root.yml':`name: Example
on:
  workflow_dispatch:
jobs:
  job:
    uses: ./.github/workflows/missing.yml
    steps:
      - run: node scripts/removed.mjs
`
},root=>{
  const result=auditWorkflowReferences(root);
  assert.ok(result.errors.some(e=>e.includes('missing.yml')),result.errors.join(';'));
  assert.ok(result.errors.some(e=>e.includes('scripts/removed.mjs')),result.errors.join(';'));
}));
test('workflow_run names are validated against actual workflow names, not filenames',()=>withRepo({
  '.github/workflows/root.yml':`name: Audit
on:
  workflow_run:
    workflows: ["Old verification name"]
    types: [completed]
jobs:
  audit:
    runs-on: ubuntu-latest
`,
  '.github/workflows/verify.yml':'name: New verification name\non:\n  push:\n'
},root=>{
  const result=auditWorkflowReferences(root);
  assert.ok(result.errors.some(e=>e.includes('Old verification name')),result.errors.join(';'));
}));
test('a target used as reusable workflow must declare workflow_call',()=>withRepo({
  '.github/workflows/root.yml':'name: Root\non:\n  workflow_dispatch:\njobs:\n  child:\n    uses: ./.github/workflows/task.yml\n',
  '.github/workflows/task.yml':'name: Task\non:\n  push:\n',
},root=>{
  const result=auditWorkflowReferences(root);
  assert.ok(result.errors.some(e=>e.includes('workflow_call')),result.errors.join(';'));
}));
