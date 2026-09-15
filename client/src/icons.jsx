

function Svg({ size = 24, children, viewBox = '0 0 24 24', className = '', alt = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={alt ? undefined : 'true'}
      role={alt ? 'img' : undefined}
    >
      {alt ? <title>{alt}</title> : null}
      {children}
    </svg>
  );
}

const sw = { stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };

export const ChefIcon = ({ size = 32, className }) => (
  <Svg size={size} viewBox="0 0 64 64" className={className}>
    <g stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <circle cx="22" cy="26" r="7" />
      <circle cx="32" cy="20" r="9" />
      <circle cx="42" cy="26" r="7" />
      <path d="M12 34h40v10a8 8 0 0 1-8 8H20a8 8 0 0 1-8-8V34z" />
      <path d="M17 52v4m10-4v4M26 44h20" />
    </g>
  </Svg>
);

export const WaiterIcon = ({ size = 32, className }) => (
  <Svg size={size} viewBox="0 0 64 64" className={className}>
    <g stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <rect x="14" y="6" width="36" height="14" rx="7" />
      <path d="M18 38c0 14 28 14 28 0" />
      <path d="M32 30v12m0 0H20m12 0h12M16 40h32" strokeDasharray="0" />
      <path d="M14 46v6m36-6v6" />
      <circle cx="32" cy="16" r="2.2" fill="currentColor" stroke="none" />
    </g>
  </Svg>
);

export const ManagerIcon = ({ size = 32, className }) => (
  <Svg size={size} viewBox="0 0 64 64" className={className}>
    <g stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d="M8 26 32 6l24 20" />
      <rect x="12" y="26" width="40" height="10" rx="3" />
      <path d="M18 30v4m28-4v4" />
      <path d="M16 36v22h32V36M26 42h12v16H26z" />
      <path d="M26 36h12" />
      <circle cx="32" cy="52" r="3" fill="currentColor" stroke="none" />
    </g>
  </Svg>
);

export function SpecialtyIcon({ name, size = 26, className }) {
  const common = { size, className };
  switch (name) {
    case 'Tandoor':
      return (
        <Svg {...common} viewBox="0 0 64 64">
          <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none">
            <path d="M10 42c4-20 14-32 34-34m0 0c-3 8-5 15-5 24 0 14 8 22 10 28" />
            <path d="M22 46c2 6 6 10 12 12M28 52c4 3 8 4 14 4" />
            <path d="M30 36c2 3 4 5 8 6M34 26c3 3 5 5 9 6" />
            <path d="M40 18c2 2 3 4 4 7" />
          </g>
        </Svg>
      );
    case 'Chinese':
      return (
        <Svg {...common} viewBox="0 0 64 64">
          <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none">
            <path d="M16 18c9-6 26-6 34 2-4 8-14 12-24 10" />
            <path d="M16 30h30l-5 20a6 6 0 0 1-6 4H22v2" />
            <path d="M24 28c0-6 4-10 8-10M14 22c3-6 3-12 0-18m5 13c2-5 2-10 0-15M18 55c-3 3-7 3-10 0 3-3 7-3 10 0z" />
          </g>
        </Svg>
      );
    case 'Continental':
      return (
        <Svg {...common} viewBox="0 0 64 64">
          <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none">
            <path d="M32 10c14 0 22 10 20 24-2 12-12 20-20 20S12 46 12 34C10 20 18 10 32 10z" />
            <circle cx="32" cy="34" r="8" />
            <path d="M32 34 22 24m20 12L38 32M14 38h8m0-14h8m16 14h8" />
          </g>
        </Svg>
      );
    case 'Italian':
      return (
        <Svg {...common} viewBox="0 0 64 64">
          <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none">
            <circle cx="32" cy="36" r="20" />
            <path d="M32 16v26m0-8 8-8m-8 8-8 8M32 34l7 7M16 44h6m14 2h10m-28 4h8" />
            <path d="M24 8c2 4 2 8 0 12M34 8c2 4 2 8 0 12" />
          </g>
        </Svg>
      );
    case 'Bakery/Pastry':
      return (
        <Svg {...common} viewBox="0 0 64 64">
          <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none">
            <circle cx="32" cy="38" r="20" />
            <path d="M32 18 26 42l6 6 6-6-6-24z" />
            <path d="M20 40h24m-20 9h16" />
            <path d="M32 18v-6m0 0 5 5m-5-5-5 5" />
          </g>
        </Svg>
      );
    case 'South Indian':
      return (
        <Svg {...common} viewBox="0 0 64 64">
          <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none">
            <path d="M10 40h14l6-22 6 22h14c-1 10-8 16-17 16-7 0-13-4-16-10 0 6-4 10 0 10M32 58v-6M26 22h12m-14 4h16" />
          </g>
        </Svg>
      );
    case 'North Indian':
      return (
        <Svg {...common} viewBox="0 0 64 64">
          <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none">
            <path d="M18 14c14-8 26 6 22 20-4 14-22 16-30 8 14 4 20 0 20-10 0-8-8-12-12-8 4-4 4-10 0-10z" />
            <path d="M22 26c3-4 3-10 1-14m8 20c2-4 2-9 1-13M22 38c4 2 8 2 12 1M18 30c-6 0-8 4-8 8" />
          </g>
        </Svg>
      );
    case 'BBQ/Grill':
      return (
        <Svg {...common} viewBox="0 0 64 64">
          <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none">
            <path d="M14 38h36c-1 12-16 20-36 14" />
            <path d="M14 34h36" />
            <path d="M18 30h28M22 26h20" />
            <path d="M22 20c2-6-2-8-2-14m9 14c2-5-2-7-2-13m9 13c2-5-2-7-2-13M20 40c3 2 5 4 7 8" />
          </g>
        </Svg>
      );
    case 'Multi-cuisine':
      return (
        <Svg {...common} viewBox="0 0 64 64">
          <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none">
            <circle cx="20" cy="20" r="9" />
            <path d="M14 46c0 9 12 9 12 0M20 36v8M14 34h12" />
            <path d="M38 14h18v18H38zM44 14v18" />
            <path d="M48 46h8m-13 12 8-12m-8 0 8 12" />
          </g>
        </Svg>
      );
    default:
      return null;
  }
}

export const SpecialtyList = [
  { name: 'Tandoor', icon: 'Tandoor' },
  { name: 'Chinese', icon: 'Chinese' },
  { name: 'Continental', icon: 'Continental' },
  { name: 'Italian', icon: 'Italian' },
  { name: 'Bakery/Pastry', icon: 'Bakery/Pastry' },
  { name: 'South Indian', icon: 'South Indian' },
  { name: 'North Indian', icon: 'North Indian' },
  { name: 'BBQ/Grill', icon: 'BBQ/Grill' },
  { name: 'Multi-cuisine', icon: 'Multi-cuisine' },
];

export function EmptyShifts({ size = 120, className }) {
  return (
    <Svg size={size} viewBox="0 0 120 90" className={className}>
      <g stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M30 18h60v44a10 10 0 0 1-10 10H40a10 10 0 0 1-10-10V18z" opacity="0.35" />
        <path d="M34 26h52v36a8 8 0 0 1-8 8H42a8 8 0 0 1-8-8V26z" opacity="0.6" />
        <circle cx="52" cy="46" r="5" />
        <circle cx="68" cy="38" r="4" />
        <path d="M60 58c-5 5-9 5-13 0" />
        <path d="M68 70c3 4 8 4 11 0m0 0 12 4" />
      </g>
    </Svg>
  );
}

export function EmptyBell({ size = 96, className }) {
  return (
    <Svg size={size} viewBox="0 0 96 96" className={className}>
      <g stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M48 22a26 26 0 0 0-19 45h38A26 26 0 0 0 48 22z" opacity="0.6" />
        <rect x="27" y="67" width="42" height="6" rx="3" />
        <circle cx="56" cy="15" r="3" fill="currentColor" stroke="none" opacity="0.8" />
        <path d="M58 9c2 2 2 4 1 6" />
        <circle cx="76" cy="30" r="5" fill="currentColor" stroke="none" opacity="0.5" />
      </g>
    </Svg>
  );
}

const I = {
  Bell: (p) => <Svg {...p}><path d="M18 8a6 6 0 0 0-6 6v3l-2 4h16l-2-4v-3a6 6 0 0 0-6-6z" {...sw} /><path d="M13.5 21a2.5 2.5 0 0 0 5 0" {...sw} /></Svg>,
  Clock: (p) => <Svg {...p}><circle cx="12" cy="12" r="9" {...sw} /><path d="M12 7v5l3.5 2" {...sw} /></Svg>,
  Star: (p) => <Svg {...p}><path d="m12 3 2.7 5.6 6.1.8-4.5 4.3 1.1 6-5.4-2.9L6.6 19.7l1.1-6L3.2 9.4l6.1-.8L12 3z" {...sw} strokeLinejoin="round" /></Svg>,
  Pin: (p) => <Svg {...p}><path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z" {...sw} /><circle cx="12" cy="10" r="2.6" {...sw} /></Svg>,
  Rupee: (p) => <Svg {...p}><path d="M7 5h10M7 9h10M7 5c6 0 8 2 8 4 0 3-2 4-8 4" {...sw} /><path d="M12 13 7 19" {...sw} /></Svg>,
  Check: (p) => <Svg {...p}><path d="m5 12.5 4.5 4.5L19 7.5" {...sw} /></Svg>,
  CheckBig: (p) => <Svg {...p}><path d="M20 6 9 17l-5-5" {...sw} strokeWidth={2.4} /></Svg>,
  X: (p) => <Svg {...p}><path d="m6 6 12 12M18 6 6 18" {...sw} /></Svg>,
  Alert: (p) => <Svg {...p}><path d="M12 4 2.5 20h19L12 4z" {...sw} /><path d="M12 10v4.5" {...sw} /><circle cx="12" cy="17.4" r="0.9" fill="currentColor" /></Svg>,
  Camera: (p) => <Svg {...p}><rect x="3" y="7" width="18" height="13" rx="3" {...sw} /><circle cx="12" cy="13" r="3.4" {...sw} /><path d="M8 7l1.5-2.5h5L16 7" {...sw} /></Svg>,
  Phone: (p) => <Svg {...p}><path d="M5 4h4l1.5 4.5-2.2 1.6a12 12 0 0 0 5.6 5.6l1.6-2.2L20 15v4a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z" {...sw} /></Svg>,
  Lock: (p) => <Svg {...p}><rect x="5" y="11" width="14" height="9" rx="2.5" {...sw} /><path d="M8 11V8a4 4 0 0 1 8 0v3" {...sw} /></Svg>,
  User: (p) => <Svg {...p}><circle cx="12" cy="8" r="4" {...sw} /><path d="M4.5 20c1.5-3.5 4.5-5 7.5-5s6 1.5 7.5 5" {...sw} /></Svg>,
  Cal: (p) => <Svg {...p}><rect x="3" y="5" width="18" height="16" rx="3" {...sw} /><path d="M8 3v4m8-4v4M3 10h18" {...sw} /></Svg>,
  Shield: (p) => <Svg {...p}><path d="M12 3l8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3z" {...sw} /><path d="m9 12 2 2 4-4" {...sw} /></Svg>,
  Bolt: (p) => <Svg {...p}><path d="M13 3 5 13.5h5L10 21l8-10.5h-5L13 3z" {...sw} strokeLinejoin="round" /></Svg>,
  Home: (p) => <Svg {...p}><path d="m3 11 9-7 9 7" {...sw} /><path d="M5 10v10h5v-6h4v6h5V10" {...sw} /></Svg>,
  Plasma: (p) => <Svg {...p}><path d="M4 12h13m0 0-4-4m4 4-4 4" {...sw} /><path d="M13 5h7m-7 14h7" {...sw} /></Svg>,
  Wallet: (p) => <Svg {...p}><rect x="3" y="6" width="18" height="13" rx="3" {...sw} /><path d="M15 12h6m-9 3h1.5" {...sw} /></Svg>,
  Chat: (p) => <Svg {...p}><path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-5A8 8 0 1 1 21 12z" {...sw} /><path d="M8.5 10h7m-7 4h4" {...sw} /></Svg>,
  Chevron: (p) => <Svg {...p}><path d="m9 6 6 6-6 6" {...sw} /></Svg>,
  Arrow: (p) => <Svg {...p}><path d="M4 12h16m0 0-6-6m6 6-6 6" {...sw} /></Svg>,
  Info: (p) => <Svg {...p}><circle cx="12" cy="12" r="9" {...sw} /><path d="M12 11v6m0-9.5h.01" {...sw} strokeWidth={2.4} /></Svg>,
  Match: (p) => <Svg {...p}><circle cx="8" cy="9" r="3.4" {...sw} /><circle cx="16.5" cy="9.2" r="2.4" {...sw} /><path d="M3.5 19c1-3 2.8-4.5 4.5-4.5S12 16 13 19" {...sw} /><path d="M12.5 14.8c2.4-.4 4 1 5 3.2" {...sw} /></Svg>,
  Eye: (p) => <Svg {...p}><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z" {...sw} /><circle cx="12" cy="12" r="3" {...sw} /></Svg>,
  Ban: (p) => <Svg {...p}><circle cx="12" cy="12" r="9" {...sw} /><path d="m5.5 5.5 13 13" {...sw} /></Svg>,
  CaretUp: (p) => <Svg {...p}><path d="m6 14 6-6 6 6" {...sw} /></Svg>,
  CaretDown: (p) => <Svg {...p}><path d="m6 10 6 6 6-6" {...sw} /></Svg>,
  Plus: (p) => <Svg {...p}><path d="M12 5v14M5 12h14" {...sw} /></Svg>,
  Hand: (p) => <Svg {...p}><path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12m0-6.5v-1.5a1.5 1.5 0 0 1 3 0V12m0-6a1.5 1.5 0 0 1 3 0v7m0-3.5a1.5 1.5 0 0 1 3 0V16a8 8 0 0 1-8 8h-1.5A8.5 8.5 0 0 1 5 15.5V14" {...sw} opacity="0.9" /></Svg>,
};

export function useIcon(name, props = {}) {
  const C = I[name] || I.Info;
  return C(props);
}

export const Icon = ({ name, ...props }) => I[name] ? I[name](props) : I.Info(props);

export default I;