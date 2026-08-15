import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../state';
import { api } from '../api';
import {
  Card, Button, Pill, Banner, Icon, fmtMoney, fmtDate, clockFromMin, timeLeft, useNow, toast,
  RatingInput, Avatar, TextArea, Stepper,
} from '../ui';
import { SpecialtyIcon, ChefIcon, WaiterIcon } from '../icons';

export default function ShiftDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [counter, setCounter] = useState(false);
  const [amount, setAmount] = useState(0);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  useNow(30000);

  const load = useCallback(async () => {
    try {
      const d = await api(`/api/shifts/${id}`);
      setData(d);
      if (!counter) setAmount(d.shift.payMax);
    } catch (ex) {
      setErr(ex.message);
    }
  }, [id]);

  useEffect(() => { load(); }, [load, counter]);

  if (err) {
    return <Card className="mt8"><Banner tone="danger">{err}</Banner></Card>;
  }
  if (!data) {
    return <div className="mt8"><div className="skeleton" style={{ height: 220 }} /></div>;
  }

  const { shift, responses, myResponse, feeRecord, ratings, ratedByMe } = data;
  const isManager = user.role === 'manager';
  const isMatched = shift.status === 'matched';

  const respond = async (kind) => {
    setBusy(true);
    try {
      await api(`/api/shifts/${shift.id}/respond`, {
        method: 'POST',
        body: JSON.stringify(kind === 'counter' ? { kind, amount } : { kind }),
      });
      toast(kind === 'accept' ? 'You accepted. The manager will confirm.' : 'Counter-offer sent to the manager.', 'green');
      setCounter(false);
      load();
    } catch (ex) {
      toast(ex.message, 'red');
    } finally {
      setBusy(false);
    }
  };

  const acceptWorker = async (responseId) => {
    setBusy(true);
    try {
      await api(`/api/shifts/${shift.id}/accept`, { method: 'POST', body: JSON.stringify({ responseId }) });
      toast('Shift locked in. Both sides now have each other\u2019s contact.', 'green');
      load();
    } catch (ex) {
      toast(ex.message, 'red');
    } finally {
      setBusy(false);
    }
  };

  const rate = async () => {
    if (!stars) { toast('Pick a star rating first.', 'red'); return; }
    setBusy(true);
    try {
      const toUserId = isManager ? shift.worker.id : shift.manager.id;
      await api(`/api/shifts/${shift.id}/rate`, { method: 'POST', body: JSON.stringify({ stars, comment, toUserId }) });
      toast('Thanks — your rating is saved.', 'green');
      load();
    } catch (ex) {
      toast(ex.message, 'red');
    } finally {
      setBusy(false);
    }
  };

  const RoleIcon = shift.role === 'chef' ? ChefIcon : WaiterIcon;

  return (
    <>
      <div className={`detail-hero ${isMatched ? 'detail-hero-ink' : 'detail-hero-accent'}`}>
        <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div className="detail-role">
            <RoleIcon size={26} />
            <span>{shift.specialty || (shift.role === 'chef' ? 'Chef' : 'Waiter')}</span>
          </div>
          {shift.status === 'open' ? <Pill tone={urgencyToneLocal(shift)} /> : null}
        </div>
        <div className="detail-price">
          ₹{fmtMoney(shift.payMin)}–{fmtMoney(shift.payMax)} <small>{shift.status === 'matched' && shift.agreedPay != null ? `· agreed ₹${fmtMoney(shift.agreedPay)}` : 'per shift'}</small>
        </div>
        <div className="detail-facts">
          <div className="fact"><b>{fmtDate(shift.date)}</b><span>Date</span></div>
          <div className="fact"><b>{clockFromMin(shift.startMin)}–{clockFromMin(shift.endMin)}</b><span>Shift time</span></div>
          <div className="fact"><b>{shift.locationName}</b><span>Where</span></div>
          {shift.dressCode ? <div className="fact"><b>{shift.dressCode}</b><span>Dress code</span></div> : null}
        </div>
      </div>

      {shift.notes ? <Card className="mt16"><p className="small" style={{ lineHeight: 1.6 }}>{shift.notes}</p></Card> : null}

      {/* Offer responses — manager view */}
      {isManager && shift.status === 'open' ? (
        <div className="mt16">
          <p className="section-title">Responses ({responses.length})</p>
          {responses.length === 0 ? (
            <EmptyPlate text="No responses yet. You can see live ones here as they come in." />
          ) : (
            <div className="stack">
              {responses.map((r) => (
                <Card key={r.id} className={`offer-card ${r.kind === 'accept' ? 'offer-accept' : 'offer-counter'}`}>
                  <div className="flex" style={{ alignItems: 'center' }}>
                    <Avatar name={r.worker?.name} size={44} role={r.worker?.role} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800 }}>{r.worker?.name}</div>
                      <div className="small muted">
                        {r.worker?.rating?.count ? `★ ${r.worker.rating.avg.toFixed(1)} (${r.worker.rating.count} ratings)` : 'New — no ratings yet'}
                      </div>
                    </div>
                    <div className="offer-amount">₹{fmtMoney(r.amount)}</div>
                  </div>
                  <div className="offer-spacer" />
                  <div className="mt12">
                    <span className={`offer-kind ${r.kind}`}>{r.kind === 'accept' ? 'Accepted at range' : 'Counter-offer'}</span>
                    <div className="space-8" />
                    <Button size="md" full className={r.kind === 'accept' ? 'btn-green' : 'btn-primary'} onClick={() => acceptWorker(r.id)} disabled={busy}>
                      <Icon name="CheckBig" size={18} /> Lock this in
                    </Button>
                  </div>
                </Card>
              ))}
              <FeeNote agreed={shift.payMax} feeRate={data.feerate} label="When you lock someone in" />
            </div>
          )}
        </div>
      ) : null}

      {/* Worker respond view */}
      {!isManager && shift.status === 'open' && !myResponse ? (
        <div className="mt16">
          <div className="stack">
            <Cards>
              <div className="flex" style={{ alignItems: 'center' }}>
                <Avatar name={shift.manager?.name} size={44} role="manager" />
                <div>
                  <div style={{ fontWeight: 800 }}>{shift.manager?.business || shift.manager?.name}</div>
                  <div className="small muted">{shift.locationName}</div>
                </div>
              </div>
            </Cards>
            <Button variant="green" size="lg" full onClick={() => respond('accept')} disabled={busy}>
              <Icon name="CheckBig" size={20} /> Accept at ₹{fmtMoney(shift.payMax)}
            </Button>
            {!counter ? (
              <Button variant="ghost" size="lg" full onClick={() => setCounter(true)}>
                <Icon name="Hand" size={20} /> I\u2019d like a different price
              </Button>
            ) : (
              <Card>
                <p className="section-title" style={{ marginTop: 0 }}>Your counter-offer</p>
                <Stepper label="My price" value={amount} min={Math.round(shift.payMin * 0.7)} max={Math.round(shift.payMax * 1.3)} step={10} unit="/shift" onChange={setAmount} />
                <div className="space-8" />
                <p className="small muted">Keep it close to the advertised range — offers far off are declined.</p>
                <div className="space-12" />
                <div className="flex">
                  <Button variant="green" size="md" full onClick={() => respond('counter')} disabled={busy}><Icon name="Hand" size={18} /> Send ₹{fmtMoney(amount)}</Button>
                  <Button variant="ghost" size="md" onClick={() => setCounter(false)}>Cancel</Button>
                </div>
              </Card>
            )}
            <Banner tone="info"><Icon name="Info" size={16} /> This request closes {timeLeft(shift.remainingMs)} from now if no one is picked.</Banner>
          </div>
        </div>
      ) : null}

      {/* Worker pending response */}
      {!isManager && shift.status === 'open' && myResponse ? (
        <Cards className="mt16">
          <Pill tone="amber"><Icon name="Clock" size={13} /> Your {myResponse.kind === 'counter' ? 'counter-offer of ₹' + fmtMoney(myResponse.amount) : 'accept'} is with the manager</Pill>
          <p className="small muted mt8">If the manager picks you, you\u2019ll both see each other\u2019s contact right away. This closes {timeLeft(shift.remainingMs)} from now.</p>
        </Cards>
      ) : null}

      {/* Confirmation card when matched */}
      {isMatched ? (
        <>
          <div className="confirm-card card mt16">
            <div className="flex">
              <Icon name="Match" size={28} />
              <div>
                <div className="row-title" style={{ fontWeight: 800 }}>Shift locked in</div>
                <div className="small muted">This shift is confirmed and your contact is shared with the other side.</div>
              </div>
            </div>

            <div className="detail-facts" style={{ marginTop: 14 }}>
              {isManager ? (
                <div className="fact-host">
                  <div className="small muted">Your worker</div>
                  <b>{shift.worker?.name}</b>
                  <div className="small" style={{ fontWeight: 700 }}>Call or WhatsApp: {shift.worker?.phone}</div>
                </div>
              ) : (
                <div className="fact-host">
                  <div className="small muted">Your venue</div>
                  <b>{shift.manager?.business || shift.manager?.name}</b>
                  <div className="small" style={{ fontWeight: 700 }}>{shift.manager?.address}</div>
                  <div className="small" style={{ fontWeight: 700 }}>Call or WhatsApp: {shift.manager?.phone}</div>
                </div>
              )}
            </div>

            {feeRecord ? (
              <div className="fee-note mt12">
                <b>Pay split</b> — shift agreed at <b>₹{fmtMoney(feeRecord.agreed_pay)}</b>.<br />
                Manager pays <b>₹{fmtMoney(feeRecord.agreed_pay)}</b>. Worker receives <b>₹{fmtMoney(feeRecord.worker_payout)}</b>. O.D.C service fee: <b>₹{fmtMoney(feeRecord.fee_amount)}</b> ({Math.round(feeRecord.fee_rate * 100)}%).
              </div>
            ) : null}

            {/* Rating */}
            <div className="mt16">
              {ratedByMe ? (
                <p className="small muted">You rated this shift. Thanks.</p>
              ) : (
                <>
                  <p className="section-title" style={{ marginTop: 0 }}>Rate {isManager ? shift.worker?.name : shift.manager?.name}</p>
                  <RatingInput value={stars} onChange={setStars} />
                  <div className="space-12" />
                  <TextArea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="How did it go? (optional)" rows={2} />
                  <div className="space-8" />
                  <Button size="md" full onClick={rate} disabled={busy || !stars}><Icon name="Star" size={18} /> Submit rating</Button>
                </>
              )}
            </div>
          </div>
        </>
      ) : null}

      {shift.status === 'expired' ? (
        <Cards className="mt16">
          <Pill tone="neutral"><Icon name="Ban" size={13} /> This shift closed without a match</Pill>
          <p className="small muted mt8">It was open for 12 hours. {isManager ? 'You can post it again.' : 'New ones show up in Open Shifts.'}</p>
          <div className="space-12" />
          <Button variant="ghost" size="md" onClick={() => nav(isManager ? '/app/post' : '/app/browse')}>
            {isManager ? 'Post another shift' : 'See open shifts'}
          </Button>
        </Cards>
      ) : null}
    </>
  );
}

function urgencyToneLocal(shift) {
  const ms = shift.remainingMs;
  if (ms > 2 * 3600000) return 'green';
  if (ms > 0) return 'amber';
  return 'red';
}

function Cards({ children, className = '' }) {
  return <Card className={className}>{children}</Card>;
}

function EmptyPlate({ text }) {
  return <Card className="text-center muted small" style={{ padding: 24 }}>{text}</Card>;
}

function FeeNote({ agreed, feeRate, label }) {
  const fee = Math.round(agreed * feeRate * 100) / 100;
  return (
    <div className="fee-note">
      <b>{label}.</b> Shift at ₹{fmtMoney(agreed)} → worker receives <b>₹{fmtMoney(agreed - fee)}</b> · O.D.C service fee <b>₹{fmtMoney(fee)}</b> ({Math.round(feeRate * 100)}%).
    </div>
  );
}