/** MTBF / MTTR guide content — adapted for shift-based bottled-water production */

export const MTBF_TARGET_MINS = 120;
export const MTTR_TARGET_MINS = 30;

export const MTTR_BANDS = [
  { range: '< 30 min', label: 'Excellent', signal: 'Fast recovery — parts & skills ready', action: 'Maintain — document best practices' },
  { range: '30–60 min', label: 'Good', signal: 'Acceptable response time', action: 'Review parts stocking on critical machines' },
  { range: '1–2 hours', label: 'Warning', signal: 'Reactive indicators — delays likely', action: 'Audit spares, training & escalation process' },
  { range: '> 2 hours', label: 'Critical', signal: 'Systemic repair delays', action: 'Full maintenance program review' },
] as const;

export const MTBF_BANDS = [
  { range: '≥ 120 min', label: 'Good', signal: 'Reliable running time between failures', action: 'Sustain PM — replicate on other lines' },
  { range: '60–119 min', label: 'Average', signal: 'PM gaps or recurring minor failures', action: 'Pareto top reasons — tighten PM checklist' },
  { range: '30–59 min', label: 'Poor', signal: 'Frequent stops hurting Availability', action: 'Repeat-failure analysis + RCA' },
  { range: '< 30 min', label: 'Critical', signal: 'Asset or process at risk', action: 'Immediate engineering review / replace vs repair' },
] as const;

export const METRIC_COMBOS = [
  {
    pattern: 'High MTTR + Low MTBF',
    meaning: 'Breaks often and takes long to fix',
    action: 'Review PM schedule and parts inventory. Likely missing preventive coverage and critical spares.',
  },
  {
    pattern: 'Low MTTR + Low MTBF',
    meaning: 'Fast repairs but still breaking constantly',
    action: 'Team is reactive but skilled. Shift investment to PM and condition monitoring to extend intervals.',
  },
  {
    pattern: 'High MTBF + Low OEE',
    meaning: 'Rarely fails but runs below potential',
    action: 'Focus on Performance & Quality losses — speed reductions and minor stops hide value.',
  },
  {
    pattern: 'Rising MTBF + Stable MTTR',
    meaning: 'PM program is working',
    action: 'Document what works and replicate the PM approach on similar machines (Filler, Capper, Labeler).',
  },
] as const;

export const OEE_LINK = {
  availability: 'Operating Time ÷ Planned Production Time',
  formula: 'OEE = Availability × Performance × Quality',
  note: 'MTBF/MTTR drive Availability. Higher MTBF and lower MTTR → more operating time → higher OEE.',
} as const;
