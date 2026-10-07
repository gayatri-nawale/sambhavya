/**
 * References for the Science page. Check every entry against the slides before
 * presenting; links point to the publisher, DOI or official source page.
 */

export interface Reference {
  id: string;
  /** Short label used for inline citations. */
  label: string;
  citation: string;
  url: string;
}

export const REFERENCES: readonly Reference[] = [
  {
    id: 'neps-g',
    label: 'NEPS-G',
    citation:
      'Mamgain, A., Sarkar, A. and Rajagopal, E. N. (2020). Medium-range global ensemble prediction system at 12 km horizontal resolution and its preliminary validation. Meteorological Applications, 27(1), e1867.',
    url: 'https://doi.org/10.1002/met.1867',
  },
  {
    id: 'era5',
    label: 'ERA5',
    citation: 'Hersbach, H. et al. (2020). The ERA5 global reanalysis. Quarterly Journal of the Royal Meteorological Society, 146(730), 1999–2049.',
    url: 'https://doi.org/10.1002/qj.3803',
  },
  {
    id: 'imdaa',
    label: 'IMDAA',
    citation:
      'Rani, S. I. et al. (2021). IMDAA: High-resolution satellite-era reanalysis for the Indian monsoon region. Journal of Climate, 34(12), 5109–5133.',
    url: 'https://doi.org/10.1175/JCLI-D-20-0412.1',
  },
  {
    id: 'ncum-r',
    label: 'NCUM-R',
    citation: 'National Centre for Medium Range Weather Forecasting. NCMRWF Unified Model, regional configuration (NCUM-R). Model documentation.',
    url: 'https://www.ncmrwf.gov.in',
  },
  {
    id: 'graphcast',
    label: 'GraphCast',
    citation: 'Lam, R. et al. (2023). Learning skillful medium-range global weather forecasting. Science, 382(6677), 1416–1421.',
    url: 'https://doi.org/10.1126/science.adi2336',
  },
  {
    id: 'emos',
    label: 'EMOS',
    citation:
      'Gneiting, T., Raftery, A. E., Westveld, A. H. and Goldman, T. (2005). Calibrated probabilistic forecasting using ensemble model output statistics and minimum CRPS estimation. Monthly Weather Review, 133(5), 1098–1118.',
    url: 'https://doi.org/10.1175/MWR2904.1',
  },
  {
    id: 'corrdiff',
    label: 'CorrDiff',
    citation: 'Mardani, M. et al. (2023). Residual corrective diffusion modeling for km-scale atmospheric downscaling. arXiv:2309.15214.',
    url: 'https://arxiv.org/abs/2309.15214',
  },
  {
    id: 'harder',
    label: 'Harder et al.',
    citation: 'Harder, P. et al. (2023). Hard-constrained deep learning for climate downscaling. Journal of Machine Learning Research, 24. arXiv:2208.05424.',
    url: 'https://arxiv.org/abs/2208.05424',
  },
  {
    id: 'consistency',
    label: 'Consistency Models',
    citation: 'Song, Y., Dhariwal, P., Chen, M. and Sutskever, I. (2023). Consistency models. Proceedings of ICML 2023. arXiv:2303.01469.',
    url: 'https://arxiv.org/abs/2303.01469',
  },
  {
    id: 'tempestextremes',
    label: 'TempestExtremes',
    citation:
      'Ullrich, P. A. and Zarzycki, C. M. (2017). TempestExtremes: a framework for scale-insensitive pointwise feature tracking on unstructured grids. Geoscientific Model Development, 10, 1069–1090.',
    url: 'https://doi.org/10.5194/gmd-10-1069-2017',
  },
  {
    id: 'fss',
    label: 'FSS',
    citation:
      'Roberts, N. M. and Lean, H. W. (2008). Scale-selective verification of rainfall accumulations from high-resolution forecasts of convective events. Monthly Weather Review, 136(1), 78–97.',
    url: 'https://doi.org/10.1175/2007MWR2123.1',
  },
  {
    id: 'imerg',
    label: 'IMERG',
    citation:
      'Huffman, G. J. et al. (2020). Integrated Multi-satellite Retrievals for the Global Precipitation Measurement (GPM) Mission (IMERG). In Satellite Precipitation Measurement, Springer, 343–353.',
    url: 'https://gpm.nasa.gov/data/imerg',
  },
  {
    id: 'chirps',
    label: 'CHIRPS',
    citation:
      'Funk, C. et al. (2015). The climate hazards infrared precipitation with stations — a new environmental record for monitoring extremes. Scientific Data, 2, 150066.',
    url: 'https://doi.org/10.1038/sdata.2015.66',
  },
  {
    id: 'ibtracs',
    label: 'IBTrACS',
    citation:
      'Knapp, K. R., Kruk, M. C., Levinson, D. H., Diamond, H. J. and Neumann, C. J. (2010). The International Best Track Archive for Climate Stewardship (IBTrACS). Bulletin of the American Meteorological Society, 91(3), 363–376.',
    url: 'https://doi.org/10.1175/2009BAMS2755.1',
  },
  {
    id: 'cap',
    label: 'CAP 1.2',
    citation: 'OASIS (2010). Common Alerting Protocol Version 1.2. OASIS Standard, 1 July 2010.',
    url: 'https://docs.oasis-open.org/emergency/cap/v1.2/CAP-v1.2-os.html',
  },
];

export function referenceNumber(id: string): number {
  return REFERENCES.findIndex((r) => r.id === id) + 1;
}
