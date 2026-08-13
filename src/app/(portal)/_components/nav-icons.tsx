import type { NavIcon } from "@/lib/portal/nav";

type IconProps = { className?: string };

function Calendar({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </svg>
  );
}

function Target({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function PlusCircle({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

function MapPin({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function BarChart({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 20h18" />
      <rect x="6" y="12" width="3.2" height="8" rx="0.6" />
      <rect x="10.4" y="7" width="3.2" height="13" rx="0.6" />
      <rect x="14.8" y="4" width="3.2" height="16" rx="0.6" />
    </svg>
  );
}

function Users({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 11a4 4 0 1 0-4-4" />
      <path d="M2 20c0-3.3 3.1-6 7-6s7 2.7 7 6" />
      <circle cx="9" cy="8" r="4" />
      <path d="M17 14c2.8.4 5 2.4 5 5" />
    </svg>
  );
}

function Grid({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.3" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.3" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.3" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.3" />
    </svg>
  );
}

function Tag({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.6 2.6 21 11l-9.4 9.4a2 2 0 0 1-2.8 0L3 14.6a2 2 0 0 1 0-2.8L11.8 3a2 2 0 0 1 1.4-.6h6.4v6.4Z" />
      <circle cx="15.8" cy="7.2" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

function Dashboard({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="6" rx="1.3" />
      <rect x="3" y="11" width="8" height="10" rx="1.3" />
      <rect x="13" y="11" width="8" height="10" rx="1.3" />
    </svg>
  );
}

function Building({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="3" width="12" height="18" rx="1" />
      <path d="M16 21h4v-9l-4-3" />
      <path d="M8 7h.01M12 7h.01M8 11h.01M12 11h.01M8 15h.01M12 15h.01" />
    </svg>
  );
}

function Globe({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </svg>
  );
}

function Sitemap({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="3" width="6" height="4.5" rx="1" />
      <rect x="3" y="16.5" width="6" height="4.5" rx="1" />
      <rect x="15" y="16.5" width="6" height="4.5" rx="1" />
      <path d="M12 7.5v4M6 16.5v-4h12v4" />
    </svg>
  );
}

function UserCog({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="4" />
      <path d="M2 21c0-3.9 3.1-7 7-7s7 3.1 7 7" />
      <circle cx="19" cy="9" r="2.3" />
      <path d="M19 5.5v1M19 11.5v1M22 9h-1M17 9h-1M20.6 6.4l-.7.7M17.9 10.9l-.7.7M20.6 11.6l-.7-.7M17.9 7.1l-.7-.7" />
    </svg>
  );
}

function Alert({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function Box({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" />
      <path d="m3 8 9 5 9-5" />
      <path d="M12 13v8" />
    </svg>
  );
}

function Bug({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 6a4 4 0 0 1 8 0" />
      <rect x="6" y="6" width="12" height="12" rx="6" />
      <path d="M3 12h3M18 12h3M4.5 7.5 7 9M19.5 7.5 17 9M4.5 17.5 7 16M19.5 17.5 17 16" />
    </svg>
  );
}

function Clipboard({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="8" y="3" width="8" height="4" rx="1" />
      <path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2" />
      <path d="M9 12h6M9 16h4" />
    </svg>
  );
}

const ICONS: Record<NavIcon, (props: IconProps) => React.ReactElement> = {
  calendar: Calendar,
  target: Target,
  plusCircle: PlusCircle,
  mapPin: MapPin,
  barChart: BarChart,
  users: Users,
  grid: Grid,
  tag: Tag,
  dashboard: Dashboard,
  building: Building,
  globe: Globe,
  sitemap: Sitemap,
  userCog: UserCog,
  alert: Alert,
  box: Box,
  bug: Bug,
  clipboard: Clipboard,
};

export function NavIconView({ icon, className }: { icon: NavIcon; className?: string }) {
  const Icon = ICONS[icon];
  return <Icon className={className} />;
}
