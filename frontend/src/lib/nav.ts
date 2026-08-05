import type { LucideIcon } from 'lucide-react';
import {
  Home,
  LayoutDashboard,
  Gauge,
  ChartColumnIncreasing,
  Users,
  Factory,
  GitBranch,
  Package,
  Tag,
  Target,
  Cog,
  Clock3,
  RefreshCw,
  ClipboardList,
  HardHat,
  BadgeCheck,
  Activity,
  TimerOff,
  ArrowLeftRight,
  FileBarChart2,
  Bell,
  ScrollText,
  Settings,
  UserRound,
  Monitor,
  UsersRound,
  BookOpen,
} from 'lucide-react';
import type { Role } from '../store';

export type NavItem = {
  label: string;
  path: string;
  roles: Role[];
  group: string;
  icon: LucideIcon;
};

export const NAV_ITEMS: NavItem[] = [
  { label: 'Home', path: '/home', roles: ['ADMIN', 'PRODUCTION_MANAGER', 'LINE_SUPERVISOR'], group: 'Overview', icon: Home },
  { label: 'Dashboard', path: '/dashboard', roles: ['ADMIN', 'PRODUCTION_MANAGER', 'LINE_SUPERVISOR'], group: 'Overview', icon: LayoutDashboard },
  { label: 'Line-wise Overview', path: '/line-wise', roles: ['ADMIN', 'PRODUCTION_MANAGER', 'LINE_SUPERVISOR'], group: 'Overview', icon: Monitor },
  { label: 'OEE Dashboard', path: '/oee', roles: ['ADMIN', 'PRODUCTION_MANAGER'], group: 'Overview', icon: Gauge },
  { label: 'OEE Guidance', path: '/oee-guidance', roles: ['ADMIN', 'PRODUCTION_MANAGER', 'LINE_SUPERVISOR'], group: 'Overview', icon: BookOpen },
  { label: 'Plan vs Actual', path: '/plan-vs-actual', roles: ['ADMIN', 'PRODUCTION_MANAGER'], group: 'Overview', icon: ChartColumnIncreasing },
  { label: 'Users', path: '/users', roles: ['ADMIN'], group: 'Administration', icon: Users },
  { label: 'Plants', path: '/plants', roles: ['ADMIN'], group: 'Master Data', icon: Factory },
  { label: 'Production Lines', path: '/lines', roles: ['ADMIN', 'PRODUCTION_MANAGER'], group: 'Master Data', icon: GitBranch },
  { label: 'Products & SKUs', path: '/products', roles: ['ADMIN', 'PRODUCTION_MANAGER'], group: 'Master Data', icon: Package },
  { label: 'Production Targets', path: '/production-targets', roles: ['ADMIN', 'PRODUCTION_MANAGER'], group: 'Master Data', icon: Target },
  { label: 'Brands', path: '/brands', roles: ['ADMIN', 'PRODUCTION_MANAGER'], group: 'Master Data', icon: Tag },
  { label: 'Machines', path: '/machines', roles: ['ADMIN', 'PRODUCTION_MANAGER'], group: 'Master Data', icon: Cog },
  { label: 'Shifts', path: '/shifts', roles: ['ADMIN'], group: 'Master Data', icon: Clock3 },
  { label: 'Changeover Types', path: '/changeover-types', roles: ['ADMIN'], group: 'Master Data', icon: RefreshCw },
  { label: 'Work Orders', path: '/plans', roles: ['ADMIN', 'PRODUCTION_MANAGER', 'LINE_SUPERVISOR'], group: 'Planning', icon: ClipboardList },
  { label: 'Production Entries', path: '/production-entries', roles: ['ADMIN', 'PRODUCTION_MANAGER', 'LINE_SUPERVISOR'], group: 'Shop Floor', icon: HardHat },
  { label: 'Changeover Details', path: '/changeover-entries', roles: ['ADMIN', 'PRODUCTION_MANAGER', 'LINE_SUPERVISOR'], group: 'Shop Floor', icon: ArrowLeftRight },
  { label: 'Approvals', path: '/approvals', roles: ['ADMIN', 'PRODUCTION_MANAGER'], group: 'Shop Floor', icon: BadgeCheck },
  { label: 'Monitoring', path: '/monitoring', roles: ['ADMIN', 'PRODUCTION_MANAGER', 'LINE_SUPERVISOR'], group: 'Analytics', icon: Activity },
  { label: 'Downtime Analysis', path: '/downtime-analysis', roles: ['ADMIN', 'PRODUCTION_MANAGER'], group: 'Analytics', icon: TimerOff },
  { label: 'Changeover Analysis', path: '/changeover-analysis', roles: ['ADMIN', 'PRODUCTION_MANAGER'], group: 'Analytics', icon: ArrowLeftRight },
  { label: 'Manpower Analysis', path: '/manpower-analysis', roles: ['ADMIN', 'PRODUCTION_MANAGER', 'LINE_SUPERVISOR'], group: 'Analytics', icon: UsersRound },
  { label: 'Reports', path: '/reports', roles: ['ADMIN', 'PRODUCTION_MANAGER', 'LINE_SUPERVISOR'], group: 'Analytics', icon: FileBarChart2 },
  { label: 'Notifications', path: '/notifications', roles: ['ADMIN', 'PRODUCTION_MANAGER', 'LINE_SUPERVISOR'], group: 'System', icon: Bell },
  { label: 'Audit Logs', path: '/audit-logs', roles: ['ADMIN'], group: 'System', icon: ScrollText },
  { label: 'Settings', path: '/settings', roles: ['ADMIN'], group: 'System', icon: Settings },
  { label: 'Profile', path: '/profile', roles: ['ADMIN', 'PRODUCTION_MANAGER', 'LINE_SUPERVISOR'], group: 'System', icon: UserRound },
];

export function canAccess(role: Role, path: string) {
  const item = NAV_ITEMS.find((n) => n.path === path);
  if (!item) return true;
  return item.roles.includes(role);
}

/** KPIs / metrics findable in the header search */
export type SearchKpi = {
  label: string;
  hint: string;
  path: string;
  keywords: string[];
};

export const SEARCH_KPIS: SearchKpi[] = [
  {
    label: 'OEE',
    hint: 'Overall Equipment Effectiveness',
    path: '/oee',
    keywords: ['oee', 'overall equipment effectiveness', 'a x p x q', 'apq'],
  },
  {
    label: 'Availability',
    hint: 'Run Time ÷ Planned Time',
    path: '/oee',
    keywords: ['availability', 'a', 'run time', 'runtime', 'planned time'],
  },
  {
    label: 'Performance',
    hint: '(Ideal Cycle × Count) ÷ Run Time',
    path: '/oee',
    keywords: ['performance', 'p', 'speed', 'ideal cycle', 'cycle time'],
  },
  {
    label: 'Quality',
    hint: 'Good ÷ Total Count',
    path: '/oee',
    keywords: ['quality', 'q', 'good cases', 'reject', 'rejects'],
  },
  {
    label: 'Planned Cases',
    hint: 'Scheduled production volume',
    path: '/dashboard',
    keywords: ['planned cases', 'plan cases', 'target cases'],
  },
  {
    label: 'Actual Cases',
    hint: 'Produced volume',
    path: '/dashboard',
    keywords: ['actual cases', 'produced', 'output', 'production'],
  },
  {
    label: 'Achievement %',
    hint: 'Actual ÷ Planned',
    path: '/dashboard',
    keywords: ['achievement', 'achievement %', 'attainment'],
  },
  {
    label: 'Production Loss',
    hint: 'Planned − Actual',
    path: '/dashboard',
    keywords: ['production loss', 'loss', 'shortfall'],
  },
  {
    label: 'Good Cases',
    hint: 'Accepted output',
    path: '/dashboard',
    keywords: ['good cases', 'good', 'accepted'],
  },
  {
    label: 'Reject Cases',
    hint: 'Rejected output',
    path: '/dashboard',
    keywords: ['reject cases', 'rejects', 'scrap', 'rejection'],
  },
  {
    label: 'Downtime',
    hint: 'Logged stop minutes',
    path: '/downtime-analysis',
    keywords: ['downtime', 'stops', 'breakdown', 'stoppage'],
  },
  {
    label: 'Run Time',
    hint: 'Planned − Downtime',
    path: '/oee',
    keywords: ['run time', 'runtime', 'running time'],
  },
  {
    label: 'Ideal Cycle',
    hint: 'Minutes per case',
    path: '/oee',
    keywords: ['ideal cycle', 'cycle time', 'ict'],
  },
  {
    label: 'Capacity Utilization',
    hint: 'Actual ÷ Planned capacity',
    path: '/oee',
    keywords: ['capacity', 'utilization', 'capacity utilization'],
  },
  {
    label: 'Plan vs Actual',
    hint: 'Variance by day / product',
    path: '/plan-vs-actual',
    keywords: ['plan vs actual', 'variance', 'plan versus actual'],
  },
  {
    label: 'Changeover Time',
    hint: 'Changeover analysis',
    path: '/changeover-analysis',
    keywords: ['changeover', 'change over', 'co time', 'sku change'],
  },
  {
    label: 'Labour Productivity',
    hint: 'Cases ÷ labour hours',
    path: '/manpower-analysis',
    keywords: ['labour', 'labor', 'productivity', 'manpower', 'cases per operator'],
  },
  {
    label: 'Manpower Availability',
    hint: 'Present ÷ Planned headcount',
    path: '/manpower-analysis',
    keywords: ['manpower availability', 'headcount', 'staffing', 'operators'],
  },
];

