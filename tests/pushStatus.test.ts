import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentCommitNotice } from '../src/pushStatus';
import type { PushReport } from '../src/useRepositoryPush';
test('a successful retry clears the Copilot failure notice for the same commit and preserves unrelated errors', () => {
  const commitHash='a'.repeat(40);const notice={text:'Some destinations failed.',type:'error' as const,pushCommit:commitHash};
  const partial:PushReport={commitHash,success:false,results:[],output:''};assert.equal(currentCommitNotice(notice,partial)?.type,'error');
  const complete={...partial,success:true};assert.equal(currentCommitNotice(notice,complete)?.type,'success');assert.match(currentCommitNotice(notice,complete)!.text,/Verified/);
  const unrelated={text:'Could not generate a commit message.',type:'error' as const};assert.deepEqual(currentCommitNotice(unrelated,complete),unrelated);
  assert.deepEqual(currentCommitNotice(notice,{...complete,commitHash:'b'.repeat(40)}),notice);
});
