import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api, { type ApiResponse } from '../../lib/api';
import { formatWorkOrder } from '../../lib/workOrder';
import { Field } from '../../components/ui';
import { fmtNum, localYmd } from '../lib/dates';
import {
  combineShiftDateTime,
  formatTime24,
  minsBetweenTimes,
  nextFreePlanSlot,
  shiftAnchorMins,
  shiftOrderKey,
  toTimeOnly,
} from '../lib/shiftTime';

type PlanListItem = {
  id: string;
  planNumber: string;
  productionDate: string;
  plannedCases?: number;
  line: { id?: string; name: string };
  shift: { id?: string; name: string };
  product?: { name: string };
};

type PlanDetail = {
  id: string;
  planNumber: string;
  productionDate: string;
  plannedCases: number;
  plannedOperatingMins: number;
  plannedStartTime: string;
  plannedEndTime: string;
  product: { name: string };
  sku: { code: string };
  line: { id: string; name: string };
  shift: { name: string };
  productionEntries: Array<{
    id: string;
    hourStart: string;
    hourEnd: string;
    plannedCases: number;
    actualCases: number;
    goodCases: number;
    rejectCases: number;
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
    reason?: { name: string } | null;
    category?: { name: string } | null;
    machine?: { name?: string } | null;
  }>;
};

const MACHINE_ORDER = [
  'Blow Mould',
  'Filler',
  'Capper',
  'Labeling Machine',
  'Shrink Wrapper',
  'Case Packer',
  'Palletizer',
  'RO Plant',
  'Other',
];

export default function MobileFloorPage() {
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const today = localYmd();
  const [date, setDate] = useState(today);
  const [planId, setPlanId] = useState(params.get('planId') || '');
  const [tab, setTab] = useState<'production' | 'downtime'>(
    params.get('tab') === 'downtime' ? 'downtime' : 'production',
  );
  const [prodForm, setProdForm] = useState<Record<string, string>>({});
  const [dtForm, setDtForm] = useState<Record<string, string>>({});
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editingDowntimeId, setEditingDowntimeId] = useState<string | null>(null);

  useEffect(() => {
    const nextPlan = params.get('planId') || '';
    if (nextPlan && nextPlan !== planId) setPlanId(nextPlan);
    if (params.get('tab') === 'downtime') setTab('downtime');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const plans = useQuery({
    queryKey: ['mobile-floor-plans', date],
    queryFn: async () =>
      (
        await api.get<ApiResponse<PlanListItem[]>>('/plans', {
          params: { from: date, to: date, limit: 50 },
        })
      ).data.data,
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    const rows = plans.data ?? [];
    if (planId && rows.some((r) => r.id === planId)) return;
    const next = rows[0]?.id || '';
    if (next === planId) return;
    setPlanId(next);
    setParams(
      (prev) => {
        const copy = new URLSearchParams(prev);
        if (next) copy.set('planId', next);
        else copy.delete('planId');
        return copy;
      },
      { replace: true },
    );
  }, [plans.data, planId, setParams]);

  const plan = useQuery({
    queryKey: ['plan', planId],
    enabled: Boolean(planId),
    queryFn: async () => (await api.get<ApiResponse<PlanDetail>>(`/plans/${planId}`)).data.data,
  });

  const p = plan.data;

  const machines = useQuery({
    queryKey: ['machines', p?.line?.id ?? 'all'],
    enabled: tab === 'downtime',
    queryFn: async () =>
      (
        await api.get<ApiResponse<Array<{ id: string; name: string; code: string }>>>('/machines', {
          params: { limit: 200, ...(p?.line?.id ? { lineId: p.line.id } : {}) },
        })
      ).data.data,
  });

  const categories = useQuery({
    queryKey: ['dt-cats'],
    enabled: tab === 'downtime',
    queryFn: async () =>
      (
        await api.get<ApiResponse<Array<{ id: string; name: string; code: string }>>>('/downtime-categories')
      ).data.data,
  });

  const machineOptions = useMemo(() => {
    const order = new Map(MACHINE_ORDER.map((name, i) => [name, i]));
    return [...(machines.data ?? [])].sort(
      (a, b) => (order.get(a.name) ?? 999) - (order.get(b.name) ?? 999) || a.name.localeCompare(b.name),
    );
  }, [machines.data]);

  const hourTarget = useMemo(() => {
    if (!p?.plannedCases) return 0;
    const fromOp = p.plannedOperatingMins ? Math.round(p.plannedOperatingMins / 60) : 0;
    const start = new Date(p.plannedStartTime).getTime();
    const end = new Date(p.plannedEndTime).getTime();
    const fromSpan = Math.max(1, Math.round((end - start) / 3600000) || 0);
    const hours = fromOp || fromSpan || 8;
    return Math.round(p.plannedCases / hours);
  }, [p]);

  useEffect(() => {
    if (!p || editingEntryId) return;
    const slot = nextFreePlanSlot(p.plannedStartTime, p.plannedEndTime, p.productionEntries);
    setProdForm({
      plannedCases: String(hourTarget),
      productionCases: '',
      acceptedCases: '',
      holdCases: '',
      remarks: '',
      timeFrom: slot.from,
      timeTo: slot.to,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.id, hourTarget, editingEntryId]);

  const planDate = p?.productionDate?.slice(0, 10) || date;
  const durationMins = useMemo(
    () => minsBetweenTimes(planDate, dtForm.startTime, dtForm.endTime),
    [planDate, dtForm.startTime, dtForm.endTime],
  );

  const saveProduction = useMutation({
    mutationFn: async () => {
      if (!planId) throw new Error('Select a work order first');
      const planned = Number(prodForm.plannedCases || 0);
      const actual = Number(prodForm.productionCases || 0);
      const accepted =
        prodForm.acceptedCases !== undefined && prodForm.acceptedCases !== ''
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
      toast.success(editingEntryId ? 'Hour updated' : 'Hour saved');
      setEditingEntryId(null);
      const slot = nextFreePlanSlot(p?.plannedStartTime, p?.plannedEndTime, [
        ...(p?.productionEntries ?? []),
        {
          hourStart: combineShiftDateTime(
            planDate,
            prodForm.timeFrom || '06:00',
            shiftAnchorMins(p?.plannedStartTime),
          ).toISOString(),
        },
      ]);
      setProdForm((f) => ({
        ...f,
        productionCases: '',
        acceptedCases: '',
        holdCases: '',
        remarks: '',
        plannedCases: String(hourTarget),
        timeFrom: slot.from,
        timeTo: slot.to,
      }));
      await qc.invalidateQueries({ queryKey: ['plan', planId] });
      await qc.invalidateQueries({ queryKey: ['mobile-kpis'] });
    },
    onError: (e: unknown) =>
      toast.error(
        (e as { response?: { data?: { error?: { message?: string } } }; message?: string })?.response?.data?.error
          ?.message ||
          (e as Error).message ||
          'Save failed',
      ),
  });

  const saveDowntime = useMutation({
    mutationFn: async () => {
      if (!planId) throw new Error('Select a work order first');
      if (!dtForm.categoryId) throw new Error('Select a category');
      if (!String(dtForm.reason || '').trim()) throw new Error('Enter a reason');
      if (!dtForm.startTime || !dtForm.endTime) throw new Error('Enter start and end time');
      const anchor = shiftAnchorMins(p?.plannedStartTime);
      const startTime = combineShiftDateTime(planDate, dtForm.startTime, anchor);
      let endTime = combineShiftDateTime(planDate, dtForm.endTime, anchor);
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
      toast.success(editingDowntimeId ? 'Stop updated' : 'Stop saved');
      setEditingDowntimeId(null);
      setDtForm({ categoryId: dtForm.categoryId, machineId: '', reason: '', startTime: '', endTime: '', actionPlan: '' });
      await qc.invalidateQueries({ queryKey: ['plan', planId] });
      await qc.invalidateQueries({ queryKey: ['mobile-kpis'] });
    },
    onError: (e: unknown) =>
      toast.error(
        (e as { response?: { data?: { error?: { message?: string } } }; message?: string })?.response?.data?.error
          ?.message ||
          (e as Error).message ||
          'Save failed',
      ),
  });

  const entries = useMemo(() => {
    const list = p?.productionEntries ?? [];
    const anchor = shiftAnchorMins(p?.plannedStartTime);
    return [...list].sort((a, b) => shiftOrderKey(a.hourStart, anchor) - shiftOrderKey(b.hourStart, anchor));
  }, [p?.productionEntries, p?.plannedStartTime]);

  return (
    <div>
      <div className="phone-filters">
        <Field label="Date" className="mb-0">
          <input className="phone-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Work order" className="mb-0">
          <select
            className="phone-select"
            value={planId}
            onChange={(e) => {
              setPlanId(e.target.value);
              setEditingEntryId(null);
              setEditingDowntimeId(null);
              setParams(
                (prev) => {
                  const copy = new URLSearchParams(prev);
                  copy.set('planId', e.target.value);
                  return copy;
                },
                { replace: true },
              );
            }}
          >
            {(plans.data ?? []).length === 0 ? <option value="">No work orders</option> : null}
            {(plans.data ?? []).map((row) => (
              <option key={row.id} value={row.id}>
                {formatWorkOrder(row.planNumber)} · {row.line.name} · {row.shift.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {p ? (
        <div className="panel phone-card mb-3">
          <div className="font-semibold">{p.product.name}</div>
          <div className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            {p.line.name} · {p.shift.name} · SKU {p.sku.code}
          </div>
          <div className="mt-2 text-sm">
            Planned <strong>{fmtNum(p.plannedCases)}</strong> · Logged{' '}
            <strong>{fmtNum(entries.reduce((s, e) => s + e.actualCases, 0))}</strong>
          </div>
        </div>
      ) : null}

      <div className="phone-seg" role="tablist">
        <button
          type="button"
          className={tab === 'production' ? 'is-on' : ''}
          onClick={() => {
            setTab('production');
            setParams(
              (prev) => {
                const copy = new URLSearchParams(prev);
                copy.delete('tab');
                return copy;
              },
              { replace: true },
            );
          }}
        >
          Output
        </button>
        <button
          type="button"
          className={tab === 'downtime' ? 'is-on' : ''}
          onClick={() => {
            setTab('downtime');
            setParams(
              (prev) => {
                const copy = new URLSearchParams(prev);
                copy.set('tab', 'downtime');
                return copy;
              },
              { replace: true },
            );
          }}
        >
          Stops
        </button>
      </div>

      {!planId ? <div className="phone-empty panel">Pick a date with a work order to log from the line.</div> : null}

      {tab === 'production' && planId ? (
        <>
          {entries.length === 0 ? <div className="phone-empty panel mb-3">No hours logged yet.</div> : null}
          {entries.map((e) => (
            <button
              key={e.id}
              type="button"
              className="panel phone-card"
              style={{ width: '100%', textAlign: 'left' }}
              onClick={() => {
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
              }}
            >
              <div className="phone-wo__row">
                <span className="font-semibold">
                  {formatTime24(e.hourStart)}–{formatTime24(e.hourEnd)}
                </span>
                <span>{fmtNum(e.actualCases)} cases</span>
              </div>
              <div className="phone-wo__meta">
                Target {fmtNum(e.plannedCases)} · Good {fmtNum(e.goodCases)} · Hold {fmtNum(e.rejectCases)}
                {editingEntryId === e.id ? ' · editing' : ''}
              </div>
            </button>
          ))}

          <div className="panel p-3 mt-3 mb-3">
            <div className="phone-grid-2">
              <Field label="From" className="mb-0">
                <input
                  className="phone-input"
                  type="time"
                  value={prodForm.timeFrom || ''}
                  onChange={(e) => setProdForm((f) => ({ ...f, timeFrom: e.target.value }))}
                />
              </Field>
              <Field label="To" className="mb-0">
                <input
                  className="phone-input"
                  type="time"
                  value={prodForm.timeTo || ''}
                  onChange={(e) => setProdForm((f) => ({ ...f, timeTo: e.target.value }))}
                />
              </Field>
              <Field label="Target" className="mb-0">
                <input
                  className="phone-input"
                  inputMode="numeric"
                  value={prodForm.plannedCases || ''}
                  onChange={(e) => setProdForm((f) => ({ ...f, plannedCases: e.target.value }))}
                />
              </Field>
              <Field label="Produced" className="mb-0">
                <input
                  className="phone-input"
                  inputMode="numeric"
                  value={prodForm.productionCases || ''}
                  onChange={(e) => setProdForm((f) => ({ ...f, productionCases: e.target.value }))}
                />
              </Field>
              <Field label="Accepted" className="mb-0">
                <input
                  className="phone-input"
                  inputMode="numeric"
                  value={prodForm.acceptedCases || ''}
                  onChange={(e) => setProdForm((f) => ({ ...f, acceptedCases: e.target.value }))}
                />
              </Field>
              <Field label="Hold" className="mb-0">
                <input
                  className="phone-input"
                  inputMode="numeric"
                  value={prodForm.holdCases || ''}
                  onChange={(e) => setProdForm((f) => ({ ...f, holdCases: e.target.value }))}
                />
              </Field>
            </div>
            <Field label="Remarks" className="mt-3 mb-0">
              <textarea
                className="phone-textarea"
                value={prodForm.remarks || ''}
                onChange={(e) => setProdForm((f) => ({ ...f, remarks: e.target.value }))}
              />
            </Field>
            <div className="mt-3 flex gap-2">
              {editingEntryId ? (
                <button
                  type="button"
                  className="phone-btn phone-btn--ghost"
                  onClick={() => {
                    setEditingEntryId(null);
                    if (!p) return;
                    const slot = nextFreePlanSlot(p.plannedStartTime, p.plannedEndTime, p.productionEntries);
                    setProdForm({
                      plannedCases: String(hourTarget),
                      productionCases: '',
                      acceptedCases: '',
                      holdCases: '',
                      remarks: '',
                      timeFrom: slot.from,
                      timeTo: slot.to,
                    });
                  }}
                >
                  Cancel
                </button>
              ) : null}
              <button
                type="button"
                className="phone-btn"
                disabled={saveProduction.isPending}
                onClick={() => saveProduction.mutate()}
              >
                {saveProduction.isPending ? 'Saving…' : editingEntryId ? 'Update hour' : 'Save hour'}
              </button>
            </div>
          </div>
        </>
      ) : null}

      {tab === 'downtime' && planId ? (
        <>
          {(p?.downtimeEntries ?? []).length === 0 ? (
            <div className="phone-empty panel mb-3">No stops logged yet.</div>
          ) : null}
          {(p?.downtimeEntries ?? []).map((d) => (
            <button
              key={d.id}
              type="button"
              className="panel phone-card"
              style={{ width: '100%', textAlign: 'left' }}
              onClick={() => {
                setEditingDowntimeId(d.id);
                setDtForm({
                  machineId: d.machineId || '',
                  categoryId: d.categoryId,
                  reason: d.reason?.name || '',
                  startTime: toTimeOnly(new Date(d.startTime)),
                  endTime: toTimeOnly(new Date(d.endTime)),
                  actionPlan: d.actionTaken || '',
                  remarks: d.remarks || '',
                });
              }}
            >
              <div className="phone-wo__row">
                <span className="font-semibold">
                  {formatTime24(d.startTime)}–{formatTime24(d.endTime)}
                </span>
                <span>{d.durationMins} min</span>
              </div>
              <div className="phone-wo__meta">
                {d.machine?.name || 'Machine n/a'} · {d.category?.name || '—'} · {d.reason?.name || ''}
                {editingDowntimeId === d.id ? ' · editing' : ''}
              </div>
            </button>
          ))}

          <div className="panel p-3 mt-3 mb-3">
            <Field label="Machine" className="mb-3">
              <select
                className="phone-select"
                value={dtForm.machineId || ''}
                onChange={(e) => setDtForm((f) => ({ ...f, machineId: e.target.value }))}
              >
                <option value="">Any / not set</option>
                {machineOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Category" className="mb-3">
              <select
                className="phone-select"
                value={dtForm.categoryId || ''}
                onChange={(e) => setDtForm((f) => ({ ...f, categoryId: e.target.value }))}
              >
                <option value="">Select category</option>
                {(categories.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Reason" className="mb-3">
              <input
                className="phone-input"
                value={dtForm.reason || ''}
                onChange={(e) => setDtForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="Why did the line stop?"
              />
            </Field>
            <div className="phone-grid-2">
              <Field label="Start" className="mb-0">
                <input
                  className="phone-input"
                  type="time"
                  value={dtForm.startTime || ''}
                  onChange={(e) => setDtForm((f) => ({ ...f, startTime: e.target.value }))}
                />
              </Field>
              <Field label="End" className="mb-0">
                <input
                  className="phone-input"
                  type="time"
                  value={dtForm.endTime || ''}
                  onChange={(e) => setDtForm((f) => ({ ...f, endTime: e.target.value }))}
                />
              </Field>
            </div>
            <div className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
              Duration {durationMins ? `${durationMins} min` : '—'}
            </div>
            <Field label="Action taken" className="mt-3 mb-0">
              <textarea
                className="phone-textarea"
                value={dtForm.actionPlan || ''}
                onChange={(e) => setDtForm((f) => ({ ...f, actionPlan: e.target.value }))}
              />
            </Field>
            <div className="mt-3 flex gap-2">
              {editingDowntimeId ? (
                <button
                  type="button"
                  className="phone-btn phone-btn--ghost"
                  onClick={() => {
                    setEditingDowntimeId(null);
                    setDtForm({});
                  }}
                >
                  Cancel
                </button>
              ) : null}
              <button
                type="button"
                className="phone-btn"
                disabled={saveDowntime.isPending}
                onClick={() => saveDowntime.mutate()}
              >
                {saveDowntime.isPending ? 'Saving…' : editingDowntimeId ? 'Update stop' : 'Save stop'}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
