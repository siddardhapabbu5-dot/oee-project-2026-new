import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { CalendarDays, FileSpreadsheet } from 'lucide-react';
import api, { type ApiResponse } from '../lib/api';
import { FilterBar, FilterField, FILTER_CTRL } from '../components/FilterBar';
import { LoadingBlock, PageHeader } from '../components/ui';
import { downtimeColor, metricColor } from '../lib/metricBands';

type DayWiseRow = {
  date: string;
  lineId: string;
  lineCode: string;
  lineName: string;
  plantName: string;
  plannedProductionTimeMins: number;
  downtimeMins: number;
  operatingTimeMins: number;
  targetCases: number;
  actualCases: number;
  availability: number;
  performance: number;
  quality: number;
  oee: number;
};

type DayWisePayload = {
  from: string;
  to: string;
  rowCount: number;
  rows: DayWiseRow[];
};

function localYmd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function today() {
  return localYmd(new Date());
}

function monthStart() {
  const d = new Date();
  return localYmd(new Date(d.getFullYear(), d.getMonth(), 1));
}

function fmtDate(iso: string) {
  if (!iso || iso.length < 10) return iso;
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function PctCell({
  kind,
  value,
}: {
  kind: 'availability' | 'performance' | 'quality' | 'oee';
  value: number;
}) {
  const color = metricColor(kind, value);
  return (
    <td className="tabular-nums font-semibold" style={{ color }}>
      {Number(value).toFixed(1)}%
    </td>
  );
}

export default function DayWiseOeePage() {
  const [from, setFrom] = useState(() => monthStart());
  const [to, setTo] = useState(() => today());
  const [lineId, setLineId] = useState('');
  const [downloading, setDownloading] = useState(false);

  const rangeValid = Boolean(from && to && from <= to);

  const lines = useQuery({
    queryKey: ['lines-day-wise'],
    queryFn: async () =>
      (await api.get<ApiResponse<Array<{ id: string; name: string; code: string }>>>('/lines', { params: { limit: 100 } })).data
        .data,
  });

  const report = useQuery({
    queryKey: ['day-wise-oee', from, to, lineId],
    enabled: rangeValid,
    queryFn: async () =>
      (
        await api.get<ApiResponse<DayWisePayload>>('/dashboard/day-wise', {
          params: {
            from,
            to,
            ...(lineId ? { lineId } : {}),
          },
        })
      ).data.data,
  });

  const rows = report.data?.rows ?? [];

  async function downloadExcel() {
    if (!rangeValid || downloading) return;
    setDownloading(true);
    try {
      const res = await api.get('/dashboard/day-wise/export/excel', {
        responseType: 'blob',
        params: {
          from,
          to,
          ...(lineId ? { lineId } : {}),
        },
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `day-wise-oee-${from}_${to}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Excel downloaded');
    } catch {
      toast.error('Excel download failed');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Day-wise OEE"
        subtitle="Date × line sheet — planned time, downtime, operating time, cases & A / P / Q"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-sm" style={{ color: 'var(--muted)' }}>
              <CalendarDays size={16} />
              {rows.length} row{rows.length === 1 ? '' : 's'}
            </span>
            <button
              className="btn btn-secondary"
              type="button"
              disabled={!rangeValid || downloading || rows.length === 0}
              onClick={() => void downloadExcel()}
            >
              <FileSpreadsheet size={16} strokeWidth={1.75} />
              {downloading ? 'Downloading…' : 'Download Excel'}
            </button>
          </div>
        }
      />

      <FilterBar columnsClassName="sm:grid-cols-2 lg:grid-cols-3">
        <FilterField label="From">
          <input
            type="date"
            className={FILTER_CTRL}
            value={from}
            max={to || today()}
            onChange={(e) => {
              const v = e.target.value;
              setFrom(v);
              if (to && v > to) setTo(v);
            }}
          />
        </FilterField>
        <FilterField label="To">
          <input
            type="date"
            className={FILTER_CTRL}
            value={to}
            min={from}
            max={today()}
            onChange={(e) => {
              const v = e.target.value;
              setTo(v);
              if (from && v < from) setFrom(v);
            }}
          />
        </FilterField>
        <FilterField label="Line">
          <select className={FILTER_CTRL} value={lineId} onChange={(e) => setLineId(e.target.value)}>
            <option value="">All lines</option>
            {(lines.data ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.code ? `${l.code} — ${l.name}` : l.name}
              </option>
            ))}
          </select>
        </FilterField>
      </FilterBar>

      {!rangeValid ? (
        <div className="panel p-8 text-center text-sm" style={{ color: 'var(--muted)' }}>
          Select a valid date range.
        </div>
      ) : report.isLoading ? (
        <LoadingBlock />
      ) : rows.length === 0 ? (
        <div className="panel p-8 text-center text-sm" style={{ color: 'var(--muted)' }}>
          No production plans found for this range.
        </div>
      ) : (
        <div className="table-wrap fit-cols panel">
          <table className="data day-wise-oee">
            <thead>
              <tr>
                <th>Date</th>
                <th>Line</th>
                <th title="Planned Production Time (min)">Planned Time</th>
                <th title="Downtime (min)">Downtime</th>
                <th title="Operating Time (min)">Operating Time</th>
                <th title="Target Cases">Target</th>
                <th title="Actual Cases">Actual</th>
                <th title="Availability %">Avail %</th>
                <th title="Performance %">Perf %</th>
                <th title="Quality %">Qual %</th>
                <th title="OEE %">OEE %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.date}-${r.lineId}`}>
                  <td className="tabular-nums" title={fmtDate(r.date)}>
                    {fmtDate(r.date)}
                  </td>
                  <td title={r.lineCode ? `${r.lineCode} — ${r.lineName}` : r.lineName}>
                    {r.lineCode || r.lineName}
                  </td>
                  <td className="tabular-nums">{Math.round(r.plannedProductionTimeMins).toLocaleString()}</td>
                  <td className="tabular-nums font-semibold" style={{ color: downtimeColor(r.downtimeMins) }}>
                    {Math.round(r.downtimeMins).toLocaleString()}
                  </td>
                  <td className="tabular-nums">{Math.round(r.operatingTimeMins).toLocaleString()}</td>
                  <td className="tabular-nums">{r.targetCases.toLocaleString()}</td>
                  <td className="tabular-nums">{r.actualCases.toLocaleString()}</td>
                  <PctCell kind="availability" value={r.availability} />
                  <PctCell kind="performance" value={r.performance} />
                  <PctCell kind="quality" value={r.quality} />
                  <PctCell kind="oee" value={r.oee} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
