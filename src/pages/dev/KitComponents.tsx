import { useEffect, useState, type ReactNode } from 'react';
import { Play, RotateCcw } from 'lucide-react';
import {
  Button,
  Legend,
  LogStream,
  MetricTile,
  Panel,
  PhoneFrame,
  ReplayChip,
  RiskBadge,
  StatusChip,
  StepTimeline,
  Tabs,
  Toggle,
  ToggleButton,
  ToggleGroup,
  type LogEntry,
  type Status,
  type TimelineStep,
} from '../../components/ui';
import { COLORS, RISK_COLORS, TYPE_SCALE } from '../../styles/tokens';
import { DIVERGING_STOPS, RAIN_STOPS } from '../../styles/colormaps';
import { STEPS } from '../../sim';

function KitSection({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="border-t border-line pt-6">
      <h2 className="text-h3">{title}</h2>
      {note && <p className="mt-1 max-w-[70ch] text-small">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-2 py-2 sm:grid-cols-[160px_1fr] sm:items-center">
      <p className="text-small">{label}</p>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

function Swatch({ name, hex, note }: { name: string; hex: string; note?: string }) {
  return (
    <div className="w-[150px]">
      <div className="h-14 rounded-chip border border-line" style={{ background: hex }} />
      <p className="mt-1 text-small font-semibold">{name}</p>
      <p className="text-small tabular-nums">{hex}</p>
      {note && <p className="text-small">{note}</p>}
    </div>
  );
}

function Ramp({ stops, label }: { stops: typeof RAIN_STOPS; label: string }) {
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (!first || !last) return null;
  const span = last.at - first.at;
  const css = stops
    .map((s) => {
      const n = parseInt(s.color.slice(1), 16);
      return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${s.alpha ?? 1}) ${(((s.at - first.at) / span) * 100).toFixed(1)}%`;
    })
    .join(', ');
  return (
    <div className="max-w-[480px]">
      <p className="text-small font-semibold">{label}</p>
      <div className="mt-1 h-4 rounded-chip border border-line" style={{ background: `linear-gradient(to right, ${css})` }} />
      <div className="mt-1 flex justify-between text-small tabular-nums">
        {stops.map((s) => (
          <span key={s.at}>{s.at}</span>
        ))}
      </div>
    </div>
  );
}

const STATUSES: Status[] = ['idle', 'waiting', 'running', 'paused', 'done', 'pass', 'fail', 'pending', 'approved', 'held'];

const SAMPLE_LOG = [
  'NEPS-G run 16 May 2020, 00 UTC announced · 23 members expected',
  'Received member 01/23 · 12 km · 41 lead times',
  'Received member 02/23 · 12 km · 41 lead times',
  'Wrote 2,952 chunks to Zarr store',
  'EFI computed vs 30-yr baseline · max 0.94 (rain)',
  'Tier-1 screening: 2 candidate regions',
  'Linked 23 member tracks · 3 scenarios',
];

function LiveTimelineDemo() {
  const [k, setK] = useState(3);
  const [p, setP] = useState(0.4);
  useEffect(() => {
    const t = window.setInterval(() => {
      setP((v) => {
        if (v >= 1) {
          setK((x) => (x + 1) % (STEPS.length + 1));
          return 0;
        }
        return Math.min(1, v + 0.1);
      });
    }, 250);
    return () => window.clearInterval(t);
  }, []);
  const steps: TimelineStep[] = STEPS.map((s, i) => ({
    id: s.id,
    label: s.label,
    status: i < k ? 'done' : i === k ? 'running' : 'waiting',
    progress: i === k ? p : undefined,
  }));
  return <StepTimeline label="Forecast run steps (demo)" steps={steps} />;
}

export function KitComponents() {
  const [tab, setTab] = useState<'day3' | 'day5' | 'day7' | 'day10'>('day5');
  const [speed, setSpeed] = useState<1 | 2 | 4>(1);
  const [on, setOn] = useState(true);
  const [pressed, setPressed] = useState(true);
  const [lang, setLang] = useState<'en' | 'hi'>('en');
  const [log, setLog] = useState<LogEntry[]>(() => SAMPLE_LOG.slice(0, 3).map((text, i) => ({ key: String(i), time: `05:40:0${i}`, text })));
  const addLine = () =>
    setLog((l) => {
      const i = l.length;
      return [...l, { key: String(i), time: `05:40:${String(i).padStart(2, '0')}`, text: SAMPLE_LOG[i % SAMPLE_LOG.length] ?? '' }];
    });

  return (
    <div className="space-y-10">
      <KitSection title="Colour" note="Interface colours. The three risk colours are reserved for Low, Moderate and Severe and appear only on risk.">
        <div className="flex flex-wrap gap-4">
          {Object.entries(COLORS).map(([name, hex]) => (
            <Swatch key={name} name={`--${name}`} hex={hex} />
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-4">
          <Swatch name="--warn-low" hex={RISK_COLORS.low} note="Low risk only" />
          <Swatch name="--warn-mod" hex={RISK_COLORS.moderate} note="Moderate risk only" />
          <Swatch name="--warn-sev" hex={RISK_COLORS.severe} note="Severe risk only" />
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Ramp stops={RAIN_STOPS} label="Rain colormap (mm/day)" />
          <Ramp stops={DIVERGING_STOPS} label="Temperature and anomaly colormap (normalised)" />
        </div>
      </KitSection>

      <KitSection title="Type" note="IBM Plex Sans Condensed for headlines and big numbers; IBM Plex Sans for body and interface. Sentence case throughout.">
        <div className="space-y-3">
          {[...TYPE_SCALE].reverse().map((size) => (
            <p key={size} className={size >= 28 ? 'font-head font-bold' : ''} style={{ fontSize: size, lineHeight: size >= 28 ? 1.05 : 1.55 }}>
              {size} px · See the storm before it arrives
            </p>
          ))}
          <p className="text-body tabular-nums">Tabular figures: 0.47 · 204 mm · T+96 h · 17 of 23</p>
        </div>
      </KitSection>

      <KitSection title="Buttons">
        <Row label="Primary">
          <Button>Run forecast</Button>
          <Button icon={<Play size={16} aria-hidden="true" />}>Play guided demo</Button>
          <Button size="sm">Small</Button>
          <Button disabled>Disabled</Button>
        </Row>
        <Row label="Secondary">
          <Button variant="secondary">Open the console</Button>
          <Button variant="secondary" size="sm">
            Small
          </Button>
          <Button variant="secondary" disabled>
            Disabled
          </Button>
        </Row>
        <Row label="Ghost">
          <Button variant="ghost" icon={<RotateCcw size={16} aria-hidden="true" />}>
            Reset
          </Button>
          <Button variant="ghost" size="sm">
            Small
          </Button>
          <Button variant="ghost" disabled>
            Disabled
          </Button>
        </Row>
      </KitSection>

      <KitSection title="Chips and badges">
        <Row label="Replay chip">
          <ReplayChip />
        </Row>
        <Row label="Status chip">
          {STATUSES.map((s) => (
            <StatusChip key={s} status={s} />
          ))}
        </Row>
        <Row label="Risk badge">
          <RiskBadge level="low" />
          <RiskBadge level="moderate" />
          <RiskBadge level="severe" />
          <RiskBadge level="low" size="sm" />
          <RiskBadge level="moderate" size="sm" />
          <RiskBadge level="severe" size="sm" />
        </Row>
      </KitSection>

      <KitSection title="Panels and metric tiles">
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Panel with header" description="Title, description, actions and the Replay chip" replay actions={<Button size="sm" variant="secondary">Action</Button>}>
            <div className="grid grid-cols-2 gap-4">
              <MetricTile label="Peak rain, diffusion" value="327" unit="mm/day" note="5 km reference 327" />
              <MetricTile label="Peak kept" value="98%" tone="teal" note="Bilinear 72% · U-Net 68%" />
              <MetricTile label="GPU-minutes" value="5.5" sim />
              <MetricTile label="Member agreement" value="17 of 23" />
            </div>
          </Panel>
          <div className="space-y-4">
            <Panel>
              <p className="text-body">Panel without a header: body only.</p>
            </Panel>
            <Panel title="Edge-to-edge body" replay bleed>
              <div className="h-24 bg-mist" />
            </Panel>
          </div>
        </div>
      </KitSection>

      <KitSection title="Step timeline" note="Done, running and waiting. The right-hand copy advances on its own.">
        <div className="grid gap-6 md:grid-cols-2">
          <Panel title="Static states">
            <StepTimeline
              label="Example steps"
              steps={[
                { id: 'a', label: 'Receive NEPS-G run', status: 'done', detail: '23 of 23 members' },
                { id: 'b', label: 'Decode & chunk', status: 'done' },
                { id: 'c', label: 'Anomaly fields (EFI)', status: 'running', progress: 0.55 },
                { id: 'd', label: 'Screen globe (GNN)', status: 'waiting' },
              ]}
            />
          </Panel>
          <Panel title="Live">
            <LiveTimelineDemo />
          </Panel>
        </div>
      </KitSection>

      <KitSection title="Log stream" note="Follows new lines unless you have scrolled up.">
        <Panel title="Run log" replay bleed actions={<Button size="sm" variant="secondary" onClick={addLine}>Add a line</Button>}>
          <LogStream label="Run log (demo)" lines={log} className="h-40" />
        </Panel>
        <div className="mt-4">
          <Panel title="Empty state" bleed>
            <LogStream label="Empty log" lines={[]} emptyText="No log lines yet. Press Run forecast." className="h-16" />
          </Panel>
        </div>
      </KitSection>

      <KitSection title="Legend">
        <div className="flex flex-wrap gap-4">
          <Legend ramp={{ title: '24 h rainfall', units: 'mm/day', stops: RAIN_STOPS, ticks: [5, 64, 115, 204] }} />
          <Legend
            items={[
              { label: 'Member tracks', color: COLORS.teal, symbol: 'line' },
              { label: 'Scenario path', color: COLORS.bay, symbol: 'thick-line' },
              { label: 'Probability cone', color: COLORS.teal, symbol: 'area' },
              { label: '4D threat box', color: COLORS.ink, symbol: 'box' },
              { label: 'Low', color: RISK_COLORS.low, symbol: 'swatch' },
              { label: 'Moderate', color: RISK_COLORS.moderate, symbol: 'swatch' },
              { label: 'Severe', color: RISK_COLORS.severe, symbol: 'swatch' },
              { label: 'Place', color: COLORS.ink, symbol: 'dot' },
            ]}
          />
        </div>
      </KitSection>

      <KitSection title="Phone frame">
        <ToggleGroup
          label="Message language"
          showLabel
          options={[
            { value: 'en', label: 'English' },
            { value: 'hi', label: 'हिन्दी' },
          ]}
          value={lang}
          onChange={setLang}
        />
        <div className="mt-4">
          <PhoneFrame sender="Weather alert" time="12:40" lang={lang} footer="Preview only. Not sent.">
            {lang === 'en'
              ? 'Sagar Island coast: very heavy rain and strong winds likely on 20 May. Stay indoors in a safe building and follow local authority instructions.'
              : 'सागर द्वीप तट: 20 मई को बहुत भारी बारिश और तेज़ हवा की आशंका। पक्के मकान में रहें, प्रशासन के निर्देश मानें।'}
          </PhoneFrame>
        </div>
      </KitSection>

      <KitSection title="Tabs, toggles and choices">
        <Tabs
          label="Lead time"
          items={[
            { value: 'day3', label: 'Day 3' },
            { value: 'day5', label: 'Day 5' },
            { value: 'day7', label: 'Day 7' },
            { value: 'day10', label: 'Day 10' },
          ]}
          value={tab}
          onChange={setTab}
        >
          <p className="text-body">Selected: {tab.replace('day', 'Day ')}. Use the arrow keys to move between tabs.</p>
        </Tabs>
        <div className="mt-6 space-y-4">
          <Row label="Toggle">
            <Toggle checked={on} onChange={setOn} label="Show EFI field" description="Overlay the anomaly field on the map" />
            <Toggle checked={false} onChange={() => undefined} label="Disabled" disabled />
          </Row>
          <Row label="Toggle button">
            <ToggleButton pressed={pressed} onClick={() => setPressed((v) => !v)}>
              Member tracks
            </ToggleButton>
            <ToggleButton pressed={false} onClick={() => undefined}>
              Probability cone
            </ToggleButton>
            <ToggleButton pressed={false} onClick={() => undefined} disabled>
              Cold wave
            </ToggleButton>
          </Row>
          <Row label="Toggle group">
            <ToggleGroup
              label="Speed"
              showLabel
              options={[
                { value: 1, label: '1×' },
                { value: 2, label: '2×' },
                { value: 4, label: '4×' },
              ]}
              value={speed}
              onChange={setSpeed}
            />
          </Row>
        </div>
      </KitSection>
    </div>
  );
}
