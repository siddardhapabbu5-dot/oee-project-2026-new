import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import api, { type ApiResponse } from '../lib/api';
import { Field, LoadingBlock, PageHeader, KpiCard } from '../components/ui';
import { formatWorkOrder } from '../lib/workOrder';
import { StatusBadge } from '../components/CrudPage';

type PlanDetail = {
  id: string;
  planNumber: string;
  plannedCases: number;
  plannedStartTime: string;
  plannedEndTime: string;
  batchNumber: string;
  product: { id: string; name: string };
  sku: { code: string };
  line: { id?: string; name: string };
  shift: { name: string };
  productionEntries: Array<{
    id: string;
    hourStart: string;
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
    category?: { name: string } | null;
    reason?: { name: string } | null;
  }>;
  changeoverEntries: Array<{
    id: string;
    actualMins: number;
    fromProduct?: { name: string } | null;
    toProduct?: { name: string } | null;
  }>;
};

export default function ShopFloorPage() {
  const [planId, setPlanId] = useState('');
  const [tab, setTab] = useState<'production' | 'downtime' | 'changeover' | 'manpower' | 'close'>('production');
  const [form, setForm] = useState<Record<string, string>>({});
  const qc = useQueryClient();

  const plans = useQuery({
    queryKey: ['plans-shop'],
    queryFn: async () =>
      (await api.get<ApiResponse<Array<{ id: string; planNumber: string; line: { name: string }; shift: { name: string }; productionDate: string }>>>('/plans', { params: { limit: 50 } })).data.data,
  });

  useEffect(() => {
    if (!planId && plans.data?.[0]) setPlanId(plans.data[0].id);
  }, [plans.data, planId]);

  const plan = useQuery({
    queryKey: ['plan', planId],
    enabled: !!planId,
    queryFn: async () => (await api.get<ApiResponse<PlanDetail>>(`/plans/${planId}`)).data.data,
  });

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
    queryKey: ['machines-shop', (plan.data as { line?: { id?: string } } | undefined)?.line?.id ?? 'all'],
    queryFn: async () => {
      const lineId = (plan.data as { line?: { id?: string } } | undefined)?.line?.id;
      return (
        await api.get<ApiResponse<Array<{ id: string; name: string }>>>('/machines', {
          params: { limit: 200, ...(lineId ? { lineId } : {}) },
        })
      ).data.data;
    },
  });

  const machineOptions = useMemo(() => {
    const order = new Map(MACHINE_ORDER.map((name, i) => [name, i]));
    return [...(machines.data ?? [])].sort((a, b) => {
      const ai = order.get(a.name) ?? 999;
      const bi = order.get(b.name) ?? 999;
      return ai - bi || a.name.localeCompare(b.name);
    });
  }, [machines.data]);

  const categories = useQuery({
    queryKey: ['dt-cats'],
    queryFn: async () =>
      (await api.get<ApiResponse<Array<{ id: string; name: string; reasons: Array<{ id: string; name: string }> }>>>('/downtime-categories')).data.data,
  });
  const coTypes = useQuery({
    queryKey: ['co-types'],
    queryFn: async () => (await api.get<ApiResponse<Array<{ id: string; name: string; standardMins: number }>>>('/changeover-types')).data.data,
  });
  const products = useQuery({
    queryKey: ['products'],
    queryFn: async () => (await api.get<ApiResponse<Array<{ id: string; name: string }>>>('/products', { params: { limit: 100 } })).data.data,
  });

  const reasons = useMemo(() => {
    const cat = (categories.data ?? []).find((c) => c.id === form.categoryId);
    return cat?.reasons ?? [];
  }, [categories.data, form.categoryId]);

  const hourlyPlanned = plan.data ? plan.data.plannedCases / 8 : 0;

  useEffect(() => {
    if (plan.data && tab === 'production') {
      setForm((f) => ({
        ...f,
        plannedCases: String(Math.round(hourlyPlanned)),
        actualCases: f.actualCases || '',
        goodCases: f.goodCases || '',
        rejectCases: f.rejectCases || '0',
      }));
    }
  }, [plan.data, tab, hourlyPlanned]);

  const saveProduction = useMutation({
    mutationFn: async () => {
      const start = form.hourStart || new Date().toISOString().slice(0, 13) + ':00:00';
      const endDate = new Date(start);
      endDate.setHours(endDate.getHours() + 1);
      return api.post('/production-entries', {
        planId,
        hourStart: start,
        hourEnd: endDate.toISOString(),
        plannedCases: Number(form.plannedCases),
        actualCases: Number(form.actualCases),
        goodCases: Number(form.goodCases),
        rejectCases: Number(form.rejectCases || 0),
        remarks: form.remarks || null,
      });
    },
    onSuccess: async () => {
      toast.success('Production entry saved');
      setForm({});
      await qc.invalidateQueries({ queryKey: ['plan', planId] });
    },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || 'Failed'),
  });

  const saveDowntime = useMutation({
    mutationFn: async () =>
      api.post('/downtime-entries', {
        planId,
        machineId: form.machineId || null,
        ...(form.categoryId ? { categoryId: form.categoryId } : {}),
        reason: form.reason || null,
        reasonId: form.reasonId || null,
        startTime: form.startTime,
        endTime: form.endTime,
        actionTaken: form.actionTaken || null,
        remarks: form.remarks || null,
      }),
    onSuccess: async () => {
      toast.success('Downtime logged');
      setForm({});
      await qc.invalidateQueries({ queryKey: ['plan', planId] });
    },
  });

  const saveChangeover = useMutation({
    mutationFn: async () =>
      api.post('/changeover-entries', {
        planId,
        changeoverTypeId: form.changeoverTypeId,
        fromProductId: form.fromProductId,
        toProductId: form.toProductId,
        kind: form.kind || 'PLANNED',
        standardMins: Number(form.standardMins),
        actualMins: Number(form.actualMins),
        reason: form.reason || null,
        remarks: form.remarks || null,
      }),
    onSuccess: async () => {
      toast.success('Changeover saved');
      setForm({});
      await qc.invalidateQueries({ queryKey: ['plan', planId] });
    },
  });

  const saveManpower = useMutation({
    mutationFn: async () =>
      api.post('/manpower-entries', {
        planId,
        headcount: Number(form.headcount),
        operators: Number(form.operators || 0),
        helpers: Number(form.helpers || 0),
        overtimeMins: form.overtimeMins !== undefined && form.overtimeMins !== '' ? Number(form.overtimeMins) : null,
        remarks: form.remarks || null,
      }),
    onSuccess: async () => {
      toast.success('Manpower recorded');
      setForm({});
      await qc.invalidateQueries({ queryKey: ['plan', planId] });
    },
  });

  const closeShift = useMutation({
    mutationFn: async () => api.post('/shift-closings', { planId, remarks: form.remarks || null }),
    onSuccess: async () => {
      toast.success('Shift closed');
      await qc.invalidateQueries({ queryKey: ['plan', planId] });
      await qc.invalidateQueries({ queryKey: ['plans-shop'] });
    },
  });

  if (plans.isLoading) return <LoadingBlock />;
  const p = plan.data;

  const actual = p?.productionEntries.reduce((s, e) => s + e.actualCases, 0) ?? 0;
  const good = p?.productionEntries.reduce((s, e) => s + e.goodCases, 0) ?? 0;
  const reject = p?.productionEntries.reduce((s, e) => s + e.rejectCases, 0) ?? 0;
  const loss = Math.max(0, (p?.plannedCases ?? 0) - actual);

  return (
    <div>
      <PageHeader title="Shop Floor Entry" subtitle="Hourly production, downtime, changeover, manpower, and shift closing" />
      <div className="panel mb-4 p-4">
        <Field label="Assigned Work Order">
          <select className="input" value={planId} onChange={(e) => setPlanId(e.target.value)}>
            {(plans.data ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {formatWorkOrder(item.planNumber)} — {item.line.name} / {item.shift.name} / {item.productionDate.slice(0, 10)}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {plan.isLoading ? (
        <LoadingBlock />
      ) : p ? (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <KpiCard label="Work Order" value={formatWorkOrder(p.planNumber)} hint={`${p.line.name} · ${p.shift.name}`} />
            <KpiCard label="Planned Cases" value={p.plannedCases.toLocaleString()} />
            <KpiCard label="Actual Cases" value={actual.toLocaleString()} />
            <KpiCard label="Good / Reject" value={`${good} / ${reject}`} />
            <KpiCard label="Loss" value={loss.toLocaleString()} tone="warn" />
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            {(['production', 'downtime', 'changeover', 'manpower', 'close'] as const).map((t) => (
              <button key={t} className={`btn ${tab === t ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab(t)}>
                {t === 'close' ? 'Shift Closing' : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="panel p-4">
              {tab === 'production' && (
                <>
                  <h3 className="mb-3 font-semibold">Hourly Production Entry</h3>
                  <Field label="Hour Start">
                    <input className="input" type="datetime-local" value={form.hourStart || ''} onChange={(e) => setForm({ ...form, hourStart: e.target.value })} />
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Planned Cases"><input className="input" type="number" value={form.plannedCases || ''} onChange={(e) => setForm({ ...form, plannedCases: e.target.value })} /></Field>
                    <Field label="Actual Cases"><input className="input" type="number" value={form.actualCases || ''} onChange={(e) => setForm({ ...form, actualCases: e.target.value })} /></Field>
                    <Field label="Good Cases"><input className="input" type="number" value={form.goodCases || ''} onChange={(e) => setForm({ ...form, goodCases: e.target.value })} /></Field>
                    <Field label="Reject Cases"><input className="input" type="number" value={form.rejectCases || ''} onChange={(e) => setForm({ ...form, rejectCases: e.target.value })} /></Field>
                  </div>
                  <Field label="Remarks"><input className="input" value={form.remarks || ''} onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></Field>
                  <button className="btn btn-primary w-full" onClick={() => saveProduction.mutate()}>Submit Entry</button>
                </>
              )}
              {tab === 'downtime' && (
                <>
                  <h3 className="mb-3 font-semibold">Downtime Entry</h3>
                  <Field label="Machine">
                    <select className="input" value={form.machineId || ''} onChange={(e) => setForm({ ...form, machineId: e.target.value })}>
                      <option value="">Select machine...</option>
                      {machineOptions.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Category">
                    <select
                      className="input"
                      value={form.categoryId || ''}
                      onChange={(e) => setForm({ ...form, categoryId: e.target.value, reason: '', reasonId: '' })}
                    >
                      <option value="">Select category...</option>
                      {(categories.data ?? []).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Reason">
                    <input
                      className="input"
                      list="shopfloor-downtime-reasons"
                      value={form.reason || ''}
                      onChange={(e) => {
                        const name = e.target.value;
                        const match = reasons.find((r) => r.name === name);
                        setForm({ ...form, reason: name, reasonId: match?.id || '' });
                      }}
                      placeholder="Type reason..."
                      autoComplete="off"
                    />
                    <datalist id="shopfloor-downtime-reasons">
                      {reasons.map((r) => (
                        <option key={r.id} value={r.name} />
                      ))}
                    </datalist>
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Start"><input className="input" type="datetime-local" value={form.startTime || ''} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /></Field>
                    <Field label="End"><input className="input" type="datetime-local" value={form.endTime || ''} onChange={(e) => setForm({ ...form, endTime: e.target.value })} /></Field>
                  </div>
                  <Field label="Action Taken"><input className="input" value={form.actionTaken || ''} onChange={(e) => setForm({ ...form, actionTaken: e.target.value })} /></Field>
                  <button className="btn btn-primary w-full" onClick={() => saveDowntime.mutate()}>Save Downtime</button>
                </>
              )}
              {tab === 'changeover' && (
                <>
                  <h3 className="mb-3 font-semibold">Changeover Entry</h3>
                  <Field label="Type">
                    <select className="input" value={form.changeoverTypeId || ''} onChange={(e) => {
                      const id = e.target.value;
                      const t = (coTypes.data ?? []).find((x) => x.id === id);
                      setForm((prev) => ({
                        ...prev,
                        changeoverTypeId: id,
                        standardMins: id ? String(t?.standardMins ?? '') : '',
                      }));
                    }}>
                      <option value="">Select...</option>
                      {(coTypes.data ?? []).map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.standardMins} min)
                        </option>
                      ))}
                    </select>
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="From Product">
                      <select className="input" value={form.fromProductId || ''} onChange={(e) => setForm({ ...form, fromProductId: e.target.value })}>
                        <option value="">Select...</option>
                        {(products.data ?? []).map((pr) => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
                      </select>
                    </Field>
                    <Field label="To Product">
                      <select className="input" value={form.toProductId || ''} onChange={(e) => setForm({ ...form, toProductId: e.target.value })}>
                        <option value="">Select...</option>
                        {(products.data ?? []).map((pr) => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
                      </select>
                    </Field>
                    <Field label="Standard (min)">
                      <input
                        className="input"
                        type="number"
                        readOnly
                        value={form.standardMins || ''}
                        placeholder="Auto from type"
                        style={{ background: 'var(--panel-2)' }}
                      />
                    </Field>
                    <Field label="Actual (min)"><input className="input" type="number" value={form.actualMins || ''} onChange={(e) => setForm({ ...form, actualMins: e.target.value })} /></Field>
                  </div>
                  <Field label="Planned / Unplanned">
                    <select className="input" value={form.kind || 'PLANNED'} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                      <option value="PLANNED">Planned</option>
                      <option value="UNPLANNED">Unplanned</option>
                    </select>
                  </Field>
                  <button className="btn btn-primary w-full" onClick={() => saveChangeover.mutate()}>Save Changeover</button>
                </>
              )}
              {tab === 'manpower' && (
                <>
                  <h3 className="mb-3 font-semibold">Manpower Entry</h3>
                  <Field label="Headcount (Present)">
                    <input className="input" type="number" value={form.headcount || ''} onChange={(e) => setForm({ ...form, headcount: e.target.value })} />
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Operators">
                      <input className="input" type="number" value={form.operators || ''} onChange={(e) => setForm({ ...form, operators: e.target.value })} />
                    </Field>
                    <Field label="Helpers">
                      <input className="input" type="number" value={form.helpers || ''} onChange={(e) => setForm({ ...form, helpers: e.target.value })} />
                    </Field>
                    <Field label="Overtime (mins)">
                      <input className="input" type="number" value={form.overtimeMins || ''} onChange={(e) => setForm({ ...form, overtimeMins: e.target.value })} />
                    </Field>
                  </div>
                  <button className="btn btn-primary w-full" onClick={() => saveManpower.mutate()}>
                    Save Manpower
                  </button>
                </>
              )}
              {tab === 'close' && (
                <>
                  <h3 className="mb-3 font-semibold">Shift Closing</h3>
                  <p className="mb-3 text-sm" style={{ color: 'var(--muted)' }}>
                    Closing will summarize planned/actual/good/reject/downtime and mark the plan completed.
                  </p>
                  <Field label="Closing Remarks"><input className="input" value={form.remarks || ''} onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></Field>
                  <button className="btn btn-primary w-full" onClick={() => closeShift.mutate()}>Close Shift</button>
                </>
              )}
            </div>

            <div className="panel p-4">
              <h3 className="mb-3 font-semibold">Hourly Entries</h3>
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Hour</th>
                      <th>Plan</th>
                      <th>Actual</th>
                      <th>Good</th>
                      <th>Reject</th>
                      <th>Loss</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.productionEntries.map((e) => (
                      <tr key={e.id}>
                        <td>
                          {(() => {
                            const d = new Date(e.hourStart);
                            if (Number.isNaN(d.getTime())) return '—';
                            return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                          })()}
                        </td>
                        <td>{e.plannedCases}</td>
                        <td>{e.actualCases}</td>
                        <td>{e.goodCases}</td>
                        <td>{e.rejectCases}</td>
                        <td>{e.lossCases}</td>
                        <td><StatusBadge status={e.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h3 className="mb-2 mt-4 font-semibold">Downtime</h3>
              <ul className="space-y-1 text-sm">
                {p.downtimeEntries.map((d) => (
                  <li key={d.id}>
                    {(d.category?.name || 'Downtime')} / {(d.reason?.name || '—')} — {d.durationMins} min
                  </li>
                ))}
                {p.downtimeEntries.length === 0 ? <li style={{ color: 'var(--muted)' }}>No downtime logged</li> : null}
              </ul>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
