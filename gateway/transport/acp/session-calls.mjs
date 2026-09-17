import { randomUUID } from "node:crypto";

// One opaque handle per caller conversation. No disk state.
export class SessionCalls {
  #sessions = new Map();
  constructor({ maxSessions = 8, maxPending = 32 } = {}) {
    this.maxSessions = maxSessions;
    this.maxPending = maxPending;
  }
  open(onCancel = () => {}) {
    if (this.#sessions.size >= this.maxSessions)
      throw new Error("session_limit");
    const handle = Object.freeze({ id: randomUUID() });
    this.#sessions.set(handle, { calls: new Map(), onCancel });
    return handle;
  }
  enqueue(handle, payload) {
    const session = this.#sessions.get(handle);
    if (!session) throw new Error("session_closed");
    if (session.calls.size >= this.maxPending) throw new Error("pending_limit");
    const id = `call_${randomUUID()}`;
    let resolve, reject;
    const result = new Promise((yes, no) => {
      resolve = yes;
      reject = no;
    });
    session.calls.set(id, { payload, resolve, reject, issued: false });
    return { id, result };
  }
  take(handle) {
    const session = this.#sessions.get(handle);
    if (!session) return null;
    for (const [id, call] of session.calls) {
      if (call.issued) continue;
      call.issued = true;
      return { id, payload: call.payload };
    }
    return null;
  }
  complete(handle, id, output) {
    const session = this.#sessions.get(handle),
      call = session?.calls.get(id);
    if (!call?.issued) return false;
    session.calls.delete(id);
    call.resolve(output);
    return true;
  }
  cancel(handle) {
    const session = this.#sessions.get(handle);
    if (!session) return false;
    this.#sessions.delete(handle);
    for (const call of session.calls.values())
      call.reject(new Error("session_cancelled"));
    session.calls.clear();
    session.onCancel();
    return true;
  }
  // Ending an SSE response with a tool call is a normal handoff, not cancellation.
  bindResponse(handle, response) {
    const close = () => {
      if (!response.writableEnded) this.cancel(handle);
    };
    response.once("close", close);
    if (response.destroyed && !response.writableEnded) close();
    return () => response.removeListener("close", close);
  }
  get size() {
    return this.#sessions.size;
  }
}
