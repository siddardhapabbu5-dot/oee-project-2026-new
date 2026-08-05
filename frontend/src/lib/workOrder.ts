/** Display work-order number without legacy PP- prefix. */
export function formatWorkOrder(planNumber?: string | null) {
  if (!planNumber) return '—';
  return String(planNumber).replace(/^PP-/i, '');
}
