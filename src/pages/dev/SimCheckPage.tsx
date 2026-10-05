import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CAP_FORMAT_LABEL,
  FIELD_META,
  LEAD_DAYS,
  METHOD_LABELS,
  METHODS,
  REGIONS,
  RISK_LABELS,
  SAMPLES_PER_MEMBER,
  SCENARIOS,
  SCENARIO_IDS,
  OUTCOME_LABELS,
  buildCapXml,
  clockAt,
  compareMethods,
  conePolygon,
  downscale,
  efiField,
  getAlerts,
  getEnsemble,
  getLedger,
  getMetrics,
  getPipelinePlan,
  getRisk,
  isLand,
  levelLabel,
  regionField,
  reliability,
  snapshot,
  spectrum,
  spreadError,
  stableWarnings,
  type BBox,
  type FieldKind,
  type LatLon,
  type ScenarioId,
} from '../../sim';
import { runChecks, scenarioDigest, type CheckResult } from '../../sim/selfcheck';
import { useRunClock, useSimStore, type SimState } from '../../store';
import { RISK_COLORS, divergingColor, rainColor, type RGBA } from '../../styles/colormaps';

/* Spec palette (Part 2). This dev page predates the Prompt 1 tokens. */
const INK = '#14213D';
const BAY = '#0F4C75';
const TEAL = '#1F8A84';
const LINE = '#C9D3DE';
const PATH_COLORS = [TEAL, BAY, INK];

/* ------------------------------------------------------------------ */
/* Small helpers                                                        */
/* ------------------------------------------------------------------ */

function ReplayChip() {
  return (
    <span className="inline-block rounded-[4px] border border-[#C9D3DE] bg-white px-2 py-0.5 text-[13px] text-[#14213D]">
      Replay · illustrative values
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[8px] border border-[#C9D3DE] bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[20px] font-semibold text-[#14213D]">{title}</h2>
        <ReplayChip />
      </div>
      {children}
    </section>
  );
}

function colorFor(kind: FieldKind | 'efi'): (v: number) => RGBA {
  if (kind === 'rain') return rainColor;
  if (kind === 'efi') return (v) => divergingColor(v);
  const meta = FIELD_META[kind];
  const center = (meta.displayMin + meta.displayMax) / 2;
  return (v) => divergingColor(v, center, (meta.displayMax - meta.displayMin) / 2);
}

/** Paints a row-major field onto a canvas, one pixel per cell, scaled by CSS. */
function FieldCanvas(props: {
  values: Float32Array;
  nx: number;
  ny: number;
  color: (v: number) => RGBA;
  width: number;
  pixelated?: boolean;
  label?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const img = ctx.createImageData(props.nx, props.ny);
    for (let k = 0; k < props.values.length; k++) {
      const [r, g, b, a] = props.color(props.values[k] as number);
      img.data[k * 4] = r;
      img.data[k * 4 + 1] = g;
      img.data[k * 4 + 2] = b;
      img.data[k * 4 + 3] = a;
    }
    ctx.putImageData(img, 0, 0);
  }, [props]);
  return (
    <figure className="m-0">
      <canvas
        ref={ref}
        width={props.nx}
        height={props.ny}
        style={{ width: props.width, height: (props.width * props.ny) / props.nx, imageRendering: props.pixelated ? 'pixelated' : 'auto' }}
        className="block border border-[#C9D3DE] bg-[#EEF2F6]"
      />
      {props.label && <figcaption className="mt-1 text-[14px] text-[#14213D]">{props.label}</figcaption>}
    </figure>
  );
}

function project(b: BBox, w: number, h: number) {
  return (p: LatLon) => ({
    x: ((p.lon - b.lonMin) / (b.lonMax - b.lonMin)) * w,
    y: ((b.latMax - p.lat) / (b.latMax - b.latMin)) * h,
  });
}

/** Land mask rendered from the bundled world atlas (no network). */
function LandBackdrop({ bbox, width, height }: { bbox: BBox; width: number; height: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const nx = 160;
    const ny = Math.round((nx * height) / width);
    const img = ctx.createImageData(nx, ny);
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const lat = bbox.latMax - ((j + 0.5) / ny) * (bbox.latMax - bbox.latMin);
        const lon = bbox.lonMin + ((i + 0.5) / nx) * (bbox.lonMax - bbox.lonMin);
        const k = (j * nx + i) * 4;
        const land = isLand(lat, lon);
        img.data[k] = land ? 0xee : 0xd6;
        img.data[k + 1] = land ? 0xf2 : 0xe2;
        img.data[k + 2] = land ? 0xf6 : 0xee;
        img.data[k + 3] = 255;
      }
    ctx.canvas.width = nx;
    ctx.canvas.height = ny;
    ctx.putImageData(img, 0, 0);
  }, [bbox, width, height]);
  return <canvas ref={ref} className="absolute inset-0" style={{ width, height }} />;
}

function Polyline({ points, color, width = 1.5, dash }: { points: Array<{ x: number; y: number }>; color: string; width?: number; dash?: string }) {
  return (
    <polyline
      points={points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeDasharray={dash}
    />
  );
}

/** Minimal line chart for previews (not the product chart components). */
function MiniChart(props: {
  width?: number;
  height?: number;
  xDomain: [number, number];
  yDomain: [number, number];
  series: Array<{ name: string; color: string; points: Array<[number, number]>; dash?: string }>;
  diagonal?: boolean;
  xLabel: string;
}) {
  const w = props.width ?? 280;
  const h = props.height ?? 180;
  const pad = 24;
  const sx = (x: number) => pad + ((x - props.xDomain[0]) / (props.xDomain[1] - props.xDomain[0])) * (w - pad - 8);
  const sy = (y: number) => h - pad - ((y - props.yDomain[0]) / (props.yDomain[1] - props.yDomain[0])) * (h - pad - 8);
  return (
    <figure className="m-0">
      <svg width={w} height={h} className="block border border-[#C9D3DE] bg-white">
        {props.diagonal && <line x1={sx(0)} y1={sy(0)} x2={sx(1)} y2={sy(1)} stroke={LINE} strokeDasharray="4 3" />}
        <line x1={pad} y1={h - pad} x2={w - 8} y2={h - pad} stroke={LINE} />
        <line x1={pad} y1={8} x2={pad} y2={h - pad} stroke={LINE} />
        {props.series.map((s) => (
          <Polyline key={s.name} points={s.points.map(([x, y]) => ({ x: sx(x), y: sy(y) }))} color={s.color} dash={s.dash} width={2} />
        ))}
      </svg>
      <figcaption className="mt-1 text-[14px] text-[#14213D]">
        {props.xLabel} ·{' '}
        {props.series.map((s, k) => (
          <span key={s.name} style={{ color: s.color }}>
            {k > 0 ? ' · ' : ''}
            {s.name}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/* Sections                                                             */
/* ------------------------------------------------------------------ */

function ChecksSection({ id }: { id: ScenarioId }) {
  const [results, setResults] = useState<CheckResult[] | null>(null);
  const [digest, setDigest] = useState('');
  const [ms, setMs] = useState(0);
  useEffect(() => {
    setResults(null);
    // Let the page paint before the (heavy) regeneration runs.
    const t = window.setTimeout(() => {
      const t0 = performance.now();
      const r = runChecks(id);
      setMs(performance.now() - t0);
      setResults(r);
      setDigest(scenarioDigest(id));
    }, 30);
    return () => window.clearTimeout(t);
  }, [id]);
  const passed = results?.filter((r) => r.pass).length ?? 0;
  return (
    <Section title="Sanity checks">
      {!results ? (
        <p className="text-[16px]">Running checks…</p>
      ) : (
        <>
          <p className="mb-3 text-[16px]">
            <strong>
              {passed} of {results.length} passed
            </strong>{' '}
            in {(ms / 1000).toFixed(1)} s. Data fingerprint <code className="tabular-nums">{digest}</code> — reload the page;
            it must not change.
          </p>
          <ul className="space-y-1">
            {results.map((r) => (
              <li key={r.label} className="text-[14px] leading-snug">
                <span className={r.pass ? 'font-semibold text-[#1F8A84]' : 'font-semibold text-[#14213D] underline'}>
                  {r.pass ? 'Pass' : 'Fail'}
                </span>{' '}
                {r.label} <span className="text-[#0F4C75]">— {r.detail}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Section>
  );
}

function TracksSection({ id }: { id: ScenarioId }) {
  const e = getEnsemble(id);
  const scenario = SCENARIOS[id];
  const bbox = REGIONS[scenario.regionId].bbox;
  const w = 420;
  const h = Math.round((w * (bbox.latMax - bbox.latMin)) / (bbox.lonMax - bbox.lonMin));
  const p = project(bbox, w, h);
  const cone = conePolygon(e.cone).map(p);
  return (
    <Section title="Member tracks, scenario paths and cone">
      <div className="flex flex-wrap gap-6">
        <div className="relative" style={{ width: w, height: h }}>
          <LandBackdrop bbox={bbox} width={w} height={h} />
          <svg width={w} height={h} className="absolute inset-0">
            <Polyline points={cone} color={INK} width={1} dash="4 3" />
            {e.members.map((m) => (
              <Polyline key={m.member} points={m.points.map(p)} color={PATH_COLORS[m.clusterIndex] ?? INK} width={0.8} />
            ))}
            {e.paths.map((path) => (
              <Polyline key={path.key} points={path.meanTrack.map(p)} color={PATH_COLORS[path.index] ?? INK} width={3} />
            ))}
            {scenario.threatBoxes.map((b) => {
              const tl = p({ lat: b.center.lat + 2.88, lon: b.center.lon - 2.88 });
              const br = p({ lat: b.center.lat - 2.88, lon: b.center.lon + 2.88 });
              return <rect key={b.id} x={tl.x} y={tl.y} width={br.x - tl.x} height={br.y - tl.y} fill="none" stroke={INK} strokeWidth={1} />;
            })}
          </svg>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[14px] tabular-nums">
          <dt>Run</dt>
          <dd>{scenario.run.label}</dd>
          <dt>Shaped after</dt>
          <dd>{scenario.shapedAfter}</dd>
          {e.paths.map((path) => (
            <FragmentRow key={path.key} label={path.label} color={PATH_COLORS[path.index] ?? INK}>
              {path.members.length} members · raw {(path.rawProbability * 100).toFixed(0)}% · calibrated {(path.calibratedProbability * 100).toFixed(0)}%
            </FragmentRow>
          ))}
          <dt>Core</dt>
          <dd>
            {e.threat.core.place.name} ({e.threat.core.lat.toFixed(2)}°N {e.threat.core.lon.toFixed(2)}°E)
          </dd>
          <dt>Timing</dt>
          <dd>{e.threat.timing.label}</dd>
          <dt>Agreement</dt>
          <dd>
            {e.threat.agreement.count} of {e.threat.agreement.total} ({e.threat.agreement.criterion})
          </dd>
          <dt>Cone radius</dt>
          <dd>{e.cone.filter((c) => c.leadH % 48 === 0).map((c) => `T+${c.leadH} h ${c.radiusKm.toFixed(0)} km`).join(' · ')}</dd>
          <dt>GNN screen</dt>
          <dd>
            {e.screening.nodes.filter((n) => n.score >= e.screening.litThreshold).length} of {e.screening.nodes.length} mesh nodes lit ·{' '}
            {e.screening.candidates.length} candidate regions
          </dd>
        </dl>
      </div>
    </Section>
  );
}

function FragmentRow({ label, color, children }: { label: string; color: string; children: React.ReactNode }) {
  return (
    <>
      <dt style={{ color }} className="font-semibold">
        {label}
      </dt>
      <dd>{children}</dd>
    </>
  );
}

function FieldsSection({ id }: { id: ScenarioId }) {
  const scenario = SCENARIOS[id];
  const lead = useSimStore((s) => s.leadH);
  const setLeadH = useSimStore((s) => s.setLeadH);
  const rf = regionField(id, lead);
  const efi = efiField(id, lead);
  const meta = FIELD_META[scenario.fieldKind];
  const max = rf.values.reduce((m, v) => Math.max(m, v), -Infinity);
  return (
    <Section title={`12 km fields · ${meta.label}`}>
      <label className="mb-3 flex items-center gap-3 text-[14px]">
        Lead time T+{lead} h
        <input type="range" min={0} max={240} step={6} value={lead} onChange={(ev) => setLeadH(Number(ev.target.value))} />
        <span className="tabular-nums">
          max {max.toFixed(1)} {meta.units}
        </span>
      </label>
      <div className="flex flex-wrap gap-4">
        <FieldCanvas values={rf.values} nx={rf.grid.nx} ny={rf.grid.ny} color={colorFor(rf.kind)} width={300} label={`${meta.label} (${rf.grid.nx}×${rf.grid.ny})`} />
        <FieldCanvas values={efi.values} nx={efi.grid.nx} ny={efi.grid.ny} color={colorFor('efi')} width={300} label="EFI vs baseline (−1 to 1)" />
      </div>
    </Section>
  );
}

function DownscaleSection({ id }: { id: ScenarioId }) {
  const scenario = SCENARIOS[id];
  const sel = useSimStore((s) => s.selection);
  const select = useSimStore((s) => s.select);
  const boxId = scenario.threatBoxes.some((b) => b.id === sel.threatBoxId) ? sel.threatBoxId : (scenario.threatBoxes[0]?.id ?? '');
  const cmp = compareMethods(id, boxId, 1, sel.sample);
  const failing = downscale(id, boxId, 'diffusion', { failing: true });
  const color = colorFor(scenario.fieldKind);
  const spec = spectrum(id, boxId, 1, sel.sample);
  const ys = spec.flatMap((p) => [p.reference, p.bilinear, p.unet, p.diffusion]);
  return (
    <Section title="5 km downscaling">
      <div className="mb-3 flex flex-wrap gap-2 text-[14px]">
        {scenario.threatBoxes.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => select({ threatBoxId: b.id })}
            className={`rounded-[4px] border px-2 py-1 ${b.id === boxId ? 'border-[#1F8A84] bg-[#1F8A84] text-white' : 'border-[#C9D3DE]'}`}
          >
            {b.label} · T+{b.leadH} h
          </button>
        ))}
        <span className="ml-2 self-center">Sample</span>
        {Array.from({ length: SAMPLES_PER_MEMBER }, (_, s) => (
          <button
            key={s}
            type="button"
            onClick={() => select({ sample: s })}
            className={`rounded-[4px] border px-2 py-1 ${s === sel.sample ? 'border-[#1F8A84] bg-[#1F8A84] text-white' : 'border-[#C9D3DE]'}`}
          >
            {s + 1}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        <FieldCanvas values={cmp.input.values} nx={cmp.input.grid.nx} ny={cmp.input.grid.ny} color={color} width={170} pixelated label="12 km input" />
        {METHODS.map((m) => (
          <FieldCanvas
            key={m}
            values={cmp.results[m].field.values}
            nx={cmp.results[m].field.grid.nx}
            ny={cmp.results[m].field.grid.ny}
            color={color}
            width={170}
            label={METHOD_LABELS[m]}
          />
        ))}
        <FieldCanvas values={cmp.reference.values} nx={128} ny={128} color={color} width={170} label="5 km reference" />
        <FieldCanvas values={failing.field.values} nx={128} ny={128} color={color} width={170} label="Failing case (artefact)" />
      </div>
      <table className="mt-4 text-[14px] tabular-nums">
        <thead>
          <tr className="text-left">
            <th className="pr-6 font-semibold">Method</th>
            <th className="pr-6 font-semibold">Peak ({FIELD_META[scenario.fieldKind].units})</th>
            <th className="font-semibold">Peak kept</th>
          </tr>
        </thead>
        <tbody>
          {cmp.metrics.map((m) => (
            <tr key={m.method}>
              <td className="pr-6">{m.label}</td>
              <td className="pr-6">{m.peak.toFixed(1)}</td>
              <td>{m.peakKeptPct.toFixed(0)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 flex flex-wrap gap-6">
        <div className="text-[14px]">
          <p className="font-semibold">Quality gate (diffusion)</p>
          {cmp.results.diffusion.gate.checks.map((c) => (
            <p key={c.id}>
              {c.pass ? 'Pass' : 'Fail'} · {c.label} — {c.detail}
            </p>
          ))}
          <p className="mt-1">{cmp.results.diffusion.gate.message}</p>
          <p className="mt-3 font-semibold">Failing case</p>
          {failing.gate.checks.map((c) => (
            <p key={c.id}>
              {c.pass ? 'Pass' : 'Fail'} · {c.label} — {c.detail}
            </p>
          ))}
          <p className="mt-1">{failing.gate.message}</p>
        </div>
        <MiniChart
          xDomain={[0, Math.log10(640 / 10)]}
          yDomain={[Math.min(...ys), Math.max(...ys)]}
          xLabel="Power spectrum (log), 640 km → 10 km"
          series={[
            { name: 'Reference', color: INK, points: spec.map((p) => [Math.log10(640 / p.wavelengthKm), p.reference]) },
            { name: 'Bilinear', color: LINE, points: spec.map((p) => [Math.log10(640 / p.wavelengthKm), p.bilinear]) },
            { name: 'U-Net', color: BAY, points: spec.map((p) => [Math.log10(640 / p.wavelengthKm), p.unet]), dash: '4 3' },
            { name: 'Diffusion', color: TEAL, points: spec.map((p) => [Math.log10(640 / p.wavelengthKm), p.diffusion]) },
          ]}
        />
      </div>
    </Section>
  );
}

function CalibrationSection({ id }: { id: ScenarioId }) {
  const day = useSimStore((s) => s.selection.calibrationDay);
  const select = useSimStore((s) => s.select);
  const rel = reliability(id, day);
  const se = spreadError(id);
  const sw = stableWarnings(id);
  const maxErr = Math.max(...se.points.map((p) => p.error)) * 1.1;
  return (
    <Section title="Calibration">
      <div className="mb-3 flex gap-2 text-[14px]">
        {LEAD_DAYS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => select({ calibrationDay: d })}
            className={`rounded-[4px] border px-2 py-1 ${d === day ? 'border-[#1F8A84] bg-[#1F8A84] text-white' : 'border-[#C9D3DE]'}`}
          >
            Day {d}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-6">
        <MiniChart
          xDomain={[0, 1]}
          yDomain={[0, 1]}
          diagonal
          xLabel={`Reliability, Day ${day} · Brier ${rel.brierRaw.toFixed(3)} → ${rel.brierCalibrated.toFixed(3)}`}
          series={[
            { name: 'Raw', color: BAY, points: rel.points.map((p) => [p.forecast, p.raw]) },
            { name: 'Calibrated', color: TEAL, points: rel.points.map((p) => [p.forecast, p.calibrated]) },
          ]}
        />
        <MiniChart
          xDomain={[24, 240]}
          yDomain={[0, maxErr]}
          xLabel={`${se.variable} (${se.units}) vs lead`}
          series={[
            { name: 'Error', color: INK, points: se.points.map((p) => [p.leadH, p.error]) },
            { name: 'Raw spread', color: BAY, points: se.points.map((p) => [p.leadH, p.rawSpread]), dash: '4 3' },
            { name: 'Calibrated spread', color: TEAL, points: se.points.map((p) => [p.leadH, p.calibratedSpread]) },
          ]}
        />
        <table className="text-[14px] tabular-nums">
          <thead>
            <tr className="text-left">
              <th className="pr-4 font-semibold">Run</th>
              <th className="pr-4 font-semibold">Single run</th>
              <th className="font-semibold">Blended + hysteresis</th>
            </tr>
          </thead>
          <tbody>
            {sw.runs.map((r) => (
              <tr key={r.runLabel}>
                <td className="pr-4">{r.runLabel.replace('Run ', '')}</td>
                <td className="pr-4">
                  {r.singleProbability.toFixed(2)} {r.singleLevel}
                </td>
                <td>
                  {r.blendedProbability.toFixed(2)} {r.stableLevel}
                </td>
              </tr>
            ))}
            <tr>
              <td className="pr-4">Level changes</td>
              <td className="pr-4">{sw.flipsSingle}</td>
              <td>{sw.flipsStable}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function RiskSection({ id }: { id: ScenarioId }) {
  const scenario = SCENARIOS[id];
  const risk = getRisk(id);
  const alerts = getAlerts(id);
  const reviews = useSimStore((s) => s.reviews);
  const approveAlert = useSimStore((s) => s.approveAlert);
  const holdAlert = useSimStore((s) => s.holdAlert);
  const box = scenario.threatBoxes[0];
  const first = alerts[0];
  const approvedAt = first ? reviews[first.id]?.approvedAt : undefined;
  const xml = useMemo(
    () => (first ? buildCapXml(first, { sentAt: approvedAt ? new Date(approvedAt) : new Date(Date.UTC(2020, 4, 16, 7, 10)) }) : ''),
    [first, approvedAt],
  );
  const zoneCanvas = useMemo(() => {
    if (!box) return null;
    const n = 32;
    const values = new Float32Array(n * n).fill(-1);
    for (const z of risk.zones) {
      if (z.boxId !== box.id) continue;
      values[z.zj * n + z.zi] = z.level === 'severe' ? 3 : z.level === 'moderate' ? 2 : z.level === 'low' ? 1 : 0;
    }
    return { values, n };
  }, [risk, box]);
  const zoneColor = (v: number): RGBA => {
    const hex = v === 3 ? RISK_COLORS.severe : v === 2 ? RISK_COLORS.moderate : v === 1 ? RISK_COLORS.low : null;
    if (v === 0) return [0xee, 0xf2, 0xf6, 255];
    if (!hex) return [0, 0, 0, 0];
    const num = parseInt(hex.slice(1), 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255, 255];
  };
  return (
    <Section title="Risk zones, alerts and CAP">
      <div className="flex flex-wrap gap-6">
        {zoneCanvas && box && (
          <FieldCanvas values={zoneCanvas.values} nx={zoneCanvas.n} ny={zoneCanvas.n} color={zoneColor} width={220} pixelated label={`${box.label} · zones over India`} />
        )}
        <div className="min-w-[280px] flex-1 text-[14px] tabular-nums">
          <p className="mb-2">
            {risk.scored} zones scored · {risk.counts.severe} Severe · {risk.counts.moderate} Moderate · {risk.counts.low} Low
          </p>
          {alerts.map((a) => {
            const status = reviews[a.id]?.status ?? 'pending';
            return (
              <div key={a.id} className="mb-3 border-t border-[#C9D3DE] pt-2">
                <p>
                  <span className="rounded-[4px] px-1.5 py-0.5 font-semibold" style={{ background: RISK_COLORS[a.level], color: INK }}>
                    {RISK_LABELS[a.level]}
                  </span>{' '}
                  {a.hazardLabel} · {a.areaName} · T+{a.leadH} h · {a.thresholdLabel} {a.probability.toFixed(2)} · {a.agreement.count} of{' '}
                  {a.agreement.total} members · {status}
                </p>
                <p className="mt-1">{a.message.en}</p>
                <p lang="hi">{a.message.hi}</p>
                <p className="text-[#0F4C75]">Agromet: {a.advice.agromet}</p>
                <div className="mt-1 flex gap-2">
                  <button type="button" className="rounded-[4px] border border-[#1F8A84] px-2 py-0.5" onClick={() => approveAlert(a.id)}>
                    Approve
                  </button>
                  <button type="button" className="rounded-[4px] border border-[#C9D3DE] px-2 py-0.5" onClick={() => holdAlert(a.id)}>
                    Hold
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="mt-2 text-[14px] font-semibold">{CAP_FORMAT_LABEL} · preview of the first alert</p>
      <pre className="mt-1 max-h-64 overflow-auto rounded-[4px] border border-[#C9D3DE] bg-[#EEF2F6] p-2 text-[12px] leading-snug">{xml}</pre>
    </Section>
  );
}

function PipelineSection({ id }: { id: ScenarioId }) {
  useRunClock();
  const run = useSimStore((s) => s.run);
  const actions = useSimStore((s): Pick<SimState, 'startRun' | 'pauseRun' | 'resumeRun' | 'resetRun' | 'setRunSpeed'> => s);
  const plan = getPipelinePlan(id);
  const snap = snapshot(plan, run);
  const last = snap.logs.slice(-8);
  return (
    <Section title="Pipeline state machine">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[14px] tabular-nums">
        <button type="button" className="rounded-[4px] border border-[#1F8A84] bg-[#1F8A84] px-2 py-1 text-white" onClick={actions.startRun}>
          Run forecast
        </button>
        {run.status === 'running' ? (
          <button type="button" className="rounded-[4px] border border-[#C9D3DE] px-2 py-1" onClick={actions.pauseRun}>
            Pause
          </button>
        ) : (
          <button type="button" className="rounded-[4px] border border-[#C9D3DE] px-2 py-1" onClick={actions.resumeRun}>
            Resume
          </button>
        )}
        <button type="button" className="rounded-[4px] border border-[#C9D3DE] px-2 py-1" onClick={actions.resetRun}>
          Reset
        </button>
        {([1, 2, 4] as const).map((sp) => (
          <button
            key={sp}
            type="button"
            onClick={() => actions.setRunSpeed(sp)}
            className={`rounded-[4px] border px-2 py-1 ${run.speed === sp ? 'border-[#1F8A84] bg-[#1F8A84] text-white' : 'border-[#C9D3DE]'}`}
          >
            {sp}×
          </button>
        ))}
        <span className="ml-2">
          {run.status} · {(run.elapsedMs / 1000).toFixed(1)} / {(plan.totalMs / 1000).toFixed(1)} s · clock {snap.clock} UTC · GPU-min{' '}
          {snap.gpuMinutes.toFixed(1)} (sim)
        </span>
      </div>
      <div className="flex flex-wrap gap-6 text-[14px]">
        <ol className="space-y-0.5">
          {snap.steps.map((s) => (
            <li key={s.id} className={s.status === 'running' ? 'font-semibold text-[#1F8A84]' : s.status === 'done' ? 'text-[#14213D]' : 'text-[#0F4C75] opacity-60'}>
              {s.status === 'done' ? 'Done' : s.status === 'running' ? `${Math.round(s.progress * 100)}%` : 'Waiting'} · {s.label}
            </li>
          ))}
        </ol>
        <div className="min-w-[280px] flex-1 font-normal tabular-nums">
          {last.length === 0 && <p>No log lines yet. Press Run forecast.</p>}
          {last.map((l) => (
            <p key={`${l.atMs}-${l.text}`}>
              {clockAt(plan, l.atMs)} {l.text}
            </p>
          ))}
        </div>
      </div>
      <p className="mt-2 text-[14px] tabular-nums">
        Plan: {plan.memberArrivals.length} member arrivals · {plan.chunkCount.toLocaleString('en-IN')} chunks · EFI max {plan.efiMax.toFixed(2)} ·{' '}
        {plan.patches.length} patches · gate {plan.gatePassed ? 'passed' : 'failed'} · {plan.alertsWaiting} alerts
      </p>
    </Section>
  );
}

function VerifySection() {
  const ledger = getLedger();
  const m = getMetrics();
  return (
    <Section title="Verification">
      <table className="text-[14px] tabular-nums">
        <thead>
          <tr className="text-left">
            {['Area', 'Run', 'Issued', 'Lead', 'Observed', 'Result'].map((h) => (
              <th key={h} className="pr-4 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ledger.map((r) => (
            <tr key={r.id}>
              <td className="pr-4">{r.area}</td>
              <td className="pr-4">{r.issuedRun}</td>
              <td className="pr-4">{levelLabel(r.issuedLevel)}</td>
              <td className="pr-4">T+{r.leadH} h</td>
              <td className="pr-4">{r.observed}</td>
              <td>{OUTCOME_LABELS[r.outcome]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-[14px] tabular-nums">
        Track error (km), SAMBHAVYA / TempestExtremes / raw mean:{' '}
        {m.trackErrorKm.map((t) => `${t.leadH} h ${t.sambhavya}/${t.tempestExtremes}/${t.rawMean}`).join(' · ')}
        <br />
        CSI {m.csi.sambhavya.toFixed(2)} (raw {m.csi.rawEnsemble.toFixed(2)}) · FAR {m.far.sambhavya.toFixed(2)} (raw{' '}
        {m.far.rawEnsemble.toFixed(2)}) · Brier {m.brier.sambhavya.toFixed(3)} (raw {m.brier.rawEnsemble.toFixed(3)}) · Alert flips per event{' '}
        {m.flipsPerEvent.singleRun.toFixed(1)} single run vs {m.flipsPerEvent.blended.toFixed(1)} blended
      </p>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */

/** Dev-only sanity page for the simulation engine (/_sim). */
export default function SimCheckPage() {
  const id = useSimStore((s) => s.scenarioId);
  const setScenario = useSimStore((s) => s.setScenario);
  return (
    <div className="min-h-screen bg-[#EEF2F6] px-4 py-6 text-[#14213D]">
      <div className="mx-auto max-w-[1200px] space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-[28px] font-bold leading-tight">Simulation engine checks</h1>
            <p className="text-[14px]">Dev-only page. Everything here comes from src/sim and is illustrative.</p>
          </div>
          <div className="flex gap-2" role="group" aria-label="Scenario">
            {SCENARIO_IDS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScenario(s)}
                className={`rounded-[4px] border px-3 py-1.5 text-[14px] ${s === id ? 'border-[#1F8A84] bg-[#1F8A84] text-white' : 'border-[#C9D3DE] bg-white'}`}
              >
                {SCENARIOS[s].name}
              </button>
            ))}
          </div>
        </header>
        <ChecksSection id={id} />
        <TracksSection id={id} />
        <FieldsSection id={id} />
        <DownscaleSection id={id} />
        <CalibrationSection id={id} />
        <RiskSection id={id} />
        <PipelineSection id={id} />
        <VerifySection />
      </div>
    </div>
  );
}
