import { useMemo } from 'react';
import { usePageTitle } from '../../app/hooks';
import { CONSOLE_PAGES } from '../../content/site';
import {
  ALL_HAZARDS,
  HAZARD_LABELS,
  PLACES,
  REGIONS,
  SCENARIOS,
  conePolygon,
  efiField,
  formatUtc,
  getEnsemble,
  trackAt,
  validTime,
  type HazardType,
} from '../../sim';
import { useSimStore } from '../../store';
import { LeadTimeSlider, MAP_COLORS, MapCanvas, PATH_COLORS, fieldColormap, fieldRamp, type LegendItem, type MarkerItem, type TrackLayerItem } from '../../components/map';
import { Button, Legend, MetricTile, Panel, ToggleButton } from '../../components/ui';

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-line py-3 first:border-t-0 first:pt-0">
      <dt className="text-small">{label}</dt>
      <dd className="mt-0.5 text-body">{children}</dd>
    </div>
  );
}

export default function ThreatTracker() {
  const page = CONSOLE_PAGES.find((p) => p.id === 'tracker');
  usePageTitle(page?.name ?? 'Threat tracker');

  const scenarioId = useSimStore((s) => s.scenarioId);
  const leadH = useSimStore((s) => s.leadH);
  const setLeadH = useSimStore((s) => s.setLeadH);
  const playing = useSimStore((s) => s.leadPlaying);
  const setPlaying = useSimStore((s) => s.setLeadPlaying);
  const sel = useSimStore((s) => s.selection);
  const select = useSimStore((s) => s.select);
  const toggleLayer = useSimStore((s) => s.toggleLayer);
  const toggleHazard = useSimStore((s) => s.toggleHazard);

  const scenario = SCENARIOS[scenarioId];
  const region = REGIONS[scenario.regionId];
  const ensemble = getEnsemble(scenarioId);
  const threat = ensemble.threat;
  const pathIndex = sel.pathIndex;
  const { layers } = sel;

  // The threat shows when any of its hazards is selected in the filter.
  const visible = scenario.hazards.some((h) => sel.hazards.includes(h));
  const isCyclone = scenario.trackKind === 'cyclone';

  const raster = useMemo(
    () =>
      layers.efi
        ? { field: efiField(scenarioId, leadH), colormap: fieldColormap('efi'), cacheKey: `${scenarioId}|efi|${leadH}`, opacity: 0.8 }
        : null,
    [layers.efi, scenarioId, leadH],
  );

  const memberTracks = useMemo<TrackLayerItem[]>(() => {
    if (!visible || !layers.memberTracks) return [];
    return ensemble.members.map((m) => {
      const inPath = pathIndex === null || m.clusterIndex === pathIndex;
      return {
        id: `m${m.member}`,
        points: m.points,
        color: PATH_COLORS[m.clusterIndex] ?? MAP_COLORS.ink,
        width: pathIndex !== null && inPath ? 1.5 : 1,
        opacity: pathIndex === null ? 0.45 : inPath ? 0.95 : 0.08,
      };
    });
  }, [visible, layers.memberTracks, ensemble, pathIndex]);

  const scenarioPaths = useMemo<TrackLayerItem[]>(() => {
    if (!visible || !layers.scenarios) return [];
    return ensemble.paths.map((p) => ({
      id: p.key,
      points: p.meanTrack,
      color: PATH_COLORS[p.index] ?? MAP_COLORS.ink,
      label: `${p.label} ${Math.round(p.calibratedProbability * 100)}%`,
      selected: pathIndex === p.index,
      opacity: pathIndex === null || pathIndex === p.index ? 1 : 0.3,
      onSelect: () => select({ pathIndex: pathIndex === p.index ? null : p.index }),
    }));
  }, [visible, layers.scenarios, ensemble, pathIndex, select]);

  const cone = useMemo(() => (visible && layers.cone ? conePolygon(ensemble.cone, isCyclone ? 'track' : 'envelope') : null), [visible, layers.cone, ensemble, isCyclone]);

  const tube = ensemble.tube.find((t) => t.leadH === leadH);
  const centre = trackAt(ensemble.mean, leadH);
  const coneNow = ensemble.cone.find((c) => c.leadH === leadH);

  const markers = useMemo<MarkerItem[]>(() => {
    const out: MarkerItem[] = [];
    if (visible) {
      for (const m of ensemble.members) {
        if (pathIndex !== null && m.clusterIndex !== pathIndex) continue;
        const p = trackAt(m.points, leadH);
        if (p) out.push({ id: `pos${m.member}`, lat: p.lat, lon: p.lon, kind: 'member', color: PATH_COLORS[m.clusterIndex] });
      }
      if (centre) out.push({ id: 'centre', lat: centre.lat, lon: centre.lon, kind: isCyclone ? 'storm' : 'core', label: 'Ensemble mean', color: MAP_COLORS.ink });
    }
    for (const pl of PLACES) {
      if (scenario.mapPlaces.includes(pl.name)) out.push({ id: pl.name, lat: pl.lat, lon: pl.lon, label: pl.name, kind: 'place' });
    }
    return out;
  }, [visible, ensemble, pathIndex, leadH, centre, isCyclone, scenario]);

  const legendItems: LegendItem[] = [
    ...(layers.memberTracks ? [{ label: 'Member tracks', color: MAP_COLORS.teal, symbol: 'line' as const }] : []),
    ...(layers.scenarios ? [{ label: 'Scenario paths', color: MAP_COLORS.bay, symbol: 'thick-line' as const }] : []),
    ...(layers.cone ? [{ label: 'Probability cone', color: MAP_COLORS.teal, symbol: 'area' as const }] : []),
    { label: '4D threat box', color: MAP_COLORS.ink, symbol: 'box' as const },
  ];

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <div>
        <h1 className="text-h3 sm:text-h2">Threat tracker</h1>
        <p className="mt-2 max-w-[70ch] text-body">{page?.summary}</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        {/* Map */}
        <Panel
          title={`${region.name} · ${scenario.run.label}`}
          description="Drag to pan, scroll to zoom. Click a scenario path to highlight its members."
          replay
          bleed
          className="xl:col-span-8"
        >
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3" role="group" aria-label="Map layers">
            <span className="mr-1 text-small">Layers</span>
            <ToggleButton pressed={layers.memberTracks} onClick={() => toggleLayer('memberTracks')}>
              Member tracks
            </ToggleButton>
            <ToggleButton pressed={layers.scenarios} onClick={() => toggleLayer('scenarios')}>
              Scenarios
            </ToggleButton>
            <ToggleButton pressed={layers.cone} onClick={() => toggleLayer('cone')}>
              Probability cone
            </ToggleButton>
            <ToggleButton pressed={layers.efi} onClick={() => toggleLayer('efi')}>
              EFI field
            </ToggleButton>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3" role="group" aria-label="Hazard filter">
            <span className="mr-1 text-small">Hazards</span>
            {ALL_HAZARDS.map((h: HazardType) => {
              const present = scenario.hazards.includes(h);
              return (
                <ToggleButton key={h} pressed={present && sel.hazards.includes(h)} onClick={() => toggleHazard(h)} disabled={!present}>
                  {HAZARD_LABELS[h]}
                </ToggleButton>
              );
            })}
          </div>
          <MapCanvas
            bbox={region.bbox}
            label={`${region.name}: ${threat.title} at T+${leadH} h`}
            raster={raster}
            memberTracks={memberTracks}
            scenarioPaths={scenarioPaths}
            cone={cone}
            box={visible && tube ? { id: 'tube', bbox: tube.bbox, label: `4D box · T+${leadH} h`, dashed: true } : null}
            markers={markers}
            legend={<Legend ramp={layers.efi ? fieldRamp('efi') : undefined} items={visible ? legendItems : []} />}
            className="h-[440px] sm:h-[560px]"
          />
          <div className="border-t border-line px-4 py-3">
            <LeadTimeSlider value={leadH} onChange={setLeadH} playing={playing} onPlayingChange={setPlaying} formatValid={(h) => formatUtc(validTime(scenario, h))} />
          </div>
        </Panel>

        {/* Threat details */}
        <Panel title="Threat details" replay className="xl:col-span-4">
          {!visible ? (
            <div className="space-y-3">
              <p className="text-body">No threat in this run matches the selected hazards.</p>
              <Button size="sm" variant="secondary" onClick={() => select({ hazards: [...scenario.hazards] })}>
                Show all hazards
              </Button>
            </div>
          ) : (
            <dl>
              <DetailRow label="Type">
                <span className="font-head text-lead font-semibold">{threat.title}</span>
                <span className="mt-1 block text-small">{scenario.hazards.map((h) => HAZARD_LABELS[h]).join(' · ')}</span>
              </DetailRow>

              <DetailRow label="Scenarios (calibrated)">
                <ul className="mt-1 space-y-2">
                  {ensemble.paths.map((p) => {
                    const on = pathIndex === p.index;
                    return (
                      <li key={p.key}>
                        <button
                          type="button"
                          aria-pressed={on}
                          onClick={() => select({ pathIndex: on ? null : p.index })}
                          className={`w-full rounded-chip border px-2 py-1.5 text-left ${on ? 'border-ink bg-mist' : 'border-transparent hover:border-line'}`}
                        >
                          <span className="flex items-baseline justify-between gap-3">
                            <span className="flex items-center gap-2">
                              <span className="inline-block h-1 w-5 rounded-full" style={{ background: PATH_COLORS[p.index] }} aria-hidden="true" />
                              <span className={on ? 'font-semibold' : ''}>{p.label}</span>
                            </span>
                            <span className="font-semibold tabular-nums">{Math.round(p.calibratedProbability * 100)}%</span>
                          </span>
                          <span className="mt-1 block h-1.5 rounded-full bg-mist" aria-hidden="true">
                            <span className="block h-full rounded-full" style={{ width: `${p.calibratedProbability * 100}%`, background: PATH_COLORS[p.index] }} />
                          </span>
                          <span className="mt-0.5 block text-small tabular-nums">{p.members.length} of 23 members</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {pathIndex !== null && (
                  <Button size="sm" variant="ghost" className="mt-2" onClick={() => select({ pathIndex: null })}>
                    Show all members
                  </Button>
                )}
              </DetailRow>

              <DetailRow label="Core location">
                {threat.core.place.name}
                <span className="block text-small tabular-nums">
                  {threat.core.lat.toFixed(2)}°N {threat.core.lon.toFixed(2)}°E
                </span>
              </DetailRow>

              <DetailRow label={isCyclone ? 'Expected landfall window' : 'Expected timing window'}>
                <span className="tabular-nums">{threat.timing.label.replace(/^Landfall /, '')}</span>
                <span className="block text-small tabular-nums">
                  T+{threat.timing.fromH} to T+{threat.timing.toH} h (10th to 90th percentile of members)
                </span>
              </DetailRow>

              <DetailRow label="Member agreement">
                <span className="font-head text-lead font-semibold tabular-nums">
                  {threat.agreement.count} of {threat.agreement.total} members agree
                </span>
                <span className="block text-small">{threat.agreement.criterion.charAt(0).toUpperCase() + threat.agreement.criterion.slice(1)}</span>
              </DetailRow>

              <DetailRow label="Key drivers">
                <ul className="list-disc space-y-1 pl-5">
                  {threat.drivers.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              </DetailRow>

              <DetailRow label={`At T+${leadH} h`}>
                {centre ? (
                  <div className="mt-1 grid grid-cols-2 gap-3">
                    <MetricTile label={isCyclone ? 'Ensemble-mean wind' : 'Mean core anomaly'} value={isCyclone ? Math.round(centre.intensity) : `+${centre.intensity.toFixed(1)}`} unit={isCyclone ? 'km/h' : '°C'} />
                    <MetricTile label="Cone radius" value={coneNow ? Math.round(coneNow.radiusKm) : '–'} unit="km" />
                  </div>
                ) : (
                  <span className="text-small">Tracks end at T+{ensemble.mean[ensemble.mean.length - 1]?.leadH ?? 0} h, when the system has weakened over land.</span>
                )}
              </DetailRow>
            </dl>
          )}
        </Panel>
      </div>
    </div>
  );
}
