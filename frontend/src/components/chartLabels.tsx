import { LabelList } from 'recharts';

/** Compact value labels on bars/points so numbers stay visible after PNG copy → Word. */
export function ChartValueLabels({
  dataKey,
  suffix = '',
  position = 'top',
  hideZero = true,
}: {
  dataKey?: string;
  suffix?: string;
  position?: 'top' | 'right' | 'inside' | 'insideTop' | 'center';
  hideZero?: boolean;
}) {
  return (
    <LabelList
      {...(dataKey ? { dataKey } : {})}
      position={position}
      fontSize={9}
      fill="#334155"
      stroke="none"
      formatter={(value: unknown) => {
        const n = Number(value);
        if (!Number.isFinite(n)) return '';
        if (hideZero && n === 0) return '';
        const abs = Math.abs(n);
        const text =
          abs >= 1000
            ? n.toLocaleString(undefined, { maximumFractionDigits: 0 })
            : abs >= 10
              ? n.toLocaleString(undefined, { maximumFractionDigits: 1 })
              : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
        return `${text}${suffix}`;
      }}
    />
  );
}
