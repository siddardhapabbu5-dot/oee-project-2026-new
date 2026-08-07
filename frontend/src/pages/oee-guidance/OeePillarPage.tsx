import { useMemo, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { getPillar, matchesQuery } from '../../lib/oeeGuidanceData';
import { lossCategoryColor } from '../../lib/metricBands';

export default function OeePillarPage() {
  const { pillarId } = useParams<{ pillarId: string }>();
  const pillar = getPillar(pillarId);
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!pillar) return { groups: [], reasonCount: 0 };
    if (!q) {
      return {
        groups: pillar.groups,
        reasonCount: pillar.groups.reduce((s, g) => s + g.items.length, 0),
      };
    }

    const groups = pillar.groups
      .map((g) => ({
        title: g.title,
        items: g.items.filter((item) => matchesQuery(item, q) || matchesQuery(g.title, q)),
      }))
      .filter((g) => g.items.length > 0 || matchesQuery(g.title, q));

    return {
      groups,
      reasonCount: groups.reduce((s, g) => s + g.items.length, 0),
    };
  }, [pillar, q]);

  if (!pillar) return <Navigate to="/oee-guidance" replace />;

  const PillarIcon = pillar.icon;
  const groupAccent = (title: string) =>
    pillar.id === 'availability' ? lossCategoryColor(title) : pillar.tone;

  return (
    <div>
      <div className="panel mb-4 flex flex-wrap items-end gap-3 p-4">
        <label className="min-w-[220px] flex-1 text-sm">
          <span className="mb-1.5 block font-medium" style={{ color: 'var(--muted)' }}>
            Search categories / reasons
          </span>
          <input
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. cap, PLC, speed, TDS…"
          />
        </label>
        <div className="pb-2 text-sm" style={{ color: 'var(--muted)' }}>
          Showing <strong style={{ color: 'var(--text)' }}>{filtered.groups.length}</strong> categories ·{' '}
          <strong style={{ color: 'var(--text)' }}>{filtered.reasonCount}</strong> reasons
        </div>
      </div>

      <div className="panel mb-5 p-5">
        <div className="flex flex-wrap items-start gap-3">
          <span className="icon-box" style={{ background: pillar.soft, color: pillar.tone }}>
            <PillarIcon size={20} strokeWidth={1.75} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>
              {pillar.label} categories
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
              {pillar.meaning}
            </p>
            <p className="mt-2 text-xs font-medium" style={{ color: pillar.tone }}>
              {pillar.formula}
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {pillar.groups.map((g, i) => {
            const accent = groupAccent(g.title);
            return (
              <div
                key={g.title}
                className="rounded-lg border px-3 py-2.5 text-sm font-medium"
                style={{
                  borderColor: 'var(--border)',
                  color: 'var(--text)',
                  background: `color-mix(in oklab, ${accent} 12%, transparent)`,
                }}
              >
                <span className="mr-1.5 tabular-nums" style={{ color: accent }}>
                  {i + 1}.
                </span>
                {g.title}
              </div>
            );
          })}
        </div>
      </div>

      {filtered.groups.length > 0 ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {filtered.groups.map((g, gi) => {
            const accent = groupAccent(g.title);
            return (
              <div key={g.title} className="panel p-5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                    <span className="mr-2 tabular-nums" style={{ color: accent }}>
                      {gi + 1}.
                    </span>
                    {g.title}
                  </h3>
                  <span className="text-xs tabular-nums" style={{ color: 'var(--muted)' }}>
                    {g.items.length} reasons
                  </span>
                </div>
                <ul className="space-y-1.5">
                  {g.items.map((item) => (
                    <li key={item} className="flex gap-2 text-sm leading-snug" style={{ color: 'var(--text)' }}>
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: accent }} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="panel p-8 text-center text-sm" style={{ color: 'var(--muted)' }}>
          No categories or reasons match “{query}”. Try another keyword.
        </div>
      )}
    </div>
  );
}
