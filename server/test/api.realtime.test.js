import {
  test, assert, api, start, stop, uniquePhone, uniqueEmail, signupAndVerify, futureDate,
} from './helpers.js';
import { publish, EVENT, listenerCount } from '../src/events.js';
import { touchPresence, clearPresence, getPresence, sweepPresence } from '../src/presence.js';
import { db } from '../src/db.js';

let base;
test.before(async () => { base = await start(); });
test.after(async () => stop());

async function makeChef(name = 'RT Chef') {
  return signupAndVerify({
    role: 'chef', name, phone: uniquePhone(), email: uniqueEmail('rtchef'),
    specialties: ['Tandoor'], yearsExperience: 2,
  });
}
async function makeManager(name = 'RT Mgr') {
  return signupAndVerify({
    role: 'manager', name, phone: uniquePhone(), email: uniqueEmail('rtmgr'),
    businessName: 'RT Bistro', businessType: 'restaurant', businessAddress: 'Andheri',
  });
}

/**
 * Open an SSE stream and collect frames until `want` of them arrive.
 * Returns { events, close } so a test can assert and then tear down.
 */
async function openStream(token, want = 1, timeoutMs = 6000) {
  const controller = new AbortController();
  const res = await fetch(`${base}/api/events`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: controller.signal,
  });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') || '', /text\/event-stream/);

  const events = [];
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const done = (async () => {
    const deadline = Date.now() + timeoutMs;
    while (events.length < want && Date.now() < deadline) {
      const { value, done: finished } = await reader.read();
      if (finished) break;
      buffer += decoder.decode(value, { stream: true });
      let i;
      while ((i = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, i);
        buffer = buffer.slice(i + 2);
        let name = 'message';
        const data = [];
        for (const line of frame.split('\n')) {
          if (line.startsWith('event:')) name = line.slice(6).trim();
          else if (line.startsWith('data:')) data.push(line.slice(5).trim());
        }
        if (data.length) {
          try { events.push({ event: name, data: JSON.parse(data.join('\n')) }); } catch { /* ignore */ }
        }
      }
    }
  })();

  return {
    events,
    settled: done,
    close: () => { try { controller.abort(); } catch { /* already closed */ } },
  };
}

test('the event stream requires authentication', async () => {
  const res = await fetch(`${base}/api/events`);
  assert.equal(res.status, 401);
});

test('a stream opens and immediately announces itself', async () => {
  const chef = await makeChef();
  const s = await openStream(chef.accessToken, 1);
  await s.settled;
  s.close();

  assert.equal(s.events[0].event, 'ready');
  assert.ok(s.events[0].data.userId);
});

test('a chat message reaches the recipient over SSE', async () => {
  const mgr = await makeManager();
  const chef = await makeChef();

  const posted = await api('/api/shifts', {
    method: 'POST', token: mgr.accessToken,
    body: {
      role: 'chef', specialty: 'Tandoor', date: futureDate(2), startMin: 600, endMin: 900,
      locationName: 'RT Bistro', lat: 19.1, lng: 72.8, payMin: 900, payMax: 900,
    },
  });
  const shiftId = posted.body.shift.id;
  await api(`/api/shifts/${shiftId}/respond`, {
    method: 'POST', token: chef.accessToken, body: { kind: 'accept' },
  });
  const detail = await api(`/api/shifts/${shiftId}`, { token: mgr.accessToken });
  await api(`/api/shifts/${shiftId}/accept`, {
    method: 'POST', token: mgr.accessToken, body: { responseId: detail.body.responses[0].id },
  });

  const conv = await api(`/api/chat/shift/${shiftId}`, { method: 'POST', token: mgr.accessToken });

  // Chef listens; manager sends.
  const s = await openStream(chef.accessToken, 2);
  await new Promise((r) => setTimeout(r, 150));
  await api(`/api/chat/${conv.body.id}/messages`, {
    method: 'POST', token: mgr.accessToken, body: { body: 'Use the staff entrance.' },
  });
  await s.settled;
  s.close();

  const msg = s.events.find((e) => e.event === 'chat.message');
  assert.ok(msg, `expected a chat.message event, got ${s.events.map((e) => e.event).join(', ')}`);
  assert.equal(msg.data.conversationId, conv.body.id);
  assert.equal(msg.data.body, 'Use the staff entrance.');
});

test('events are only delivered to their audience', async () => {
  const outsider = await makeChef('RT Outsider');
  const s = await openStream(outsider.accessToken, 2, 1500);

  // Addressed to somebody else entirely.
  publish(EVENT.CHAT_MESSAGE, ['usr_not_this_person'], { conversationId: 'conv_x' });
  await s.settled;
  s.close();

  const leaked = s.events.filter((e) => e.event !== 'ready');
  assert.equal(leaked.length, 0, `event leaked to a non-audience listener: ${JSON.stringify(leaked)}`);
});

test('publish with an empty audience reaches nobody', async () => {
  const before = listenerCount();
  publish(EVENT.NOTIFICATION, [], { hello: true });
  publish(EVENT.NOTIFICATION, null, { hello: true });
  assert.equal(listenerCount(), before, 'publish must not alter listeners');
});

test('closing the stream removes its listener', async () => {
  const chef = await makeChef('RT Leak');
  const before = listenerCount();
  const s = await openStream(chef.accessToken, 1);
  await s.settled;
  assert.equal(listenerCount(), before + 1, 'stream should add exactly one listener');
  s.close();
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(listenerCount(), before, 'listener must be released on disconnect');
});

/* ------------------------------- presence ------------------------------- */

test('presence goes online and back to offline', async () => {
  const chef = await makeChef('RT Presence');
  const id = chef.user.id;

  await touchPresence(id);
  let [p] = await getPresence([id]);
  assert.equal(p.status, 'online');

  await clearPresence(id);
  [p] = await getPresence([id]);
  assert.equal(p.status, 'offline');
});

test('an expired heartbeat reads as offline even though the row says online', async () => {
  const chef = await makeChef('RT Stale');
  const id = chef.user.id;
  await touchPresence(id);

  // Simulate a browser that vanished without saying goodbye.
  await db.run(
    `UPDATE user_presence SET expires_at = $1 WHERE user_id = $2`,
    new Date(Date.now() - 60_000).toISOString(), id
  );

  const row = await db.get(`SELECT status FROM user_presence WHERE user_id = $1`, id);
  assert.equal(row.status, 'online', 'the stored status is deliberately still online');

  const [p] = await getPresence([id]);
  assert.equal(p.status, 'offline', 'but an expired heartbeat must read as offline');

  await sweepPresence();
  const swept = await db.get(`SELECT status FROM user_presence WHERE user_id = $1`, id);
  assert.equal(swept.status, 'offline', 'the sweep settles the row itself');
});

test('a user who never connected reads as offline rather than missing', async () => {
  const chef = await makeChef('RT Never');
  const [p] = await getPresence([chef.user.id]);
  assert.equal(p.status, 'offline');
  assert.equal(p.userId, chef.user.id);
});

test('presence cannot be claimed on a shift you are not part of', async () => {
  const mgr = await makeManager();
  const outsider = await makeChef('RT Nosy');

  const posted = await api('/api/shifts', {
    method: 'POST', token: mgr.accessToken,
    body: {
      role: 'chef', specialty: 'Tandoor', date: futureDate(2), startMin: 600, endMin: 900,
      locationName: 'RT Bistro', lat: 19.1, lng: 72.8, payMin: 900, payMax: 900,
    },
  });

  const r = await api('/api/presence', {
    method: 'POST', token: outsider.accessToken,
    body: { status: 'online', shiftId: posted.body.shift.id },
  });
  assert.equal(r.status, 403);
});

test('an unknown presence status is rejected', async () => {
  const chef = await makeChef('RT Bad');
  const r = await api('/api/presence', {
    method: 'POST', token: chef.accessToken, body: { status: 'invisible' },
  });
  assert.equal(r.status, 400);
});
