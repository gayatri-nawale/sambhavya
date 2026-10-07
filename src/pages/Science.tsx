import type { ReactNode } from 'react';
import { usePageTitle } from '../app/hooks';
import { REFERENCES, referenceNumber } from '../content/references';

/** Inline citation: [n] linking to the reference list. */
function Cite({ ids }: { ids: string[] }) {
  return (
    <sup className="ml-0.5 text-small">
      [
      {ids.map((id, i) => (
        <span key={id}>
          {i > 0 && ', '}
          <a href={`#ref-${id}`} className="text-teal underline-offset-2 hover:underline">
            {referenceNumber(id)}
          </a>
        </span>
      ))}
      ]
    </sup>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-4 border-t border-line py-10">
      <div className="grid gap-6 lg:grid-cols-12">
        <h2 className="text-h3 lg:col-span-4">{title}</h2>
        <div className="max-w-[70ch] space-y-4 text-body lg:col-span-8">{children}</div>
      </div>
    </section>
  );
}

function Item({ term, children }: { term: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[200px_1fr] sm:gap-4">
      <dt className="font-semibold">{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}

const SECTIONS = [
  { id: 'models', title: 'The models, in short' },
  { id: 'data', title: 'Data we use' },
  { id: 'verify', title: 'How we verify' },
  { id: 'limits', title: 'What this prototype is and is not' },
  { id: 'references', title: 'References' },
];

export default function Science() {
  usePageTitle('Science');
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-14 sm:px-6">
      <h1 className="text-h2 sm:text-h1">Methods, data and limits</h1>
      <p className="mt-5 max-w-[62ch] text-lead">
        The models behind SAMBHAVYA, the data they learn from, how they are checked, and what this prototype does and does not show.
      </p>
      <nav aria-label="On this page" className="mt-8">
        <ul className="flex flex-wrap gap-x-5 gap-y-2 text-body">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="underline-offset-4 hover:text-teal hover:underline">
                {s.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-10">
        <Section id="models" title="The models, in short">
          <dl className="space-y-5">
            <Item term="Threat tracker">
              A graph neural network on an icosahedral mesh. The mesh covers the globe with nearly equal cells, so a storm near the equator and one
              near the poles look alike to the model. Graph networks on such meshes now produce skilful medium-range forecasts
              <Cite ids={['graphcast']} />. SAMBHAVYA uses the same idea for a narrower job: screening all 23 NEPS-G members
              <Cite ids={['neps-g']} /> for threats and linking each threat through time.
            </Item>
            <Item term="Calibration">
              Ensemble model output statistics (EMOS) adjust the raw probabilities lead time by lead time, so that forecasts of 60% come true about
              6 times in 10<Cite ids={['emos']} />. Blending consecutive runs, with hysteresis on the alert level, keeps warnings from flipping between
              runs.
            </Item>
            <Item term="5 km downscaling">
              A residual diffusion model: the 12 km forecast is interpolated to 5 km, and the model learns only the missing fine detail
              <Cite ids={['corrdiff']} />. Consistency-model distillation lets it sample in two steps instead of dozens<Cite ids={['consistency']} />,
              which makes several samples per member affordable.
            </Item>
            <Item term="Physics constraints">
              A constraint layer keeps the area total of each 5 km field equal to the 12 km input, so the model cannot create or lose water
              <Cite ids={['harder']} />. A quality gate then checks peaks, water balance and agreement with 12 km. If any check fails, the calibrated
              12 km forecast is published instead.
            </Item>
          </dl>
        </Section>

        <Section id="data" title="Data we use">
          <dl className="space-y-4">
            <Item term="NEPS-G">
              NCMRWF’s global ensemble: 23 members, 12 km, ten days, run at 00 and 12 UTC<Cite ids={['neps-g']} />. The forecast input.
            </Item>
            <Item term="NCUM-G and NCUM-R">
              Matched global and regional forecasts from the NCMRWF Unified Model, used as coarse and fine pairs to train the downscaler
              <Cite ids={['ncum-r']} />. The regional NEPS-R ensemble runs at 4 km to 75 hours.
            </Item>
            <Item term="IMDAA">
              Regional reanalysis for the Indian monsoon region, used to train the tracker<Cite ids={['imdaa']} />.
            </Item>
            <Item term="ERA5">
              Global reanalysis. Thirty years of it form the climate baseline for the Extreme Forecast Index<Cite ids={['era5']} />.
            </Item>
            <Item term="IMERG and CHIRPS">
              Satellite and gauge-blended rainfall, used to calibrate and verify rain forecasts<Cite ids={['imerg', 'chirps']} />.
            </Item>
            <Item term="IBTrACS">
              Best-track records of tropical cyclones, used as track labels and to measure track error<Cite ids={['ibtracs']} />.
            </Item>
            <Item term="SRTM">Terrain height, used by the downscaler and in the physics checks.</Item>
          </dl>
        </Section>

        <Section id="verify" title="How we verify">
          <p>Each part is compared with a simpler baseline that does the same job:</p>
          <dl className="space-y-4">
            <Item term="Tracking">
              Against TempestExtremes, a widely used feature tracker<Cite ids={['tempestextremes']} />, and against the raw ensemble mean. Measured by
              track error in kilometres at 48, 72 and 120 hours.
            </Item>
            <Item term="Downscaling">
              Against bilinear interpolation and a plain U-Net. Measured by the fractions skill score, which rewards rain in roughly the right place
              <Cite ids={['fss']} />, by how much of the peak is kept, and by the power spectrum of the field.
            </Item>
            <Item term="Probabilities">
              Against the raw ensemble. Measured by the continuous ranked probability score (CRPS), the Brier score and reliability diagrams
              <Cite ids={['emos']} />.
            </Item>
            <Item term="Alerts">
              Hits, misses and false alarms against observed rain and temperature, summarised as the critical success index and false alarm ratio,
              plus how often an alert level flips between runs.
            </Item>
          </dl>
        </Section>

        <Section id="limits" title="What this prototype is and is not">
          <p>
            <strong>It is a replay with illustrative values.</strong> Its three scenarios are shaped after real events: Cyclone Amphan (landfall on
            20 May 2020 between Digha and Hatiya), the north-west India heatwave of late May 2024, and humid heat on the east coast. Every number,
            field, track and score is generated by a seeded simulation running in your browser. No measured skill is claimed.
          </p>
          <p>
            <strong>It is not connected to anything.</strong> It makes no network requests. CAP 1.2 messages, the format used by NDMA’s SACHET
            platform<Cite ids={['cap']} />, are generated as previews and never sent.
          </p>
          <p>
            <strong>A forecaster always decides.</strong> Every alert waits for human approval before any public warning, in the prototype and in
            the system it describes.
          </p>
        </Section>

        <section id="references" className="scroll-mt-4 border-t border-line py-10">
          <h2 className="text-h3">References</h2>
          <ol className="mt-6 max-w-[90ch] space-y-3 text-small">
            {REFERENCES.map((r, i) => (
              <li key={r.id} id={`ref-${r.id}`} className="grid scroll-mt-4 grid-cols-[32px_1fr] gap-x-2">
                <span className="tabular-nums">[{i + 1}]</span>
                <span>
                  {r.citation}{' '}
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="break-all text-teal underline underline-offset-2 hover:text-ink">
                    {r.url.replace(/^https?:\/\//, '')}
                  </a>
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
