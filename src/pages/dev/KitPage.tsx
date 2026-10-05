import { useMemo, useState } from 'react';
import {
  LeadTimeSlider,
  Legend,
  MAP_COLORS,
  MapCanvas,
  PATH_COLORS,
  type LegendItem,
  type MapProjection,
  type MarkerItem,
  type TrackLayerItem,
  type ZoneItem,
} from '../../components/map';
import {
  PLACES,
  REGIONS,
  SCENARIOS,
  conePolygon,
  downscale,
  efiField,
  formatUtc,
  getAlerts,
  getBox,
  getEnsemble,
  getRisk,
  regionField,
  trackAt,
  validTime,
  type TrackPoint,
} from '../../sim';
import { useSimStore } from '../../store';
import { ReplayChip, ToggleButton } from '../../components/ui';
import { KitComponents } from './KitComponents';
import { DIVERGING_STOPS, RAIN_STOPS, RISK_COLORS, rainColor } from '../../styles/colormaps';
import { fieldColormap } from '../../components/map';

const SCENARIO_ID = 'cyclone' as const;
const PLACE_NAMES = ['Digha', 'Kolkata', 'Sundarbans', 'Hatiya', 'Paradip', 'Visakhapatnam', 'Sohra'];

type FieldMode = 'rain' | 'efi' | 'off';

function TrackerDemo() {
  const scenario = SCENARIOS[SCENARIO_ID];
  const ensemble = getEnsemble(SCENARIO_ID);
  const region = REGIONS[scenario.regionId].bbox;
  const leadH = useSimStore((s) => s.leadH);
  const setLeadH = useSimStore((s) => s.setLeadH);
  const playing = useSimStore((s) => s.leadPlaying);
  const setPlaying = useSimStore((s) => s.setLeadPlaying);
  const pathIndex = useSimStore((s) => s.selection.pathIndex);
  const select = useSimStore((s) => s.select);

  const [fieldMode, setFieldMode] = useState<FieldMode>('rain');
  // ?projection=mercator opens the kit in Mercator (handy for screenshots).
  const [projection, setProjection] = useState<MapProjection>(() =>
    new URLSearchParams(window.location.search).get('projection') === 'mercator' ? 'mercator' : 'equirectangular',
  );
  const [layers, setLayers] = useState({ members: true, paths: true, cone: true, box: true, zones: false, places: true });
  const flip = (k: keyof typeof layers) => setLayers((l) => ({ ...l, [k]: !l[k] }));

  const raster = useMemo(() => {
    if (fieldMode === 'rain')
      return { field: regionField(SCENARIO_ID, leadH), colormap: rainColor, cacheKey: `${SCENARIO_ID}|rain|${leadH}`, opacity: 0.85 };
    if (fieldMode === 'efi')
      return { field: efiField(SCENARIO_ID, leadH), colormap: fieldColormap('efi'), cacheKey: `${SCENARIO_ID}|efi|${leadH}`, opacity: 0.7 };
    return null;
  }, [fieldMode, leadH]);

  const memberTracks: TrackLayerItem[] = ensemble.members.map((m) => {
    const inPath = pathIndex === null || m.clusterIndex === pathIndex;
    return {
      id: `m${m.member}`,
      points: m.points,
      color: PATH_COLORS[m.clusterIndex] ?? MAP_COLORS.ink,
      width: pathIndex !== null && inPath ? 1.4 : 1,
      opacity: pathIndex === null ? 0.45 : inPath ? 0.9 : 0.1,
    };
  });

  const scenarioPaths: TrackLayerItem[] = ensemble.paths.map((p) => ({
    id: p.key,
    points: p.meanTrack,
    color: PATH_COLORS[p.index] ?? MAP_COLORS.ink,
    label: `${p.label} ${Math.round(p.calibratedProbability * 100)}%`,
    selected: pathIndex === p.index,
    opacity: pathIndex === null || pathIndex === p.index ? 1 : 0.35,
    onSelect: () => select({ pathIndex: pathIndex === p.index ? null : p.index }),
  }));

  const markers: MarkerItem[] = [];
  if (layers.members) {
    for (const m of ensemble.members) {
      const p: TrackPoint | null = trackAt(m.points, leadH);
      if (p && (pathIndex === null || m.clusterIndex === pathIndex))
        markers.push({ id: `pos${m.member}`, lat: p.lat, lon: p.lon, kind: 'member', color: PATH_COLORS[m.clusterIndex] });
    }
  }
  const centre = trackAt(ensemble.mean, leadH);
  if (centre) markers.push({ id: 'mean', lat: centre.lat, lon: centre.lon, kind: 'storm', label: `Ensemble mean · ${Math.round(centre.intensity)} km/h`, color: MAP_COLORS.ink });
  if (layers.places)
    for (const name of PLACE_NAMES) {
      const pl = PLACES.find((p) => p.name === name);
      if (pl) markers.push({ id: pl.name, lat: pl.lat, lon: pl.lon, label: pl.name, kind: 'place' });
    }

  const tube = ensemble.tube.find((t) => t.leadH === leadH);
  const zones: ZoneItem[] = layers.zones
    ? getRisk(SCENARIO_ID).zones.flatMap((z) => (z.level ? [{ id: z.id, bbox: z.bbox, level: z.level }] : []))
    : [];

  const legendItems: LegendItem[] = [
    ...(layers.members ? [{ label: 'Member tracks (23)', color: MAP_COLORS.teal, symbol: 'line' as const }] : []),
    ...(layers.paths ? [{ label: 'Scenario paths', color: MAP_COLORS.bay, symbol: 'thick-line' as const }] : []),
    ...(layers.cone ? [{ label: 'Probability cone', color: MAP_COLORS.teal, symbol: 'area' as const }] : []),
    ...(layers.box ? [{ label: '4D threat box', color: MAP_COLORS.ink, symbol: 'box' as const }] : []),
    ...(layers.zones
      ? [
          { label: 'Low', color: RISK_COLORS.low, symbol: 'swatch' as const },
          { label: 'Moderate', color: RISK_COLORS.moderate, symbol: 'swatch' as const },
          { label: 'Severe', color: RISK_COLORS.severe, symbol: 'swatch' as const },
        ]
      : []),
  ];

  const legend = (
    <Legend
      ramp={
        fieldMode === 'rain'
          ? { title: '24 h rainfall', units: 'mm/day', stops: RAIN_STOPS, ticks: [5, 64, 115, 204] }
          : fieldMode === 'efi'
            ? { title: 'Extreme Forecast Index', stops: DIVERGING_STOPS, ticks: [-1, 0, 1] }
            : undefined
      }
      items={legendItems}
    />
  );

  return (
    <section className="rounded-panel border border-line bg-paper">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h2 className="text-lead font-semibold">MapCanvas · {scenario.name}</h2>
          <p className="text-small">{scenario.run.label} · drag to pan, scroll or use + / − to zoom, click a scenario path to highlight its members</p>
        </div>
        <ReplayChip />
      </div>
      <div className="flex flex-wrap gap-2 border-b border-line px-4 py-3" role="group" aria-label="Map layers">
        <ToggleButton pressed={fieldMode === 'rain'} onClick={() => setFieldMode('rain')}>
          Rain field
        </ToggleButton>
        <ToggleButton pressed={fieldMode === 'efi'} onClick={() => setFieldMode('efi')}>
          EFI field
        </ToggleButton>
        <ToggleButton pressed={fieldMode === 'off'} onClick={() => setFieldMode('off')}>
          No field
        </ToggleButton>
        <span className="mx-1 w-px self-stretch bg-line" aria-hidden="true" />
        <ToggleButton pressed={layers.members} onClick={() => flip('members')}>
          Member tracks
        </ToggleButton>
        <ToggleButton pressed={layers.paths} onClick={() => flip('paths')}>
          Scenarios
        </ToggleButton>
        <ToggleButton pressed={layers.cone} onClick={() => flip('cone')}>
          Probability cone
        </ToggleButton>
        <ToggleButton pressed={layers.box} onClick={() => flip('box')}>
          4D box
        </ToggleButton>
        <ToggleButton pressed={layers.zones} onClick={() => flip('zones')}>
          Risk zones
        </ToggleButton>
        <ToggleButton pressed={layers.places} onClick={() => flip('places')}>
          Places
        </ToggleButton>
        <span className="mx-1 w-px self-stretch bg-line" aria-hidden="true" />
        <ToggleButton pressed={projection === 'equirectangular'} onClick={() => setProjection('equirectangular')}>
          Equirectangular
        </ToggleButton>
        <ToggleButton pressed={projection === 'mercator'} onClick={() => setProjection('mercator')}>
          Mercator
        </ToggleButton>
      </div>
      <MapCanvas
        bbox={region}
        projection={projection}
        label={`${REGIONS[scenario.regionId].name}: cyclone member tracks at T+${leadH} h`}
        raster={raster}
        zones={zones}
        memberTracks={layers.members ? memberTracks : []}
        scenarioPaths={layers.paths ? scenarioPaths : []}
        cone={layers.cone ? conePolygon(ensemble.cone) : null}
        box={layers.box && tube ? { id: 'tube', bbox: tube.bbox, label: `4D box · T+${leadH} h`, dashed: true } : null}
        markers={markers}
        legend={legend}
        className="h-[420px] md:h-[560px]"
      />
      <div className="border-t border-line px-4 py-3">
        <LeadTimeSlider
          value={leadH}
          onChange={setLeadH}
          playing={playing}
          onPlayingChange={setPlaying}
          formatValid={(h) => formatUtc(validTime(scenario, h))}
        />
        <p className="mt-2 text-small tabular-nums">
          Risk zones are valid for T+96 to T+132 h windows · the 4D box ends with the tracks at T+144 h
        </p>
      </div>
    </section>
  );
}

function ZoneDemo() {
  const box = getBox(SCENARIO_ID, 'cyc-coast');
  const severe = getAlerts(SCENARIO_ID)[0];
  const sharp = downscale(SCENARIO_ID, box.id, 'diffusion');
  const [showField, setShowField] = useState(true);
  const zones: ZoneItem[] = getRisk(SCENARIO_ID).zones.flatMap((z) =>
    z.boxId === box.id && z.level ? [{ id: z.id, bbox: z.bbox, level: z.level }] : [],
  );
  const markers: MarkerItem[] = PLACES.filter(
    (p) => p.lat > box.bbox.latMin && p.lat < box.bbox.latMax && p.lon > box.bbox.lonMin && p.lon < box.bbox.lonMax,
  ).map((p) => ({ id: p.name, lat: p.lat, lon: p.lon, label: p.name, kind: 'place' }));
  if (severe) markers.push({ id: 'core', lat: severe.core.lat, lon: severe.core.lon, kind: 'core', label: 'Severe core' });

  return (
    <section className="rounded-panel border border-line bg-paper">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h2 className="text-lead font-semibold">Risk zones · {box.label}</h2>
          <p className="text-small">5 km diffusion output with Low / Moderate / Severe zones; the Severe alert's area is outlined</p>
        </div>
        <div className="flex items-center gap-2">
          <ToggleButton pressed={showField} onClick={() => setShowField((v) => !v)}>
            5 km rain field
          </ToggleButton>
          <ReplayChip />
        </div>
      </div>
      <MapCanvas
        bbox={box.bbox}
        label={`${box.label}: 5 km risk zones`}
        raster={showField ? { field: sharp.field, colormap: rainColor, cacheKey: `${SCENARIO_ID}|${box.id}|diffusion|0`, opacity: 0.6 } : null}
        zones={zones}
        zoneOpacity={showField ? 0.55 : 0.85}
        outline={severe?.polygon ?? null}
        markers={markers}
        legend={
          <Legend
            items={[
              { label: 'Low', color: RISK_COLORS.low, symbol: 'swatch' },
              { label: 'Moderate', color: RISK_COLORS.moderate, symbol: 'swatch' },
              { label: 'Severe', color: RISK_COLORS.severe, symbol: 'swatch' },
              { label: 'Severe alert area', color: MAP_COLORS.ink, symbol: 'box' },
            ]}
          />
        }
        className="h-[420px]"
      />
    </section>
  );
}

/** Dev-only component kit (/_kit): design-system components, then the map components. */
export default function KitPage() {
  return (
    <div className="min-h-screen bg-mist px-4 py-8 text-ink sm:px-6">
      <div className="mx-auto max-w-[1200px] space-y-10">
        <header>
          <h1 className="text-h2">Component kit</h1>
          <p className="mt-2 max-w-[70ch] text-body">Dev-only page. Every design-system component in all its states, then the map components with the cyclone replay.</p>
        </header>
        <KitComponents />
        <section className="space-y-4 border-t border-line pt-6">
          <h2 className="text-h3">Map</h2>
          <TrackerDemo />
          <ZoneDemo />
        </section>
      </div>
    </div>
  );
}
