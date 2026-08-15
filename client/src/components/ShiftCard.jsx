import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon, SpecialtyIcon, ChefIcon, WaiterIcon } from '../icons';
import { Card, Pill, fmtMoney, fmtDate, clockFromMin, urgencyTone } from '../ui';

export default function ShiftCard({ shift, right, onOpen }) {
  const nav = useNavigate();
  const tone = urgencyTone(shift);
  const RoleIcon = shift.role === 'chef' ? ChefIcon : WaiterIcon;
  const open = onOpen || (() => nav(`/app/shifts/${shift.id}`));

  return (
    <Card className="shift-card" onClick={open}>
      <div className="shift-head">
        <span className="shift-rolebox">
          {shift.specialty ? <SpecialtyIcon name={shift.specialty} size={24} /> : <RoleIcon size={26} />}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="shift-title">
            {shift.specialty ? shift.specialty : shift.role === 'chef' ? 'Chef' : 'Waiter'} needed
          </div>
          <div className="shift-loc">
            <Icon name="Pin" size={14} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shift.locationName}</span>
          </div>
        </div>
        {shift.status === 'open' && (
          <Pill tone={tone}>
            {tone === 'green' ? <><Icon name="Check" size={13} /> well timed</> : tone === 'amber' ? <><Icon name="Clock" size={13} /> expiring</> : 'closing'}
          </Pill>
        )}
      </div>

      <div className="shift-meta">
        <span className="meta-chip">
          <Icon name="Cal" size={15} />
          {fmtDate(shift.date)}
        </span>
        <span className="meta-chip">
          <Icon name="Clock" size={15} />
          {clockFromMin(shift.startMin)}–{clockFromMin(shift.endMin)}
        </span>
        <span className="meta-chip">
          <Icon name="Rupee" size={15} className="pay" />
          {fmtMoney(shift.payMin)}–{fmtMoney(shift.payMax)}
        </span>
        {shift.status === 'matched' && shift.agreedPay != null ? (
          <span className="meta-chip">
            <Icon name="Check" size={15} />
            Agreed {fmtMoney(shift.agreedPay)}
          </span>
        ) : null}
      </div>

      <div className="shift-foot">
        <span className="shift-price">
          {fmtMoney(shift.payMin)}–{fmtMoney(shift.payMax)}
          <small> per shift</small>
        </span>
        {right ? right : <span className="pill pill-neutral"><Icon name="Arrow" size={13} /> Open</span>}
      </div>
    </Card>
  );
}