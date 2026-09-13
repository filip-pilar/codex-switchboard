import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {SessionCalls} from '../gateway/transport/acp/session-calls.mjs';

test('overlapping sessions cannot consume each other’s results or replay a result', async () => {
 const broker=new SessionCalls(), a=broker.open(), b=broker.open();
 const ca=broker.enqueue(a,{name:'a'}), cb=broker.enqueue(b,{name:'b'});
 assert.equal(broker.complete(a,ca.id,'premature'),false);
 broker.take(a);broker.take(b);
 assert.equal(broker.complete(b,ca.id,'cross-session'),false);
 assert.equal(broker.complete(a,cb.id,'cross-session'),false);
 assert.equal(broker.complete(a,ca.id,'A'),true);
 assert.equal(broker.complete(a,ca.id,'replay'),false);
 assert.equal(broker.complete(b,cb.id,'B'),true);
 assert.deepEqual(await Promise.all([ca.result,cb.result]),['A','B']);
 broker.cancel(a);broker.cancel(b);assert.equal(broker.size,0);
});
test('disconnect rejects issued and queued calls only in its own session', async () => {
 let cancellations=0;const broker=new SessionCalls(),a=broker.open(()=>cancellations++),b=broker.open();
 const one=broker.enqueue(a,{}),two=broker.enqueue(a,{}),other=broker.enqueue(b,{});
 const rejected=Promise.all([assert.rejects(one.result,/session_cancelled/),assert.rejects(two.result,/session_cancelled/)]);
 broker.take(a);broker.take(b);const response=new EventEmitter();response.writableEnded=false;broker.bindResponse(a,response);response.emit('close');
 await rejected;assert.equal(cancellations,1);assert.equal(broker.complete(a,one.id,'late'),false);
 assert.equal(broker.complete(b,other.id,'ok'),true);assert.equal(await other.result,'ok');
 assert.throws(()=>broker.enqueue(a,{}),/session_closed/);broker.cancel(b);
});
test('normal response handoff keeps the pending tool call alive and bounds are enforced', async () => {
 const broker=new SessionCalls({maxSessions:1,maxPending:1}),a=broker.open();
 assert.throws(()=>broker.open(),/session_limit/);const c=broker.enqueue(a,{});assert.throws(()=>broker.enqueue(a,{}),/pending_limit/);
 const response=new EventEmitter();response.writableEnded=true;broker.bindResponse(a,response);response.emit('close');
 broker.take(a);assert.equal(broker.complete(a,c.id,'result'),true);assert.equal(await c.result,'result');broker.cancel(a);
});
