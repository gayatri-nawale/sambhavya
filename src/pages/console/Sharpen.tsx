import { CartesianGrid, Legend as ChartLegend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useEffect, useMemo } from 'react';
import { useReducedMotion } from 'motion/react';
import { usePageTitle } from '../../app/hooks';
import { CONSOLE_PAGES } from '../../content/site';
import {
  FIELD_META,
  METHOD_LABELS,
  METHODS,
  SAMPLES_PER_MEMBER,
  SCENARIOS,
  compareMethods,
  downscale,
  formatUtc,
  getBox,
  spectrum,
  validTime,
  type DownscaleMethod,
} from '../../sim';
import { useSimStore } from '../../store';
import { MAP_COLORS, fieldColormap, fieldRamp } from '../../components/map';
import { SplitView } from '../../components/sharpen/SplitView';
import { Button, Legend, MetricTile, Panel, StatusChip, ToggleGroup } from '../../components/ui';
import { DIVERGING_STOPS, divergingColor } from '../../styles/colormaps';

const METHOD_OPTIONS = METHODS.map((m) => ({ value: m, label: METHOD_LABELS[m] }));
const SAMPLE_OPTIONS = Array.from({ length: SAMPLES_PER_MEMBER }, (_, i) => ({ value: i, label: String(i + 1) }));

/** Spectrum line styles, using interface colours only. */
// Reference is drawn last so its dashes stay visible on top of the diffusion line.
const SERIES: Array<{ key: 'reference' | DownscaleMethod; name: string; color: string; dash?: string; width: number }> = [
  { key: 'bilinear', name: 'Bilinear', color: MAP_COLORS.bay, dash: '2 3', width: 2 },
  { key: 'unet', name: 'Plain U-Net', color: MAP_COLORS.bay, width: 2 },
  { key: 'diffusion', name: 'SAMBHAVYA (diffusion)', color: MAP_COLORS.teal, width: 3 },
  { key: 'reference', name: '5 km reference', color: MAP_COLORS.ink, dash: '5 4', width: 1.5 },
];

export default function Sharpen() {
  const page = CONSOLE_PAGES.find((p) => p.id === 'sharpen');
  usePageTitle(page?.name ?? '5 km downscaling');
  const reduceMotion = useReducedMotion() ?? false;

  const scenarioId = useSimStore((s) => s.scenarioId);
  const sel = useSimStore((s) => s.selection);
  const select = useSimStore((s) => s.select);

  // Dev only: ?gate=fail opens the failing case (for screenshots).
  useEffect(() => {
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('gate') === 'fail') select({ showFailingGate: true });
  }, [select]);

  const scenario = SCENARIOS[scenarioId];
  const meta = FIELD_META[scenario.fieldKind];
  const isRain = scenario.fieldKind === 'rain';
  const boxId = scenario.threatBoxes.some((b) => b.id === sel.threatBoxId) ? sel.threatBoxId : (scenario.threatBoxes[0]?.id ?? '');
  const box = getBox(scenarioId, boxId);
  const failing = sel.showFailingGate;
  // The failing case is a diffusion sample, so it always shows the diffusion method.
  const method: DownscaleMethod = failing ? 'diffusion' : sel.method;

  const cmp = compareMethods(scenarioId, boxId, 1, sel.sample);
  const result = downscale(scenarioId, boxId, method, { sample: sel.sample, failing });
  const gate = result.gate;
  // Temperatures are coloured around the box's own mean, so local 5 km detail is visible.
  const local = useMemo(() => {
    if (isRain) return null;
    const ref = cmp.reference.values;
    let sum = 0;
    let lo = Infinity;
    let hi = -Infinity;
    for (let k = 0; k < ref.length; k++) {
      const v = ref[k] as number;
      sum += v;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    const mean = sum / ref.length;
    const span = Math.max(0.5, Math.ceil(Math.max(hi - mean, mean - lo) * 2) / 2);
    return { mean: Math.round(mean * 2) / 2, span };
  }, [isRain, cmp]);
  const colormap = useMemo(
    () => (local ? (v: number) => divergingColor(v, local.mean, local.span) : fieldColormap(scenario.fieldKind)),
    [local, scenario.fieldKind],
  );
  const colorKey = local ? `local${local.mean}±${local.span}` : 'std';
  const ramp = local
    ? {
        title: meta.label,
        units: meta.units,
        stops: DIVERGING_STOPS.map((s) => ({ ...s, at: local.mean + s.at * local.span })),
        ticks: [local.mean - local.span, local.mean, local.mean + local.span],
      }
    : fieldRamp(scenario.fieldKind);
  const spec = spectrum(scenarioId, boxId, 1, sel.sample);
  const fmt = (v: number) => (isRain ? v.toFixed(0) : v.toFixed(1));

  const boxOptions = scenario.threatBoxes.map((b) => ({ value: b.id, label: b.label }));

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <div>
        <h1 className="text-h3 sm:text-h2">5 km downscaling</h1>
        <p className="mt-2 max-w-[70ch] text-body">{page?.summary}</p>
      </div>

      {/* Pickers */}
      <Panel>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <ToggleGroup label="Threat box" showLabel options={boxOptions} value={boxId} onChange={(v) => select({ threatBoxId: v, showFailingGate: false })} />
          <ToggleGroup label="Method" showLabel options={METHOD_OPTIONS} value={method} onChange={(v) => select({ method: v, showFailingGate: false })} />
          {method === 'diffusion' && !failing && (
            <ToggleGroup label="Sample" showLabel options={SAMPLE_OPTIONS} value={sel.sample} onChange={(v) => select({ sample: v })} />
          )}
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-12">
        {/* Split view */}
        <Panel
          title={`${box.label} · ${meta.label}`}
          description={`Valid ${formatUtc(validTime(scenario, box.leadH))} (T+${box.leadH} h) · 128 × 128 cells at 5 km · drag the divider to compare`}
          replay
          bleed
          className="xl:col-span-7"
        >
          <SplitView
            label={`${box.label}: 12 km input on the left, ${METHOD_LABELS[method]} 5 km output on the right`}
            colormap={colormap}
            left={{
              field: cmp.input,
              cacheKey: `${scenarioId}|${boxId}|12km|${colorKey}`,
              label: '12 km input',
              footer: `Peak ${fmt(cmp.metrics.find((m) => m.method === 'input12km')?.peak ?? 0)} ${meta.units}`,
            }}
            right={{
              field: result.field,
              cacheKey: `${scenarioId}|${boxId}|${method}|${sel.sample}|${failing ? 'fail' : 'ok'}|${colorKey}`,
              label: failing ? '5 km sample (rejected)' : `5 km · ${METHOD_LABELS[method]}`,
              footer: `Peak ${fmt(result.peak)} ${meta.units}`,
            }}
            rightNotice={
              failing ? (
                <div className="absolute inset-x-3 bottom-12 z-10 rounded-chip border border-ink bg-paper px-3 py-2 text-small">
                  <strong>Gate failed.</strong> This sample is not published; the calibrated 12 km forecast is used instead.
                </div>
              ) : null
            }
          />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
            <p className="max-w-[56ch] text-small">
              {isRain
                ? 'Bilinear and plain U-Net smooth the field and lose the peak. The diffusion model adds realistic 5 km detail and keeps it.'
                : 'Bilinear and plain U-Net smooth out local hot spots. The diffusion model restores 5 km detail and keeps the peak.'}
            </p>
            <Legend ramp={ramp} className="border-0 px-0 py-0" />
          </div>
        </Panel>

        <div className="space-y-4 xl:col-span-5">
          {/* Metrics */}
          <Panel title="Peak by method" description={`Peak ${isRain ? 'rain' : meta.label.toLowerCase()} in the box (${meta.units}) and how much of the 5 km reference peak is kept`} replay>
            <div className="grid grid-cols-2 gap-4">
              {METHODS.map((m) => {
                const r = cmp.results[m];
                return (
                  <MetricTile
                    key={m}
                    label={METHOD_LABELS[m]}
                    value={fmt(r.peak)}
                    unit={meta.units}
                    note={`Peak kept ${r.peakKeptPct.toFixed(0)}%`}
                    tone={m === 'diffusion' ? 'teal' : 'ink'}
                  />
                );
              })}
              <MetricTile
                label="5 km reference"
                value={fmt(cmp.metrics.find((m) => m.method === 'reference')?.peak ?? 0)}
                unit={meta.units}
                note={`12 km input keeps ${cmp.metrics.find((m) => m.method === 'input12km')?.peakKeptPct.toFixed(0) ?? '–'}%`}
              />
            </div>
            <p className="mt-3 text-small">
              {isRain ? 'Peak kept compares maxima.' : 'Peak kept compares how far the peak rises above the box mean.'} Diffusion values are for sample{' '}
              {sel.sample + 1} of {SAMPLES_PER_MEMBER}; each sample differs slightly.
            </p>
          </Panel>

          {/* Quality gate */}
          <Panel
            title="Quality gate"
            description={`Checks on the ${failing ? 'rejected diffusion sample' : `${METHOD_LABELS[method]} output`} before it can be published`}
            replay
            actions={
              <Button size="sm" variant={failing ? 'primary' : 'secondary'} onClick={() => select({ showFailingGate: !failing })}>
                {failing ? 'Back to the passing case' : 'Show a failing case'}
              </Button>
            }
          >
            <ul className="divide-y divide-line">
              {gate.checks.map((c) => (
                <li key={c.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0">
                  <div className="min-w-0">
                    <p className="text-body font-semibold">{c.label}</p>
                    <p className="text-small">{c.detail}</p>
                  </div>
                  <StatusChip status={c.pass ? 'pass' : 'fail'} />
                </li>
              ))}
            </ul>
            <p className={`mt-3 rounded-chip px-3 py-2 text-body ${gate.passed ? 'bg-mist' : 'border border-ink bg-paper font-semibold'}`} role="status">
              {gate.message}
            </p>
          </Panel>
        </div>
      </div>

      {/* Spectrum */}
      <Panel
        title="Radially averaged power spectrum"
        description="How much variation each method keeps at each scale. Lines that drop away at small scales have lost detail; diffusion stays closest to the 5 km reference."
        replay
      >
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={spec} margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
              <CartesianGrid stroke={MAP_COLORS.line} strokeDasharray="2 4" />
              <XAxis
                dataKey="k"
                type="number"
                scale="log"
                domain={[1, 64]}
                ticks={[1, 2, 4, 8, 16, 32, 64]}
                tickFormatter={(k: number) => `${Math.round(640 / k)}`}
                stroke={MAP_COLORS.ink}
                fontSize={13}
                label={{ value: 'Wavelength (km)', position: 'insideBottom', offset: -14, fontSize: 13, fill: MAP_COLORS.ink }}
              />
              <YAxis
                stroke={MAP_COLORS.ink}
                fontSize={13}
                tickFormatter={(v: number) => v.toFixed(0)}
                width={44}
                label={{ value: 'log₁₀ power', angle: -90, position: 'insideLeft', fontSize: 13, fill: MAP_COLORS.ink }}
              />
              <Tooltip
                formatter={(v) => (typeof v === 'number' ? v.toFixed(2) : String(v))}
                labelFormatter={(k) => (typeof k === 'number' ? `${Math.round(640 / k)} km` : String(k))}
                contentStyle={{ borderRadius: 4, borderColor: MAP_COLORS.line, fontSize: 13 }}
              />
              <ChartLegend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 13 }} />
              {SERIES.map((s) => (
                <Line
                  key={s.key}
                  dataKey={s.key}
                  name={s.name}
                  stroke={s.color}
                  strokeWidth={s.width}
                  strokeDasharray={s.dash}
                  dot={false}
                  isAnimationActive={!reduceMotion}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Panel>
    </div>
  );
}
