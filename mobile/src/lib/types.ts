export type Kpis = {
  plannedCases: number;
  actualCases: number;
  achievement: number;
  productionLoss: number;
  goodCases: number;
  rejectCases: number;
  oee: number;
  availability: number;
  performance: number;
  quality: number;
  downtime: number;
  capacityUtilization: number;
};

export type PlanSummary = {
  id: string;
  planNumber: string;
  productionDate: string;
  plannedCases: number;
  plannedOperatingMins: number;
  plannedStartTime: string;
  plannedEndTime: string;
  batchNumber: string;
  status: string;
  product: { id: string; name: string; brand?: { id: string; name: string } | null };
  sku: { id: string; code: string; name?: string };
  line: { id: string; name: string; code?: string };
  shift: { id: string; name: string; code?: string };
};

export type ProductionEntry = {
  id: string;
  hourStart: string;
  hourEnd: string;
  plannedCases: number;
  actualCases: number;
  goodCases: number;
  rejectCases: number;
  lossCases: number;
  status: string;
  remarks?: string | null;
};

export type DowntimeEntry = {
  id: string;
  durationMins: number;
  startTime: string;
  endTime: string;
  remarks?: string | null;
  category?: { name: string } | null;
  reason?: { name: string } | null;
  machine?: { name?: string; code?: string } | null;
};

export type PlanDetail = PlanSummary & {
  productionEntries: ProductionEntry[];
  downtimeEntries: DowntimeEntry[];
};

export type NotificationItem = {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  isRead?: boolean;
  readAt?: string | null;
  type?: string;
};

export function todayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatPct(n: number | null | undefined, digits = 1) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `${Number(n).toFixed(digits)}%`;
}

export function formatNum(n: number | null | undefined) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return Number(n).toLocaleString();
}

export function formatTime(value?: string | Date | null) {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function roleLabel(role: string) {
  switch (role) {
    case 'ADMIN':
      return 'Admin';
    case 'PRODUCTION_MANAGER':
      return 'Production Manager';
    case 'LINE_SUPERVISOR':
      return 'Line Supervisor';
    default:
      return role;
  }
}
