import { useEffect, useId, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { MapCanvas, PATH_COLORS, MAP_COLORS, type MapOverlayApi } from '../map';
import { ReplayChip } from '../ui/ReplayChip';
import {
  SCENARIOS,
  conePolygon,
  formatUtc,
  getAlerts,
  getEnsemble,
  getRisk,
  trackAt,
  validTime,
  type BBox,
  type LatLon,
} from '../../sim';
import { RISK_COLORS } from '../../styles/colormaps';
import { HERO } from '../../content/site';

const SCENARIO_ID = 'cyclone' as const;
const BBOX: BBox = { latMin: 8, latMax: 25.5, lonMin: 80.5, lonMax: 95.5 };
const LEAD_MAX = 120;
const LEAD_START = 96;

/** Animation stages: tracks draw → cluster into paths → cone → 5 km patch → interactive. */
type Stage = 0 | 1 | 2 | 3 | 4;
const STAGE_AT_MS: Record<Exclude<Stage, 0>, number> = { 1: 2000, 2: 2900, 3: 3600, 4: 4300 };

// The orchestrated moment plays once per page load, not on every visit to Home.
let heroHasPlayed = false;

function toPath(api: MapOverlayApi, points: readonly LatLon[], close = false): string {
  let d = '';
  for (const p of points) {
    const s = api.toScreen(p);
    if (s) d += `${d ? 'L' : 'M'}${s[0].toFixed(1)},${s[1].toFixed(1)}`;
  }
  return close && d ? `${d}Z` : d;
}

/** Isobar-like rings around the storm, slightly stretched along its motion. */
function isobarRings(center: LatLon, heading: number): LatLon[][] {
  const radiiKm = [80, 165, 260, 370, 500, 650];
  const cosLat = Math.cos((center.lat * Math.PI) / 180);
  return radiiKm.map((r, k) => {
    const ring: LatLon[] = [];
    for (let i = 0; i <= 96; i++) {
      const t = (i / 96) * Math.PI * 2;
      const wobble = 1 + 0.06 * Math.sin(3 * t + k) + 0.04 * Math.sin(2 * t - k * 0.7);
      const along = r * 1.15 * wobble * Math.cos(t);
      const across = r * 0.92 * wobble * Math.sin(t);
      const dx = along * Math.cos(heading) - across * Math.sin(heading);
      const dy = along * Math.sin(heading) + across * Math.cos(heading);
      ring.push({ lat: center.lat + dy / 111.2, lon: center.lon + dx / (111.2 * cosLat) });
    }
    return ring;
  });
}

export function HeroChart() {
  const prefersReduced = useReducedMotion() ?? false;
  // ?motion=full plays the sequence even when the OS asks for reduced motion (explicit opt-in for demos).
  const forceMotion = new URLSearchParams(window.location.search).get('motion') === 'full';
  const reduce = prefersReduced && !forceMotion;
  // Decided once per mount, so later re-renders cannot cut the sequence short.
  const [animate] = useState(() => !heroHasPlayed);
  const skip = reduce || !animate;
  const [stage, setStage] = useState<Stage>(skip ? 4 : 0);
  const [leadH, setLeadH] = useState(LEAD_START);
  const sliderId = useId();

  useEffect(() => {
    if (!animate) return;
    heroHasPlayed = true;
    if (reduce) {
      // Reduced motion: show the end state at once.
      setStage(4);
      return;
    }
    const timers = ([1, 2, 3, 4] as const).map((s) => window.setTimeout(() => setStage(s), STAGE_AT_MS[s]));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [animate, reduce]);

  const scenario = SCENARIOS[SCENARIO_ID];
  const ensemble = getEnsemble(SCENARIO_ID);
  const cone = useMemo(() => conePolygon(ensemble.cone.filter((c) => c.leadH <= LEAD_MAX + 12)), [ensemble]);
  const severe = useMemo(() => getRisk(SCENARIO_ID).zones.filter((z) => z.level === 'severe'), []);
  const severeAlert = getAlerts(SCENARIO_ID)[0];
  const patchValid = severeAlert ? leadH >= severeAlert.leadH && leadH <= severeAlert.validToH : false;

  const centre = trackAt(ensemble.mean, leadH);
  const before = trackAt(ensemble.mean, Math.max(0, leadH - 6));
  const heading = centre && before ? Math.atan2(centre.lat - before.lat, (centre.lon - before.lon) * Math.cos((centre.lat * Math.PI) / 180)) : Math.PI / 2;

  const t = (duration: number, delay = 0) => (skip ? { duration: 0 } : { duration, delay, ease: 'easeInOut' as const });
  const interactive = stage === 4;

  const overlay = (api: MapOverlayApi) => (
    <g>
      {/* Isobars around the storm at the selected lead time */}
      {centre &&
        isobarRings(centre, heading).map((ring, k) => (
          <path key={`iso${k}`} d={toPath(api, ring, true)} fill="none" stroke={MAP_COLORS.ink} strokeOpacity={0.22} strokeWidth={k % 2 === 1 ? 1.2 : 0.8} />
        ))}

      {/* Probability cone */}
      <motion.path
        d={toPath(api, cone, true)}
        fill={MAP_COLORS.teal}
        stroke={MAP_COLORS.teal}
        strokeWidth={1}
        initial={false}
        animate={{ fillOpacity: stage >= 2 ? 0.13 : 0, strokeOpacity: stage >= 2 ? 0.7 : 0 }}
        transition={t(0.6)}
      />

      {/* 23 member tracks draw in, then step back once they are clustered */}
      {ensemble.members.map((m, i) => (
        <motion.path
          key={m.member}
          d={toPath(api, m.points.filter((p) => p.leadH <= LEAD_MAX + 12))}
          fill="none"
          stroke={PATH_COLORS[m.clusterIndex] ?? MAP_COLORS.ink}
          strokeWidth={1}
          strokeLinecap="round"
          initial={skip ? false : { pathLength: 0, opacity: 0.8 }}
          animate={{ pathLength: 1, opacity: stage >= 1 ? 0.28 : 0.8 }}
          transition={{ pathLength: t(1.1, i * 0.035), opacity: t(0.6) }}
        />
      ))}

      {/* Scenario paths */}
      {ensemble.paths.map((p, i) => (
        <motion.path
          key={p.key}
          d={toPath(api, p.meanTrack.filter((q) => q.leadH <= LEAD_MAX + 12))}
          fill="none"
          stroke={PATH_COLORS[p.index] ?? MAP_COLORS.ink}
          strokeWidth={3}
          strokeLinecap="round"
          initial={skip ? false : { pathLength: 0, opacity: 0 }}
          animate={stage >= 1 ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
          transition={t(0.8, i * 0.12)}
        />
      ))}

      {/* 5 km Severe patch at the coast, valid for the alert window */}
      <motion.g initial={false} animate={{ opacity: stage >= 3 && patchValid ? 1 : 0 }} transition={t(0.5)}>
        {severe.map((z) => {
          const a = api.toScreen({ lat: z.bbox.latMax, lon: z.bbox.lonMin });
          const b = api.toScreen({ lat: z.bbox.latMin, lon: z.bbox.lonMax });
          return a && b ? <rect key={z.id} x={a[0]} y={a[1]} width={b[0] - a[0]} height={b[1] - a[1]} fill={RISK_COLORS.severe} /> : null;
        })}
        {severeAlert && (
          <>
            <path d={toPath(api, severeAlert.polygon, true)} fill="none" stroke={MAP_COLORS.ink} strokeWidth={1.5} />
            {(() => {
              const s = api.toScreen({ lat: severeAlert.core.lat, lon: severeAlert.core.lon });
              return s ? (
                <text x={s[0] - 14} y={s[1] - 16} textAnchor="end" className="hero-label" fill={MAP_COLORS.ink} fontWeight={600}>
                  Severe · 5 km zone
                </text>
              ) : null;
            })()}
          </>
        )}
      </motion.g>

      {/* Storm position at the selected lead time */}
      {centre &&
        (() => {
          const s = api.toScreen(centre);
          return s ? (
            <motion.g initial={false} animate={{ opacity: stage >= 4 ? 1 : 0 }} transition={t(0.4)} transform={`translate(${s[0].toFixed(1)},${s[1].toFixed(1)})`}>
              <g stroke={MAP_COLORS.ink} fill="none" strokeWidth={2}>
                <circle r={4} fill={MAP_COLORS.ink} />
                <path d="M0,-10 A10,10 0 0 1 10,0" />
                <path d="M0,10 A10,10 0 0 1 -10,0" />
              </g>
            </motion.g>
          ) : null;
        })()}
      <style>{`.hero-label{font-size:13px;paint-order:stroke;stroke:${MAP_COLORS.paper};stroke-width:3px;stroke-linejoin:round}`}</style>
    </g>
  );

  const valid = formatUtc(validTime(scenario, leadH));
  const pct = (leadH / LEAD_MAX) * 100;

  return (
    <figure className="m-0 overflow-hidden rounded-panel border border-line bg-paper">
      <div className="relative">
        <MapCanvas
          bbox={BBOX}
          interactive={false}
          label={`Synoptic chart of the Bay of Bengal: 23 member tracks of the cyclone replay at T+${leadH} h`}
          overlay={overlay}
          className="h-[360px] sm:h-[460px]"
        />
        <div className="absolute left-3 top-3">
          <ReplayChip />
        </div>
      </div>
      <div className="border-t border-line px-4 py-3">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-small tabular-nums">
          <label htmlFor={sliderId} className="font-semibold">
            Lead time T+{leadH} h
          </label>
          <span>Valid {valid}</span>
        </div>
        <input
          id={sliderId}
          type="range"
          min={0}
          max={LEAD_MAX}
          step={6}
          value={leadH}
          disabled={!interactive}
          onChange={(e) => setLeadH(Number(e.target.value))}
          aria-valuetext={`T plus ${leadH} hours, valid ${valid}`}
          className="lead-slider w-full disabled:cursor-default"
          style={{ background: `linear-gradient(to right, var(--teal) ${pct}%, var(--line) ${pct}%)` }}
        />
        <figcaption className="mt-2 text-small">{severeAlert && patchValid ? `${HERO.chartCaption} The Severe zone is valid T+${severeAlert.leadH} to T+${severeAlert.validToH} h.` : HERO.chartCaption}</figcaption>
      </div>
    </figure>
  );
}
