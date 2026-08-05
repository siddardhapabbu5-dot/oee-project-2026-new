import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api, { type ApiResponse } from '../lib/api';
import { DateWithIcon, Field, IconButton, LoadingBlock, PageHeader, KpiCard } from '../components/ui';
import { StatusBadge } from '../components/CrudPage';
import { formatWorkOrder } from '../lib/workOrder';

type PlanDetail = {
  id: string;
  planNumber: string;
  productionDate: string;
  plannedCases: number;
  plannedOperatingMins: number;
  plannedStartTime: string;
  plannedEndTime: string;
  batchNumber: string;
  product: { id: string; name: string; brand?: { id: string; name: string } | null };
  sku: { id: string; code: string; name?: string; packVolume?: string | null };
  line: { id: string; name: string; code?: string };
  shift: { id: string; name: string; code?: string };
  productionEntries: Array<{
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
  }>;
  downtimeEntries: Array<{
    id: string;
    durationMins: number;
    startTime: string;
    endTime: string;
    actionTaken?: string | null;
    remarks?: string | null;
    machineId?: string | null;
    categoryId: string;
    reasonId: string;
    category?: { id?: string; name: string } | null;
    reason?: { id?: string; name: string } | null;
    machine?: { id?: string; code?: string; name?: string } | null;
  }>;
};

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** Display time in 24-hour format (HH:mm) */
function formatTime24(value: string | Date) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toTimeOnly(d: Date) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function combineDateAndTime(dateStr: string, timeStr: string) {
  const day = dateStr.slice(0, 10);
  const time = timeStr.length === 5 ? `${timeStr}:00` : timeStr;
  return new Date(`${day}T${time}`);
}

function timeToMins(timeStr: string) {
  const [h, m] = timeStr.slice(0, 5).split(':').map(Number);
  return (Number(h) || 0) * 60 + (Number(m) || 0);
}

function dateToMinsOfDay(d: Date) {
  return d.getHours() * 60 + d.getMinutes();
}

function shiftAnchorMins(plannedStartTime?: string | null) {
  if (!plannedStartTime) return 0;
  const d = new Date(plannedStartTime);
  if (Number.isNaN(d.getTime())) return 0;
  return dateToMinsOfDay(d);
}

/**
 * Combine plan date + HH:mm. For overnight shifts, times before shift start
 * belong to the next calendar day (e.g. shift 20:00 → 00:00 is next day).
 */
function combineShiftDateTime(planDate: string, timeStr: string, anchorMins: number) {
  let dt = combineDateAndTime(planDate, timeStr);
  if (timeToMins(timeStr) < anchorMins) {
    dt = new Date(dt.getTime() + 24 * 60 * 60 * 1000);
  }
  return dt;
}

/** Sort key: minutes from shift start (0…1439), wraps overnight correctly */
function shiftOrderKey(iso: string | Date, anchorMins: number) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return Number.MAX_SAFE_INTEGER;
  let rel = dateToMinsOfDay(d) - anchorMins;
  if (rel < 0) rel += 24 * 60;
  return rel;
}

function minsBetweenTimes(dateStr: string, start?: string, end?: string) {
  if (!start || !end) return 0;
  const a = combineDateAndTime(dateStr, start).getTime();
  let b = combineDateAndTime(dateStr, end).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  if (b <= a) b += 24 * 60 * 60 * 1000; // overnight
  return Math.round((b - a) / 60000);
}

function hourWindowMins(hourStart: string | Date, hourEnd: string | Date) {
  const start = new Date(hourStart);
  let end = new Date(hourEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  if (end <= start) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

/** Downtime from production loss: (lossCases / targetCases) × hourMins — whole minutes */
function downtimeFromLoss(lossCases: number, targetCases: number, hourMins: number) {
  if (!targetCases || targetCases <= 0 || hourMins <= 0) return 0;
  const loss = Math.max(0, lossCases);
  const mins = (loss / targetCases) * hourMins;
  return Math.min(hourMins, Math.round(mins));
}

/**
 * Hourly OEE = A × P × Q (factors capped at 100%)
 * Availability = Run Time ÷ Hour Mins
 * Performance  = (Ideal Cycle × Production) ÷ Run Time
 * Quality      = Accepted ÷ Production
 * Ideal Cycle  = Hour Mins ÷ Target
 */
function calcHourlyOee(input: {
  hourMins: number;
  downtimeMins: number;
  target: number;
  production: number;
  accepted: number;
}) {
  const planned = Math.max(0, input.hourMins || 0);
  const downtime = Math.max(0, input.downtimeMins || 0);
  const runTime = Math.max(0, planned - downtime);
  const total = Math.max(0, input.production || 0);
  const good = Math.max(0, input.accepted || 0);
  const idealCycle = input.target > 0 && planned > 0 ? planned / input.target : 0;

  const availability = planned > 0 ? Math.min(100, (runTime / planned) * 100) : 0;
  const performance =
    runTime > 0 && idealCycle > 0 ? Math.min(100, ((idealCycle * total) / runTime) * 100) : 0;
  const quality = total > 0 ? Math.min(100, (good / total) * 100) : 0;
  const oee = (availability / 100) * (performance / 100) * (quality / 100) * 100;

  return {
    availability: Number(availability.toFixed(1)),
    performance: Number(performance.toFixed(1)),
    quality: Number(quality.toFixed(1)),
    oee: Number(oee.toFixed(1)),
  };
}

export default function ProductionEntriesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialPlanId = searchParams.get('planId') || '';
  const [planId, setPlanId] = useState(initialPlanId);
  const [prodForm, setProdForm] = useState<Record<string, string>>({});
  const [dtForm, setDtForm] = useState<Record<string, string>>({});
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editingDowntimeId, setEditingDowntimeId] = useState<string | null>(null);
  const [reportDate, setReportDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reportShiftId, setReportShiftId] = useState('');
  const [downloading, setDownloading] = useState<'day' | 'shift' | 'plan' | null>(null);
  const qc = useQueryClient();
  const didInitDateFromPlan = useRef(false);

  const plans = useQuery({
    queryKey: ['plans-entries', reportDate, reportShiftId],
    enabled: Boolean(reportDate),
    queryFn: async () =>
      (
        await api.get<
          ApiResponse<
            Array<{
              id: string;
              planNumber: string;
              productionDate: string;
              line: { name: string; code?: string };
              shift: { id?: string; name: string };
            }>
          >
        >('/plans', {
          params: {
            limit: 100,
            from: reportDate,
            to: reportDate,
            ...(reportShiftId ? { shiftId: reportShiftId } : {}),
          },
        })
      ).data.data,
  });

  useEffect(() => {
    if (initialPlanId) setPlanId(initialPlanId);
  }, [initialPlanId]);

  const plan = useQuery({
    queryKey: ['plan', planId],
    enabled: !!planId,
    queryFn: async () => (await api.get<ApiResponse<PlanDetail>>(`/plans/${planId}`)).data.data,
  });

  // If opened with ?planId=, align Report Date + Shift to that work order once
  useEffect(() => {
    if (didInitDateFromPlan.current) return;
    if (!initialPlanId || !plan.data?.productionDate || plan.data.id !== initialPlanId) return;
    didInitDateFromPlan.current = true;
    setReportDate(String(plan.data.productionDate).slice(0, 10));
    if (plan.data.shift?.id) setReportShiftId(plan.data.shift.id);
  }, [initialPlanId, plan.data?.id, plan.data?.productionDate, plan.data?.shift?.id]);

  // Keep selected work order within the filtered date/shift list
  useEffect(() => {
    if (plans.isLoading || !plans.data) return;
    if (planId && plans.data.some((x) => x.id === planId)) return;
    // Wait for deep-link date sync before replacing selection
    if (initialPlanId && planId === initialPlanId && !didInitDateFromPlan.current) return;

    const nextId = plans.data[0]?.id || '';
    if (nextId === planId) return;
    setPlanId(nextId);
    setSearchParams(nextId ? { planId: nextId } : {}, { replace: true });
    if (!nextId) {
      setEditingEntryId(null);
      setEditingDowntimeId(null);
    }
  }, [plans.data, plans.isLoading, planId, initialPlanId, setSearchParams]);

  const MACHINE_ORDER = [
    'Raw Water Pump',
    'Sand Filter',
    'Activated Carbon Filter',
    'Softener',
    'RO Plant',
    'UV Sterilizer',
    'Ozone Generator',
    'Product Water Tank',
    'Blow Mould',
    'Bottle Unscrambler',
    'Air Conveyor',
    'Bottle Rinser',
    'Filler',
    'Cap Elevator',
    'Cap Feeder',
    'Capper',
    'Vision Inspection System',
    'Bottle Inspection Conveyor',
    'Inkjet Printer',
    'Labeling Machine',
    'Shrink Wrapper',
    'Shrink Tunnel',
    'Carton Erector',
    'Case Packer',
    'Carton Sealer',
    'Palletizer',
    'Infeed Conveyor',
    'Transfer Conveyor',
    'Outfeed Conveyor',
    'Air Compressor',
    'Air Dryer',
    'Chiller',
    'Boiler',
    'DG Generator',
    'Electrical Panel',
    'PLC/HMI',
    'Other',
  ];

  const machines = useQuery({
    queryKey: ['machines', plan.data?.line?.id ?? 'all'],
    queryFn: async () =>
      (
        await api.get<ApiResponse<Array<{ id: string; name: string; code: string; lineId?: string }>>>('/machines', {
          params: {
            limit: 200,
            ...(plan.data?.line?.id ? { lineId: plan.data.line.id } : {}),
          },
        })
      ).data.data,
  });

  const machineOptions = useMemo(() => {
    const order = new Map(MACHINE_ORDER.map((name, i) => [name, i]));
    const all = machines.data ?? [];
    return [...all].sort((a, b) => {
      const ai = order.get(a.name) ?? 999;
      const bi = order.get(b.name) ?? 999;
      return ai - bi || a.name.localeCompare(b.name);
    });
  }, [machines.data]);

  const categories = useQuery({
    queryKey: ['dt-cats'],
    queryFn: async () =>
      (
        await api.get<ApiResponse<Array<{ id: string; name: string; code: string; reasons: Array<{ id: string; name: string }> }>>>(
          '/downtime-categories',
        )
      ).data.data,
  });

  const entryCategories = useMemo(() => {
    const preferredOrder = [
      'PERF-SPEED',
      'PERF-MINOR',
      'PERF-ADJ',
      'PERF-MAT',
      'PERF-MECH',
      'PERF-ELEC',
      'PERF-UTIL',
      'PERF-OPER',
      'PERF-PROC',
      'PERF-QI',
      'AVAIL-PPL',
      'AVAIL-MECH',
      'AVAIL-ELEC',
      'AVAIL-UTIL',
      'AVAIL-MAT',
      'AVAIL-QH',
      'AVAIL-MANP',
      'AVAIL-PROC',
      'AVAIL-SAFE',
      'AVAIL-EXT',
      'QUAL-FILL',
      'QUAL-CAP',
      'QUAL-BOTTLE',
      'QUAL-LABEL',
      'QUAL-CODE',
      'QUAL-PACK',
      'QUAL-PROD',
      'QUAL-START',
      'QUAL-REWORK',
      'QUAL-QA',
    ];
    const orderIndex = new Map(preferredOrder.map((code, i) => [code, i]));
    const all = categories.data ?? [];
    return [...all].sort((a, b) => {
      const ai = orderIndex.get(a.code) ?? 999;
      const bi = orderIndex.get(b.code) ?? 999;
      return ai - bi || a.name.localeCompare(b.name);
    });
  }, [categories.data]);

  const reasons = useMemo(() => {
    const cat = entryCategories.find((c) => c.id === dtForm.categoryId);
    return (cat?.reasons ?? []).filter((r) => !!r.id);
  }, [entryCategories, dtForm.categoryId]);

  const shifts = useQuery({
    queryKey: ['shifts'],
    queryFn: async () =>
      (await api.get<ApiResponse<Array<{ id: string; name: string }>>>('/shifts')).data.data,
  });

  const p = plan.data;

  const hourlyMetrics = useMemo(() => {
    const map = new Map<
      string,
      {
        downtimeMins: number;
        runningMins: number;
        oee: number;
        availability: number;
        performance: number;
        quality: number;
      }
    >();
    if (!p) return map;
    for (const e of p.productionEntries) {
      const slotMins = hourWindowMins(e.hourStart, e.hourEnd) || 60;
      const target = Number(e.plannedCases) || 0;
      const production = Number(e.actualCases) || 0;
      const accepted = Number(e.goodCases) || (production > 0 ? production : 0);
      const loss = Number(e.lossCases) || Math.max(0, target - production);
      const downtimeMins = downtimeFromLoss(loss, target, slotMins);
      const runningMins = Math.max(0, slotMins - downtimeMins);
      const oeeParts = calcHourlyOee({
        hourMins: slotMins,
        downtimeMins,
        target,
        production,
        accepted,
      });
      map.set(e.id, {
        downtimeMins,
        runningMins,
        ...oeeParts,
      });
    }
    return map;
  }, [p]);

  const shiftMins = shiftAnchorMins(p?.plannedStartTime);
  const hourlyLog = useMemo(() => {
    if (!p) return [];
    return [...p.productionEntries].sort(
      (a, b) => shiftOrderKey(a.hourStart, shiftMins) - shiftOrderKey(b.hourStart, shiftMins),
    );
  }, [p, shiftMins]);

  const downtimeLog = useMemo(() => {
    if (!p) return [];
    return [...p.downtimeEntries].sort(
      (a, b) => shiftOrderKey(a.startTime, shiftMins) - shiftOrderKey(b.startTime, shiftMins),
    );
  }, [p, shiftMins]);

  const hourTarget = useMemo(() => {
    if (!p) return 0;
    const start = new Date(p.plannedStartTime).getTime();
    const end = new Date(p.plannedEndTime).getTime();
    const hours = Math.max(1, Math.round((end - start) / 3600000) || 8);
    return Math.round(p.plannedCases / hours);
  }, [p]);

  useEffect(() => {
    if (!p) return;
    const start = new Date(p.plannedStartTime);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    setProdForm((f) => ({
      ...f,
      plannedCases: f.plannedCases || String(hourTarget),
      productionCases: f.productionCases || '',
      timeFrom: f.timeFrom || toTimeOnly(start),
      timeTo: f.timeTo || toTimeOnly(end),
    }));
  }, [p, hourTarget]);

  const lossCases = useMemo(() => {
    const planned = Number(prodForm.plannedCases || 0);
    const produced = Number(prodForm.productionCases || 0);
    return Math.max(0, planned - produced);
  }, [prodForm.plannedCases, prodForm.productionCases]);

  const planDate = p?.productionDate?.slice(0, 10) || new Date().toISOString().slice(0, 10);

  const durationMins = useMemo(
    () => minsBetweenTimes(planDate, dtForm.startTime, dtForm.endTime),
    [planDate, dtForm.startTime, dtForm.endTime],
  );

  const saveProduction = useMutation({
    mutationFn: async () => {
      const planned = Number(prodForm.plannedCases || 0);
      const actual = Number(prodForm.productionCases || 0);
      const accepted = prodForm.acceptedCases !== undefined && prodForm.acceptedCases !== ''
        ? Number(prodForm.acceptedCases)
        : actual;
      const hold = Number(prodForm.holdCases || 0);
      if (accepted + hold > actual + 0.0001) {
        throw new Error('Accepted + Hold cases cannot exceed Production cases');
      }
      const anchor = shiftAnchorMins(p?.plannedStartTime);
      const hourStart = combineShiftDateTime(planDate, prodForm.timeFrom || '06:00', anchor);
      let hourEnd = combineShiftDateTime(planDate, prodForm.timeTo || '07:00', anchor);
      if (hourEnd <= hourStart) hourEnd = new Date(hourEnd.getTime() + 24 * 60 * 60 * 1000);
      const payload = {
        planId,
        hourStart: hourStart.toISOString(),
        hourEnd: hourEnd.toISOString(),
        plannedCases: planned,
        actualCases: actual,
        goodCases: accepted,
        rejectCases: hold,
        remarks: prodForm.remarks || null,
      };
      if (editingEntryId) {
        const { planId: _pid, ...updatePayload } = payload;
        return api.patch(`/production-entries/${editingEntryId}`, updatePayload);
      }
      return api.post('/production-entries', payload);
    },
    onSuccess: async () => {
      toast.success(editingEntryId ? 'Hourly entry updated' : 'Production entry saved');
      setEditingEntryId(null);
      setProdForm((f) => ({
        ...f,
        productionCases: '',
        acceptedCases: '',
        holdCases: '',
        remarks: '',
        plannedCases: String(hourTarget),
      }));
      await qc.invalidateQueries({ queryKey: ['plan', planId] });
    },
    onError: (e: unknown) =>
      toast.error((e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || 'Save failed'),
  });

  const deleteProduction = useMutation({
    mutationFn: async (id: string) => api.delete(`/production-entries/${id}`),
    onSuccess: async () => {
      toast.success('Hourly entry deleted');
      if (editingEntryId) {
        setEditingEntryId(null);
        setProdForm((f) => ({
          ...f,
          productionCases: '',
          acceptedCases: '',
          holdCases: '',
          remarks: '',
          plannedCases: String(hourTarget),
        }));
      }
      await qc.invalidateQueries({ queryKey: ['plan', planId] });
    },
    onError: (e: unknown) =>
      toast.error((e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || 'Delete failed'),
  });

  function startEditEntry(e: PlanDetail['productionEntries'][number]) {
    setEditingEntryId(e.id);
    setProdForm({
      plannedCases: String(e.plannedCases),
      productionCases: String(e.actualCases),
      acceptedCases: String(e.goodCases),
      holdCases: String(e.rejectCases),
      timeFrom: toTimeOnly(new Date(e.hourStart)),
      timeTo: toTimeOnly(new Date(e.hourEnd)),
      remarks: e.remarks || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEdit() {
    setEditingEntryId(null);
    setProdForm((f) => ({
      ...f,
      productionCases: '',
      acceptedCases: '',
      holdCases: '',
      remarks: '',
      plannedCases: String(hourTarget),
    }));
  }

  const saveDowntime = useMutation({
    mutationFn: async () => {
      if (!planId) throw new Error('Select a work order first');
      if (!dtForm.categoryId) throw new Error('Select a category');
      if (!String(dtForm.reason || '').trim()) throw new Error('Enter a reason');
      if (!dtForm.startTime || !dtForm.endTime) throw new Error('Enter downtime start and end time');

      const anchor = shiftAnchorMins(p?.plannedStartTime);
      const startTime = combineShiftDateTime(planDate, dtForm.startTime, anchor);
      let endTime = combineShiftDateTime(planDate, dtForm.endTime, anchor);
      if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
        throw new Error('Invalid downtime times');
      }
      if (endTime <= startTime) endTime = new Date(endTime.getTime() + 24 * 60 * 60 * 1000);

      const payload = {
        planId,
        machineId: dtForm.machineId ? dtForm.machineId : null,
        categoryId: dtForm.categoryId,
        reason: String(dtForm.reason).trim(),
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        actionTaken: dtForm.actionPlan || null,
        remarks: dtForm.remarks || null,
      };

      if (editingDowntimeId) {
        const { planId: _pid, ...updatePayload } = payload;
        return api.patch(`/downtime-entries/${editingDowntimeId}`, updatePayload);
      }
      return api.post('/downtime-entries', payload);
    },
    onSuccess: async () => {
      toast.success(editingDowntimeId ? 'Downtime updated' : 'Downtime saved');
      setEditingDowntimeId(null);
      setDtForm({
        categoryId: dtForm.categoryId,
        machineId: '',
        reason: '',
        startTime: '',
        endTime: '',
        actionPlan: '',
      });
      await qc.invalidateQueries({ queryKey: ['plan', planId] });
    },
    onError: (e: unknown) => {
      const apiMsg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      const localMsg = e instanceof Error ? e.message : null;
      toast.error(apiMsg || localMsg || 'Save failed');
    },
  });

  const deleteDowntime = useMutation({
    mutationFn: async (id: string) => api.delete(`/downtime-entries/${id}`),
    onSuccess: async () => {
      toast.success('Downtime deleted');
      if (editingDowntimeId) {
        setEditingDowntimeId(null);
        setDtForm({});
      }
      await qc.invalidateQueries({ queryKey: ['plan', planId] });
    },
    onError: (e: unknown) =>
      toast.error((e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || 'Delete failed'),
  });

  function startEditDowntime(d: PlanDetail['downtimeEntries'][number]) {
    setEditingDowntimeId(d.id);
    setDtForm({
      machineId: d.machineId || d.machine?.id || '',
      categoryId: d.categoryId || d.category?.id || '',
      reason: d.reason?.name || '',
      startTime: toTimeOnly(new Date(d.startTime)),
      endTime: toTimeOnly(new Date(d.endTime)),
      actionPlan: d.actionTaken || '',
      remarks: d.remarks || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEditDowntime() {
    setEditingDowntimeId(null);
    setDtForm({});
  }

  async function downloadBlob(path: string, filename: string) {
    const res = await api.get(path, { responseType: 'blob', params: undefined });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadExcel() {
    if (!planId) {
      toast.error('Select a work order first');
      return;
    }
    try {
      setDownloading('plan');
      const planNo = formatWorkOrder(plan.data?.planNumber || planId);
      await downloadBlob(
        `/plans/${planId}/entries/export/excel`,
        `production-entries-${planNo}-${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
      toast.success('Plan Excel downloaded');
    } catch {
      toast.error('Excel download failed');
    } finally {
      setDownloading(null);
    }
  }

  async function downloadDayReport() {
    if (!reportDate) {
      toast.error('Select a date for day-wise report');
      return;
    }
    try {
      setDownloading('day');
      const res = await api.get('/production-entries/export/excel', {
        responseType: 'blob',
        params: { mode: 'day', date: reportDate },
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `production-entries-day-${reportDate}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Day-wise report downloaded');
    } catch {
      toast.error('Day-wise download failed');
    } finally {
      setDownloading(null);
    }
  }

  async function downloadShiftReport() {
    if (!reportDate) {
      toast.error('Select a date for shift-wise report');
      return;
    }
    if (!reportShiftId) {
      toast.error('Select a shift for shift-wise report');
      return;
    }
    try {
      setDownloading('shift');
      const res = await api.get('/production-entries/export/excel', {
        responseType: 'blob',
        params: {
          mode: 'shift',
          date: reportDate,
          shiftId: reportShiftId,
        },
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `production-entries-shift-${reportDate}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Shift-wise report downloaded');
    } catch {
      toast.error('Shift-wise download failed');
    } finally {
      setDownloading(null);
    }
  }

  if (plans.isLoading) return <LoadingBlock />;

  const actualTotal = p?.productionEntries.reduce((s, e) => s + e.actualCases, 0) ?? 0;
  const lossTotal = p?.productionEntries.reduce((s, e) => s + e.lossCases, 0) ?? 0;
  const dtMins = p?.downtimeEntries.reduce((s, d) => s + d.durationMins, 0) ?? 0;

  const brandName = p?.product?.brand?.name || '—';
  const skuLabel = p?.sku?.packVolume || p?.sku?.name || p?.sku?.code || '—';

  return (
    <div>
      <PageHeader
        title="Production Entries"
        subtitle="Hourly production & downtime entry — plan fields auto-filled"
        actions={
          <button
            className="btn btn-secondary"
            type="button"
            disabled={!planId || downloading === 'plan'}
            onClick={() => void downloadExcel()}
          >
            {downloading === 'plan' ? 'Downloading...' : 'Download Plan Excel'}
          </button>
        }
      />

      <div className="panel mb-4 p-4">
        <h3 className="mb-3 font-semibold">Download Reports</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Report Date">
            <input
              className="input"
              type="date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
            />
          </Field>
          <Field label="Shift">
            <select
              className="input"
              value={reportShiftId}
              onChange={(e) => setReportShiftId(e.target.value)}
            >
              <option value="">All shifts</option>
              {(shifts.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-end">
            <button
              className="btn btn-secondary w-full"
              type="button"
              disabled={!reportDate || downloading === 'day'}
              onClick={() => void downloadDayReport()}
            >
              {downloading === 'day' ? 'Downloading...' : 'Download Day-wise'}
            </button>
          </div>
          <div className="flex items-end">
            <button
              className="btn btn-secondary w-full"
              type="button"
              disabled={!reportDate || !reportShiftId || downloading === 'shift'}
              onClick={() => void downloadShiftReport()}
            >
              {downloading === 'shift' ? 'Downloading...' : 'Download Shift-wise'}
            </button>
          </div>
        </div>
        <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
          Filters work orders by date and shift. Day-wise export uses the date; Shift-wise export needs a shift
          selected. Includes hourly production and downtime sheets.
        </p>
      </div>

      <div className="panel mb-4 p-4">
        <Field label="Select Work Order">
          <select
            className="input"
            value={planId}
            onChange={(e) => {
              setPlanId(e.target.value);
              setSearchParams(e.target.value ? { planId: e.target.value } : {});
              setProdForm({});
              setDtForm({});
              setEditingEntryId(null);
              setEditingDowntimeId(null);
            }}
          >
            <option value="">Select a work order...</option>
            {(plans.data ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {formatWorkOrder(item.planNumber)} — {item.line?.code || item.line?.name} / {item.shift?.name} /{' '}
                {String(item.productionDate || '').slice(0, 10)}
              </option>
            ))}
          </select>
        </Field>
        {plans.isError ? (
          <p className="mt-2 text-sm text-red-600">Could not load work orders. Check that the API is running, then refresh.</p>
        ) : null}
        {!plans.isLoading && !plans.isError && (plans.data?.length ?? 0) === 0 ? (
          <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
            No work orders for {reportDate || 'this date'}
            {reportShiftId
              ? ` · ${(shifts.data ?? []).find((s) => s.id === reportShiftId)?.name || 'selected shift'}`
              : ''}
            . Pick another date/shift or create a work order.
          </p>
        ) : (
          <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
            Showing work orders for <strong style={{ color: 'var(--text)' }}>{reportDate}</strong>
            {reportShiftId ? (
              <>
                {' · '}
                <strong style={{ color: 'var(--text)' }}>
                  {(shifts.data ?? []).find((s) => s.id === reportShiftId)?.name || 'Shift'}
                </strong>
              </>
            ) : (
              ' · all shifts'
            )}
            {plans.isFetching ? ' · updating…' : ''}
          </p>
        )}
      </div>

      {plans.isLoading || (planId && plan.isLoading) ? (
        <LoadingBlock />
      ) : plan.isError ? (
        <div className="panel p-4 text-sm text-red-600">
          Failed to load work order details. Select another work order or refresh the page.
        </div>
      ) : p ? (
        <>
          <div className="panel mb-4 p-4">
            <h3 className="mb-3 font-semibold">Plan View (Automatic)</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div>
                <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                  Date
                </div>
                <div className="mt-1 font-medium"><DateWithIcon value={p.productionDate} /></div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                  Shift
                </div>
                <div className="mt-1 font-medium">{p.shift?.name || '—'}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                  Production Line
                </div>
                <div className="mt-1 font-medium">{p.line?.code || p.line?.name || '—'}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                  Product & SKU
                </div>
                <div className="mt-1 font-medium">
                  {p.product?.name || '—'} · {skuLabel}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                  Brand
                </div>
                <div className="mt-1 font-medium">{brandName}</div>
              </div>
            </div>
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Work Order" value={formatWorkOrder(p.planNumber)} hint={`Batch ${p.batchNumber}`} />
            <KpiCard label="Planned Cases" value={p.plannedCases.toLocaleString()} />
            <KpiCard label="Production Cases" value={actualTotal.toLocaleString()} />
            <KpiCard label="Loss / Downtime" value={`${lossTotal} / ${dtMins}m`} tone="warn" />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="panel p-4">
              <h3 className="mb-3 font-semibold">
                {editingEntryId ? 'Edit Hourly Entry' : 'Entry Part — Brand & SKU (Hourly)'}
              </h3>
              <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span style={{ color: 'var(--muted)' }}>Brand: </span>
                  <strong>{brandName}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--muted)' }}>SKU: </span>
                  <strong>{skuLabel}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--muted)' }}>Shift: </span>
                  <strong>{p.shift?.name || '—'}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--muted)' }}>Hour target: </span>
                  <strong>{hourTarget}</strong>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Field label="Time From">
                  <input
                    className="input"
                    type="time"
                    value={prodForm.timeFrom || ''}
                    onChange={(e) => {
                      const from = e.target.value;
                      let nextTo = prodForm.timeTo;
                      if (from) {
                        const [h, m] = from.split(':').map(Number);
                        const endH = (h + 1) % 24;
                        nextTo = `${pad(endH)}:${pad(m || 0)}`;
                      }
                      setProdForm({
                        ...prodForm,
                        timeFrom: from,
                        timeTo: nextTo,
                      });
                    }}
                  />
                </Field>
                <Field label="Time To">
                  <input
                    className="input"
                    type="time"
                    value={prodForm.timeTo || ''}
                    onChange={(e) => setProdForm({ ...prodForm, timeTo: e.target.value })}
                  />
                </Field>
                <Field label="Planned Cases (Hour Target)">
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={prodForm.plannedCases || ''}
                    onChange={(e) => setProdForm({ ...prodForm, plannedCases: e.target.value })}
                  />
                </Field>
                <Field label="Production Cases (Per Hour)">
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={prodForm.productionCases || ''}
                    onChange={(e) => {
                      const productionCases = e.target.value;
                      const next: Record<string, string> = { ...prodForm, productionCases };
                      if (!prodForm.acceptedCases || prodForm.acceptedCases === prodForm.productionCases) {
                        next.acceptedCases = productionCases;
                      }
                      setProdForm(next);
                    }}
                  />
                </Field>
                <Field label="Loss of Cases (Per Hour)">
                  <input className="input" type="number" value={String(lossCases)} readOnly />
                </Field>
                <Field label="Remarks">
                  <input
                    className="input"
                    value={prodForm.remarks || ''}
                    onChange={(e) => setProdForm({ ...prodForm, remarks: e.target.value })}
                  />
                </Field>
              </div>

              <div className="mt-4 rounded-xl border p-3" style={{ borderColor: 'var(--border)' }}>
                <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                  Quality
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Accepted Cases">
                    <input
                      className="input"
                      type="number"
                      min={0}
                      value={prodForm.acceptedCases || ''}
                      onChange={(e) => setProdForm({ ...prodForm, acceptedCases: e.target.value })}
                    />
                  </Field>
                  <Field label="Hold Cases">
                    <input
                      className="input"
                      type="number"
                      min={0}
                      value={prodForm.holdCases || ''}
                      onChange={(e) => setProdForm({ ...prodForm, holdCases: e.target.value })}
                    />
                  </Field>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  className="btn btn-primary flex-1"
                  disabled={saveProduction.isPending}
                  onClick={() => saveProduction.mutate()}
                >
                  {saveProduction.isPending
                    ? 'Saving...'
                    : editingEntryId
                      ? 'Update Hourly Entry'
                      : 'Save Production Entry'}
                </button>
                {editingEntryId ? (
                  <button className="btn btn-secondary" type="button" onClick={cancelEdit}>
                    Cancel
                  </button>
                ) : null}
              </div>
            </div>

            <div className="panel p-4">
              <h3 className="mb-3 font-semibold">
                {editingDowntimeId ? 'Edit Downtime Entry' : 'Downtime Entry'}
              </h3>
              <Field label="Shift">
                <input className="input" value={p.shift?.name || ''} readOnly />
              </Field>
              <Field label="Machine">
                <select
                  className="input"
                  value={dtForm.machineId || ''}
                  onChange={(e) => setDtForm({ ...dtForm, machineId: e.target.value })}
                >
                  <option value="">Select machine...</option>
                  {machineOptions.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Downtime Start">
                  <input
                    className="input"
                    type="time"
                    value={dtForm.startTime || ''}
                    onChange={(e) => setDtForm({ ...dtForm, startTime: e.target.value })}
                  />
                </Field>
                <Field label="Downtime End">
                  <input
                    className="input"
                    type="time"
                    value={dtForm.endTime || ''}
                    onChange={(e) => setDtForm({ ...dtForm, endTime: e.target.value })}
                  />
                </Field>
              </div>
              <Field label="Duration (mins)">
                <input className="input" type="number" value={String(durationMins)} readOnly />
              </Field>
              <Field label="Category">
                <select
                  className="input"
                  value={dtForm.categoryId || ''}
                  onChange={(e) => setDtForm({ ...dtForm, categoryId: e.target.value, reason: '' })}
                >
                  <option value="">Select category...</option>
                  {(entryCategories ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Reason">
                <input
                  className="input"
                  list="downtime-reason-suggestions"
                  value={dtForm.reason || ''}
                  onChange={(e) => setDtForm({ ...dtForm, reason: e.target.value })}
                  placeholder="Type reason..."
                  autoComplete="off"
                />
                <datalist id="downtime-reason-suggestions">
                  {reasons.map((r) => (
                    <option key={r.id} value={r.name} />
                  ))}
                </datalist>
              </Field>
              <Field label="Action Plan">
                <input
                  className="input"
                  value={dtForm.actionPlan || ''}
                  onChange={(e) => setDtForm({ ...dtForm, actionPlan: e.target.value })}
                  placeholder="Corrective / preventive action"
                />
              </Field>
              <button
                className="btn btn-primary mt-3 w-full"
                disabled={saveDowntime.isPending}
                onClick={() => saveDowntime.mutate()}
              >
                {saveDowntime.isPending
                  ? 'Saving...'
                  : editingDowntimeId
                    ? 'Update Downtime'
                    : 'Save Downtime'}
              </button>
              {editingDowntimeId ? (
                <button className="btn btn-secondary mt-2 w-full" type="button" onClick={cancelEditDowntime}>
                  Cancel
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-4 grid gap-4">
            <div className="panel p-4">
              <h3 className="mb-3 font-semibold">Hourly Production Log</h3>
              <div className="table-wrap fit-cols">
                <table className="data entry-log">
                  <colgroup>
                    <col style={{ width: '9%' }} />
                    <col style={{ width: '7%' }} />
                    <col style={{ width: '5%' }} />
                    <col style={{ width: '5%' }} />
                    <col style={{ width: '6%' }} />
                    <col style={{ width: '7%' }} />
                    <col style={{ width: '6%' }} />
                    <col style={{ width: '5%' }} />
                    <col style={{ width: '5%' }} />
                    <col style={{ width: '5%' }} />
                    <col style={{ width: '5%' }} />
                    <col style={{ width: '7%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '5.25rem' }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th title="Brand">Brand</th>
                      <th title="SKU">SKU</th>
                      <th title="From">From</th>
                      <th title="To">To</th>
                      <th title="Target">Target</th>
                      <th title="Production">Prod</th>
                      <th title="Accepted">Acc</th>
                      <th title="Hold">Hold</th>
                      <th title="Loss Cases">Loss</th>
                      <th title="Downtime (Min)">DT</th>
                      <th title="Running Time (Min)">Run</th>
                      <th title="OEE = Availability × Performance × Quality">OEE %</th>
                      <th title="Status">Status</th>
                      <th className="col-actions">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hourlyLog.map((e) => {
                      const metrics = hourlyMetrics.get(e.id) ?? {
                        downtimeMins: 0,
                        runningMins: 0,
                        oee: 0,
                        availability: 0,
                        performance: 0,
                        quality: 0,
                      };
                      const oeeTone =
                        metrics.oee >= 85 ? 'var(--success)' : metrics.oee >= 70 ? 'var(--warning)' : metrics.oee > 0 ? 'var(--danger)' : 'var(--muted)';
                      return (
                      <tr key={e.id} className={editingEntryId === e.id ? 'bg-blue-50/40' : undefined}>
                        <td title={brandName}>{brandName}</td>
                        <td title={skuLabel}>{skuLabel}</td>
                        <td>{formatTime24(e.hourStart)}</td>
                        <td>{formatTime24(e.hourEnd)}</td>
                        <td>{e.plannedCases}</td>
                        <td>{e.actualCases}</td>
                        <td>{e.goodCases}</td>
                        <td>{e.rejectCases}</td>
                        <td>{e.lossCases}</td>
                        <td>{metrics.downtimeMins}</td>
                        <td>{metrics.runningMins}</td>
                        <td
                          className="font-semibold tabular-nums"
                          style={{ color: oeeTone }}
                          title={`A ${metrics.availability}% × P ${metrics.performance}% × Q ${metrics.quality}%`}
                        >
                          {metrics.oee}%
                        </td>
                        <td title={e.status}>
                          <StatusBadge status={e.status} />
                        </td>
                        <td className="col-actions">
                          <div className="row-actions">
                            <IconButton title="Edit" primary type="button" onClick={() => startEditEntry(e)}>
                              <Pencil size={15} strokeWidth={1.75} />
                            </IconButton>
                            <IconButton
                              title="Delete"
                              danger
                              type="button"
                              disabled={deleteProduction.isPending}
                              onClick={() => {
                                if (window.confirm('Delete this hourly entry?')) deleteProduction.mutate(e.id);
                              }}
                            >
                              <Trash2 size={15} strokeWidth={1.75} />
                            </IconButton>
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                    {hourlyLog.length === 0 ? (
                      <tr>
                        <td colSpan={14} style={{ color: 'var(--muted)' }}>
                          No hourly entries yet
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="panel p-4">
              <h3 className="mb-3 font-semibold">Downtime Log</h3>
              <div className="table-wrap fit-cols">
                <table className="data entry-log">
                  <colgroup>
                    <col style={{ width: '15%' }} />
                    <col style={{ width: '13%' }} />
                    <col style={{ width: '16%' }} />
                    <col style={{ width: '7%' }} />
                    <col style={{ width: '7%' }} />
                    <col style={{ width: '6%' }} />
                    <col style={{ width: '26%' }} />
                    <col style={{ width: '5.25rem' }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Machine</th>
                      <th>Category</th>
                      <th>Reason</th>
                      <th>Start</th>
                      <th>End</th>
                      <th>Mins</th>
                      <th>Action Plan</th>
                      <th className="col-actions">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {downtimeLog.map((d) => (
                      <tr key={d.id} className={editingDowntimeId === d.id ? 'bg-blue-50/40' : undefined}>
                        <td title={d.machine?.code || d.machine?.name || ''}>{d.machine?.code || d.machine?.name || '—'}</td>
                        <td className="wrap" title={d.category?.name || ''}>{d.category?.name || '—'}</td>
                        <td className="wrap" title={d.reason?.name || ''}>{d.reason?.name || '—'}</td>
                        <td>{formatTime24(d.startTime)}</td>
                        <td>{formatTime24(d.endTime)}</td>
                        <td>{d.durationMins}</td>
                        <td className="wrap" title={d.actionTaken || ''}>{d.actionTaken || '—'}</td>
                        <td className="col-actions">
                          <div className="row-actions">
                            <IconButton title="Edit" primary type="button" onClick={() => startEditDowntime(d)}>
                              <Pencil size={15} strokeWidth={1.75} />
                            </IconButton>
                            <IconButton
                              title="Delete"
                              danger
                              type="button"
                              disabled={deleteDowntime.isPending}
                              onClick={() => {
                                if (window.confirm('Delete this downtime entry?')) deleteDowntime.mutate(d.id);
                              }}
                            >
                              <Trash2 size={15} strokeWidth={1.75} />
                            </IconButton>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {downtimeLog.length === 0 ? (
                      <tr>
                        <td colSpan={8} style={{ color: 'var(--muted)' }}>
                          No downtime logged
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      ) : planId ? null : (
        <div className="panel p-4 text-sm" style={{ color: 'var(--muted)' }}>
          Select a work order to enter hourly production and downtime.
        </div>
      )}
    </div>
  );
}
