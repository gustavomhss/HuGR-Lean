import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type AddressInfo, type Socket } from "node:net";

const timer = globalThis.setTimeout;
export async function bounded<T>(promise: Promise<T>, name: string): Promise<T> {
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      deadline = timer(() => reject(new Error(name)), 8000);
    })]);
  } finally { clearTimeout(deadline); }
}

// owned-process.mjs registers this named callback only after authenticated native spawn.
export function nativeDeadline() {
  const original = globalThis.setTimeout, handles: ReturnType<typeof setTimeout>[] = [];
  let callback: (() => void) | undefined, count = 0, fired = false, milliseconds = 0;
  let armed!: () => void;
  const registered = new Promise<void>(resolve => { armed = resolve; });
  globalThis.setTimeout = ((fn: (...args: any[]) => void, ms?: number, ...args: any[]) => {
    if (fn.name !== "beginTimeout") return original(fn, ms, ...args);
    count++; milliseconds = ms!; callback = () => fn(...args); armed();
    const handle = original(() => {}, 30000); handles.push(handle); return handle;
  }) as typeof setTimeout;
  return {
    get count() { return count; }, get milliseconds() { return milliseconds; },
    async fire() {
      await bounded(registered, "NATIVE_TIMEOUT_REGISTRATION_MISSING");
      assert.equal(count, 1, "NATIVE_TIMEOUT_SEAM_COUNT"); assert.equal(fired, false);
      fired = true; callback!();
    },
    restore(cleanup = false) {
      globalThis.setTimeout = original; handles.forEach(clearTimeout);
      if (cleanup && !fired) { fired = true; callback?.(); }
    },
  };
}

// One authenticated, newline-framed live peer. Socket closes only on fixture exit.
export async function ownershipChannel() {
  const token = randomUUID(), server = createServer(), failures: unknown[] = [];
  let socket: Socket | undefined, pending = "", sequence = 0, stopped = false, stopAcknowledged = false;
  let ready!: () => void, closed!: () => void, reply: (() => void) | undefined;
  const readiness = new Promise<void>(resolve => { ready = resolve; });
  const closure = new Promise<void>(resolve => { closed = resolve; });
  server.on("error", error => failures.push(error));
  server.on("connection", peer => {
    if (socket) { failures.push(new Error("DUPLICATE_FIXTURE_PEER")); peer.destroy(); return; }
    socket = peer; peer.on("error", error => failures.push(error));
    peer.once("close", closed);
    peer.on("data", chunk => {
      pending += chunk.toString(); let end;
      while ((end = pending.indexOf("\n")) !== -1) {
        const frame = pending.slice(0, end); pending = pending.slice(end + 1);
        if (frame === `${token}:ready`) ready();
        else if (frame === `${token}:pong:${sequence}`) reply?.();
        else if (frame === `${token}:stopping` && stopped) stopAcknowledged = true;
        else failures.push(new Error(`UNEXPECTED_FIXTURE_FRAME: ${frame}`));
      }
    });
  });
  await bounded(new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve)), "FIXTURE_LISTEN_TIMEOUT");
  const source = `
const ownership=require('node:net').connect(${(server.address() as AddressInfo).port},'127.0.0.1');
const token=${JSON.stringify(token)}; let frames='';
setTimeout(()=>{ownership.write(token+':fallback\\n');setTimeout(()=>process.exit(91),1000)},15000).unref();
ownership.on('error',error=>{console.error(error);process.exit(92)});
ownership.on('end',()=>process.exit(93));
ownership.on('connect',()=>ownership.write(token+':ready\\n'));
ownership.on('data',chunk=>{frames+=chunk;let end;while((end=frames.indexOf('\\n'))!==-1){
 const frame=frames.slice(0,end);frames=frames.slice(end+1);
 if(frame==='stop')ownership.write(token+':stopping\\n',()=>process.exit(0));
 else if(frame.startsWith('ping:'))ownership.write(token+':pong:'+frame.slice(5)+'\\n');
 else {console.error('BAD_FIXTURE_COMMAND');process.exit(94)}
}});
`;
  return { source,
    async ping() {
      await bounded(readiness, "FIXTURE_READINESS_MISSING");
      assert.ok(socket && !socket.destroyed, "FIXTURE_PEER_NOT_LIVE"); sequence++;
      const response = new Promise<void>(resolve => { reply = resolve; socket!.write(`ping:${sequence}\n`); });
      await bounded(Promise.race([response, closure.then(() => { throw new Error("FIXTURE_PEER_CLOSED_DURING_PROBE"); })]), "FIXTURE_PROBE_MISSING");
      assert.deepEqual(failures, [], "FIXTURE_CHANNEL_FAILURES");
    },
    async closed() { await bounded(closure, "OWNED_DESCENDANT_SURVIVED_SETTLEMENT"); assert.deepEqual(failures, []); },
    async stop() {
      if (stopped) return; stopped = true;
      try {
        if (!socket) await bounded(readiness, "FIXTURE_TEARDOWN_READINESS_MISSING");
        const live = !socket!.destroyed;
        if (live) socket!.write("stop\n");
        await bounded(closure, "LIVE_CHANNEL_TEARDOWN_FAILED"); assert.deepEqual(failures, []);
        if (live) assert.equal(stopAcknowledged, true, "FIXTURE_STOP_ACK_MISSING");
      } finally { socket?.destroy(); await new Promise<void>(resolve => server.close(() => resolve())); }
    },
  };
}
