import test from 'node:test';
import assert from 'node:assert/strict';
import { callerToolName, findCallerTool } from '../gateway/transport/acp/tool-names.mjs';

test('keeps equal leaf names in different namespaces distinct', () => {
  const a = { name: 'read', namespace: 'mcp__alpha' };
  const b = { name: 'read', namespace: 'mcp__beta' };
  assert.equal(callerToolName(a), 'mcp__alpha__read');
  assert.equal(findCallerTool([a,b], 'mcp__beta__read'), b);
  assert.throws(() => findCallerTool([a,b], 'read'), /ambiguous_caller_tool/);
  assert.equal(findCallerTool([a], 'read'), a);
  assert.equal(findCallerTool([a], 'unknown'), undefined);
  assert.equal(callerToolName({name:'search'}), 'search');
});

test('rejects a qualified name collision instead of dispatching the first match', () => {
  assert.throws(() => findCallerTool([
    {name:'read', namespace:'mcp__alpha'}, {name:'mcp__alpha__read'},
  ], 'mcp__alpha__read'), /ambiguous_caller_tool/);
});

test('normalizes one redundant relay prefix only for a loaded tool', () => {
  const a={type:'function',name:'read',namespace:'mcp__alpha'};
  assert.equal(findCallerTool([a], 'mcp__codex__mcp__alpha__read'), a);
  assert.equal(findCallerTool([a], 'mcp__codex__unknown'), undefined);
  assert.equal(findCallerTool([a], 'mcp__codex__mcp__codex__mcp__alpha__read'), undefined);
  const b={type:'function',name:'mcp__codex__mcp__alpha__read'};
  assert.equal(findCallerTool([a,b],b.name),b);
});
