import { toBlob, toCanvas } from 'html-to-image';

function cardBackground(node: HTMLElement) {
  const styles = getComputedStyle(node);
  return styles.backgroundColor && styles.backgroundColor !== 'rgba(0, 0, 0, 0)'
    ? styles.backgroundColor
    : getComputedStyle(document.documentElement).getPropertyValue('--panel').trim() || '#ffffff';
}

function slugName(title: string) {
  return (
    title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'dashboard-card'
  );
}

async function downloadPng(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.png`;
  a.click();
  URL.revokeObjectURL(url);
}

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Resolve CSS variables so SVG fills/strokes/text survive PNG export (Word paste). */
function resolveCssVarsInClone(cloned: HTMLElement) {
  const resolve = (value: string) => {
    if (!value || !value.includes('var(')) return value;
    return value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/g, (_m, name: string, fallback?: string) => {
      const v = cssVar(name);
      return v || (fallback || '').trim() || name;
    });
  };

  cloned.querySelectorAll<HTMLElement | SVGElement>('*').forEach((el) => {
    for (const attr of ['fill', 'stroke', 'color', 'stop-color'] as const) {
      const raw = el.getAttribute(attr);
      if (raw && raw.includes('var(')) el.setAttribute(attr, resolve(raw));
    }
    const style = el.getAttribute('style');
    if (style && style.includes('var(')) el.setAttribute('style', resolve(style));
  });

  // Force axis / legend / label text visible (html-to-image often drops currentColor)
  cloned.querySelectorAll('text, tspan').forEach((el) => {
    const svg = el as SVGElement;
    const current = svg.getAttribute('fill');
    if (!current || current === 'currentColor' || current === 'none' || current.includes('var(')) {
      svg.setAttribute('fill', '#334155');
    }
    svg.style.fill = svg.getAttribute('fill') || '#334155';
    svg.style.opacity = '1';
  });

  // Keep legend readable
  cloned.querySelectorAll('.recharts-legend-item-text, .recharts-text').forEach((el) => {
    const html = el as HTMLElement;
    html.style.fill = '#334155';
    html.style.color = '#334155';
  });
}

/**
 * Copy a dashboard card (KPI / chart panel) as a PNG image.
 * Falls back to download when Clipboard image write is unavailable.
 */
export async function copyCardImage(node: HTMLElement, title = 'dashboard-card') {
  const options = {
    pixelRatio: 2,
    cacheBust: true,
    backgroundColor: cardBackground(node),
    skipFonts: true,
    filter: (el: HTMLElement) => {
      if (el instanceof HTMLElement && el.dataset?.noCopy) return false;
      return true;
    },
    onClone: (_doc: Document, cloned: HTMLElement) => {
      resolveCssVarsInClone(cloned);
    },
  };

  let blob: Blob | null = null;
  try {
    // Canvas path is more reliable for Recharts SVG text in Word pastes
    const canvas = await toCanvas(node, options);
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
  } catch {
    blob = await toBlob(node, options);
  }

  if (!blob) throw new Error('Could not capture card');

  const filename = slugName(title);

  try {
    if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return 'copied' as const;
    }
  } catch {
    // fall through to download
  }

  await downloadPng(blob, filename);
  return 'downloaded' as const;
}
