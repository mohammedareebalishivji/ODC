import { Router } from 'express';
import { db } from '../db.js';
import { authGuard, asyncH } from '../middleware.js';
import { uid, nowIso, apiError } from '../config.js';
import { notifyUser } from '../notify.js';

const router = Router();
const clean = (v, max = 2000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

async function assertMember(conversationId, userId) {
  const row = await db.get(
    `SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`,
    conversationId, userId
  );
  if (!row) throw apiError('You are not part of this conversation.', 403);
}

/** Conversation list with last message and unread count, newest activity first. */
router.get(
  '/',
  authGuard(),
  asyncH(async (req, res) => {
    // LATERAL rather than scalar subqueries: the newest message is needed both
    // in the payload and in the sort, and Postgres will not accept a SELECT
    // alias inside an ORDER BY expression.
    const rows = await db.all(
      `SELECT c.*,
              cm.last_read_at,
              last.body       AS last_body,
              last.created_at AS last_at,
              (SELECT COUNT(*)::int FROM messages m
                WHERE m.conversation_id = c.id
                  AND m.sender_id <> $1
                  AND (cm.last_read_at IS NULL OR m.created_at > cm.last_read_at)) AS unread
         FROM conversations c
         JOIN conversation_members cm ON cm.conversation_id = c.id
         LEFT JOIN LATERAL (
           SELECT m.body, m.created_at
             FROM messages m
            WHERE m.conversation_id = c.id
            ORDER BY m.created_at DESC
            LIMIT 1
         ) last ON TRUE
        WHERE cm.user_id = $1
        ORDER BY COALESCE(last.created_at, c.created_at) DESC
        LIMIT 100`,
      req.user.id
    );
    res.json({
      conversations: rows.map((c) => ({
        id: c.id,
        shiftId: c.shift_id,
        topic: c.topic,
        lastMessage: c.last_body,
        lastAt: c.last_at,
        unread: c.unread ?? 0,
      })),
    });
  })
);

/** Open (or reuse) the conversation attached to a shift. */
router.post(
  '/shift/:shiftId',
  authGuard(),
  asyncH(async (req, res) => {
    const shift = await db.get(`SELECT * FROM shifts WHERE id = $1`, req.params.shiftId);
    if (!shift) throw apiError('Shift not found.', 404);

    const isParty =
      shift.manager_id === req.user.id || shift.matched_worker_id === req.user.id;
    if (!isParty) throw apiError('You are not part of this shift.', 403);
    if (!shift.matched_worker_id) {
      throw apiError('Chat opens once a worker is confirmed for the shift.');
    }

    let conv = await db.get(`SELECT * FROM conversations WHERE shift_id = $1`, shift.id);
    if (!conv) {
      const id = uid('conv');
      const ts = nowIso();
      await db.transaction(async (client) => {
        await client.query(
          `INSERT INTO conversations (id, shift_id, topic, created_at) VALUES ($1,$2,$3,$4)`,
          [id, shift.id, shift.location_name, ts]
        );
        for (const member of [shift.manager_id, shift.matched_worker_id]) {
          await client.query(
            `INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1,$2)
             ON CONFLICT DO NOTHING`,
            [id, member]
          );
        }
      });
      conv = await db.get(`SELECT * FROM conversations WHERE id = $1`, id);
    }
    res.json({ id: conv.id, shiftId: conv.shift_id, topic: conv.topic });
  })
);

router.get(
  '/:id/messages',
  authGuard(),
  asyncH(async (req, res) => {
    await assertMember(req.params.id, req.user.id);
    const limit = Math.min(Number(req.query.limit) || 100, 300);
    const rows = await db.all(
      `SELECT m.*, u.name AS sender_name, u.role AS sender_role
         FROM messages m JOIN users u ON u.id = m.sender_id
        WHERE m.conversation_id = $1
        ORDER BY m.created_at DESC LIMIT $2`,
      req.params.id, limit
    );
    // Mark read up to now for this viewer.
    await db.run(
      `UPDATE conversation_members SET last_read_at = $1
        WHERE conversation_id = $2 AND user_id = $3`,
      nowIso(), req.params.id, req.user.id
    );
    res.json({
      messages: rows.reverse().map((m) => ({
        id: m.id,
        body: m.body,
        senderId: m.sender_id,
        senderName: m.sender_name,
        senderRole: m.sender_role,
        mine: m.sender_id === req.user.id,
        createdAt: m.created_at,
      })),
    });
  })
);

router.post(
  '/:id/messages',
  authGuard(),
  asyncH(async (req, res) => {
    await assertMember(req.params.id, req.user.id);
    const body = clean(req.body.body, 2000);
    if (!body) throw apiError('Write a message first.');

    const id = uid('msg');
    const ts = nowIso();
    await db.run(
      `INSERT INTO messages (id, conversation_id, sender_id, body, created_at)
       VALUES ($1,$2,$3,$4,$5)`,
      id, req.params.id, req.user.id, body, ts
    );

    // Ping everyone else in the thread.
    const others = await db.all(
      `SELECT user_id FROM conversation_members
        WHERE conversation_id = $1 AND user_id <> $2`,
      req.params.id, req.user.id
    );
    for (const o of others) {
      await notifyUser(o.user_id, req.user.name, body.slice(0, 120), 'chat', {
        conversationId: req.params.id,
      });
    }

    res.status(201).json({
      id, body, senderId: req.user.id, senderName: req.user.name, mine: true, createdAt: ts,
    });
  })
);

export default router;
