import { useState } from 'react';
import { CartesianGrid, Legend as ChartLegend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useReducedMotion } from 'motion/react';
import { usePageTitle } from '../../app/hooks';
import { CONSOLE_PAGES } from '../../content/site';
import {
  HYSTERESIS_MARGIN,
  LEAD_DAYS,
  SCENARIOS,
  STABLE_BANDS,
  reliability,
  spreadError,
  stableWarnings,
  type LeadDay,
  type WarningLevel,
} from '../../sim';
import { useSimStore } from '../../store';
import { MAP_COLORS } from '../../components/map';
import { MetricTile, Panel, RiskBadge, Tabs } from '../../components/ui';

/** The plain-language explanation from docs/PROTOTYPE_SPEC.md Part 5.7. */
const EXPLANATION =
  'Raw ensemble members agree more than they should. Calibration fixes this, so a 60% alert comes true about 6 times in 10.';

const AXIS = { stroke: MAP_COLORS.ink, fontSize: 13 } as const;
const TOOLTIP_STYLE = { borderRadius: 4, borderColor: MAP_COLORS.line, fontSize: 13 } as const;
const fmt2 = (v: unknown) => (typeof v === 'number' ? v.toFixed(2) : String(v));

function LevelCell({ level }: { level: WarningLevel }) {
  return level === 'none' ? <span className="text-small">No alert</span> : <RiskBadge level={level} size="sm" />;
}

export default function Calibration() {
  const page = CONSOLE_PAGES.find((p) => p.id === 'calibration');
  usePageTitle(page?.name ?? 'Calibration');
  const reduceMotion = useReducedMotion() ?? false;

  const scenarioId = useSimStore((s) => s.scenarioId);
  const day = useSimStore((s) => s.selection.calibrationDay);
  const select = useSimStore((s) => s.select);
  // Charts animate only in response to a tab change, never on first load.
  const [tabChanged, setTabChanged] = useState(false);
  const animate = tabChanged && !reduceMotion;

  const scenario = SCENARIOS[scenarioId];
  const rel = reliability(scenarioId, day);
  const se = spreadError(scenarioId);
  const sw = stableWarnings(scenarioId);

  // Highlight the first consecutive pair where the single run flips but the blended level holds.
  const pairIndex = sw.runs.findIndex((r, i) => {
    const prev = sw.runs[i - 1];
    return i > 0 && prev !== undefined && r.singleLevel !== prev.singleLevel && r.stableLevel === prev.stableLevel;
  });
  const pairA = pairIndex > 0 ? sw.runs[pairIndex - 1] : undefined;
  const pairB = pairIndex > 0 ? sw.runs[pairIndex] : undefined;
  const runShort = (label: string) => label.replace(/^Run /, '').replace(/ \d{4},/, ',');
  const runData = sw.runs.map((r) => ({ run: runShort(r.runLabel), single: r.singleProbability, blended: r.blendedProbability }));

  const tabs = LEAD_DAYS.map((d) => ({ value: String(d), label: `Day ${d}` }));

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <div>
        <h1 className="text-h3 sm:text-h2">Calibration</h1>
        <p className="mt-2 max-w-[70ch] text-body">{page?.summary}</p>
      </div>

      <Panel>
        <p className="max-w-[60ch] font-head text-lead font-semibold sm:text-h3">{EXPLANATION}</p>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-12">
        {/* Reliability */}
        <Panel
          title="Reliability diagram"
          description="How often events happened, for each forecast probability. A perfectly calibrated forecast sits on the diagonal."
          replay
          className="xl:col-span-7"
        >
          <Tabs
            label="Lead time"
            items={tabs}
            value={String(day)}
            onChange={(v) => {
              setTabChanged(true);
              select({ calibrationDay: Number(v) as LeadDay });
            }}
          >
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rel.points} margin={{ top: 8, right: 16, bottom: 24, left: 4 }}>
                  <CartesianGrid stroke={MAP_COLORS.line} strokeDasharray="2 4" />
                  <XAxis
                    dataKey="forecast"
                    type="number"
                    domain={[0, 1]}
                    ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]}
                    {...AXIS}
                    label={{ value: 'Forecast probability', position: 'insideBottom', offset: -14, fontSize: 13, fill: MAP_COLORS.ink }}
                  />
                  <YAxis
                    type="number"
                    domain={[0, 1]}
                    ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]}
                    width={44}
                    {...AXIS}
                    label={{ value: 'Observed frequency', angle: -90, position: 'insideLeft', fontSize: 13, fill: MAP_COLORS.ink, dy: 60 }}
                  />
                  <ReferenceLine
                    segment={[
                      { x: 0, y: 0 },
                      { x: 1, y: 1 },
                    ]}
                    stroke={MAP_COLORS.ink}
                    strokeDasharray="5 4"
                    ifOverflow="hidden"
                  />
                  <Tooltip formatter={fmt2} labelFormatter={(v) => `Forecast ${fmt2(v)}`} contentStyle={TOOLTIP_STYLE} />
                  <ChartLegend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 13 }} />
                  <Line dataKey="raw" name="Raw NEPS-G" stroke={MAP_COLORS.bay} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={animate} />
                  <Line dataKey="calibrated" name="Calibrated" stroke={MAP_COLORS.teal} strokeWidth={3} dot={{ r: 3 }} isAnimationActive={animate} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <MetricTile label="Reliability error, raw" value={rel.rawError.toFixed(3)} />
              <MetricTile label="Reliability error, calibrated" value={rel.calibratedError.toFixed(3)} tone="teal" />
              <MetricTile label="Brier score, raw" value={rel.brierRaw.toFixed(3)} />
              <MetricTile label="Brier score, calibrated" value={rel.brierCalibrated.toFixed(3)} tone="teal" note="Lower is better" />
            </div>
            <p className="mt-3 text-small">
              At Day {day}, the raw curve falls below the diagonal: when raw members say 80%, the event happens far less often. Calibrated
              probabilities track the diagonal.
            </p>
          </Tabs>
        </Panel>

        {/* Spread vs error */}
        <Panel
          title="Spread vs error"
          description={`${se.variable} (${se.units}). A well-calibrated ensemble spreads about as much as it errs.`}
          replay
          className="xl:col-span-5"
        >
          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={se.points} margin={{ top: 8, right: 16, bottom: 24, left: 4 }}>
                <CartesianGrid stroke={MAP_COLORS.line} strokeDasharray="2 4" />
                <XAxis
                  dataKey="leadH"
                  type="number"
                  domain={[24, 240]}
                  ticks={[24, 72, 120, 168, 216]}
                  tickFormatter={(h: number) => `D${h / 24}`}
                  {...AXIS}
                  label={{ value: 'Lead time', position: 'insideBottom', offset: -14, fontSize: 13, fill: MAP_COLORS.ink }}
                />
                <YAxis width={44} {...AXIS} tickFormatter={(v: number) => (se.units === 'km' ? v.toFixed(0) : v.toFixed(1))} />
                <Tooltip
                  formatter={(v) => (typeof v === 'number' ? `${v.toFixed(se.units === 'km' ? 0 : 2)} ${se.units}` : String(v))}
                  labelFormatter={(h) => `T+${String(h)} h`}
                  contentStyle={TOOLTIP_STYLE}
                />
                <ChartLegend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 13 }} />
                <Line dataKey="error" name="Error (RMSE)" stroke={MAP_COLORS.ink} strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line dataKey="rawSpread" name="Raw spread" stroke={MAP_COLORS.bay} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
                <Line dataKey="calibratedSpread" name="Calibrated spread" stroke={MAP_COLORS.teal} strokeWidth={3} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-3 text-small">Raw spread is about half the error, so members look surer than they are. After calibration the two match.</p>
        </Panel>
      </div>

      {/* Stable warnings */}
      <Panel
        title="Stable warnings"
        description={`Severe-threshold probability for the same zone across consecutive runs. Bands: Low from ${STABLE_BANDS.low}, Moderate from ${STABLE_BANDS.moderate}, Severe from ${STABLE_BANDS.severe}.`}
        replay
      >
        {pairA && pairB && (
          <div className="mb-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-panel border border-line p-4">
              <p className="text-small font-semibold">Single run only</p>
              <p className="mt-2 flex flex-wrap items-center gap-2 text-body">
                {runShort(pairA.runLabel)} <LevelCell level={pairA.singleLevel} /> then {runShort(pairB.runLabel)} <LevelCell level={pairB.singleLevel} />
              </p>
              <p className="mt-2 text-small">The level flips between two consecutive runs, though little has changed. Responders would get mixed signals.</p>
            </div>
            <div className="rounded-panel border border-teal p-4">
              <p className="text-small font-semibold">Blended runs with hysteresis</p>
              <p className="mt-2 flex flex-wrap items-center gap-2 text-body">
                {runShort(pairA.runLabel)} <LevelCell level={pairA.stableLevel} /> then {runShort(pairB.runLabel)} <LevelCell level={pairB.stableLevel} />
              </p>
              <p className="mt-2 text-small">
                Each run is blended with the two before it, and a level only drops once the probability falls {HYSTERESIS_MARGIN} below its band.
                The warning holds steady.
              </p>
            </div>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-12">
          <div className="h-[260px] w-full lg:col-span-7">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={runData} margin={{ top: 8, right: 40, bottom: 8, left: 4 }}>
                <CartesianGrid stroke={MAP_COLORS.line} strokeDasharray="2 4" />
                <XAxis dataKey="run" {...AXIS} fontSize={12} interval={0} />
                <YAxis domain={[0, 0.7]} width={40} {...AXIS} tickFormatter={(v: number) => v.toFixed(1)} />
                {[STABLE_BANDS.moderate, STABLE_BANDS.severe].map((b) => (
                  <ReferenceLine key={b} y={b} stroke={MAP_COLORS.ink} strokeDasharray="3 3" label={{ value: b === STABLE_BANDS.severe ? 'Severe band' : 'Moderate band', position: 'insideTopLeft', fontSize: 12, fill: MAP_COLORS.ink }} />
                ))}
                <Tooltip formatter={fmt2} contentStyle={TOOLTIP_STYLE} />
                <ChartLegend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 13 }} />
                <Line dataKey="single" name="Single run" stroke={MAP_COLORS.bay} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} isAnimationActive={false} />
                <Line dataKey="blended" name="Blended" stroke={MAP_COLORS.teal} strokeWidth={3} dot={{ r: 3 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="overflow-x-auto lg:col-span-5">
            <table className="w-full text-small">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="py-2 pr-3 font-semibold">Run</th>
                  <th className="py-2 pr-3 font-semibold">Single run</th>
                  <th className="py-2 font-semibold">Blended + hysteresis</th>
                </tr>
              </thead>
              <tbody>
                {sw.runs.map((r, i) => (
                  <tr key={r.runLabel} className={`border-b border-line ${i === pairIndex || i === pairIndex - 1 ? 'bg-mist' : ''}`}>
                    <td className="py-2 pr-3">{runShort(r.runLabel)}</td>
                    <td className="py-2 pr-3">
                      <span className="flex items-center gap-2">
                        {r.singleProbability.toFixed(2)} <LevelCell level={r.singleLevel} />
                      </span>
                    </td>
                    <td className="py-2">
                      <span className="flex items-center gap-2">
                        {r.blendedProbability.toFixed(2)} <LevelCell level={r.stableLevel} />
                      </span>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="py-2 pr-3 font-semibold">Level changes</td>
                  <td className="py-2 pr-3 font-semibold">{sw.flipsSingle}</td>
                  <td className="py-2 font-semibold">{sw.flipsStable}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <p className="mt-3 text-small">Runs at 00 and 12 UTC leading up to {scenario.run.label}. Probabilities and coefficients are illustrative.</p>
      </Panel>
    </div>
  );
}
