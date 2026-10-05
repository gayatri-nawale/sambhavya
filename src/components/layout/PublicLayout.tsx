import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { ButtonLink } from '../ui/Button';
import { Wordmark } from './Wordmark';
import { FOOTER_TEXT } from '../../content/site';

const NAV = [
  { to: '/how-it-works', label: 'How it works' },
  { to: '/science', label: 'Science' },
];

function navClass({ isActive }: { isActive: boolean }): string {
  return `rounded-chip px-2 py-1 text-body hover:text-teal ${isActive ? 'font-semibold text-teal' : 'text-ink'}`;
}

export function PublicLayout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <div className="flex min-h-screen flex-col bg-mist">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-chip focus:bg-paper focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="relative z-20 border-b border-line bg-paper">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-4 sm:px-6">
          <Wordmark />
          <nav aria-label="Main" className="hidden items-center gap-4 md:flex">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} className={navClass}>
                {n.label}
              </NavLink>
            ))}
            <ButtonLink to="/console" size="sm">
              Open console
            </ButtonLink>
          </nav>
          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-chip border border-line md:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
        </div>
        {open && (
          <nav id="mobile-nav" aria-label="Main" className="border-t border-line px-4 pb-4 pt-2 md:hidden">
            <ul className="flex flex-col gap-1">
              {NAV.map((n) => (
                <li key={n.to}>
                  <NavLink to={n.to} className={navClass}>
                    {n.label}
                  </NavLink>
                </li>
              ))}
            </ul>
            <ButtonLink to="/console" size="sm" className="mt-3 w-full">
              Open console
            </ButtonLink>
          </nav>
        )}
      </header>
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-line bg-paper">
        <div className="mx-auto grid max-w-[1200px] gap-8 px-4 py-10 sm:px-6 md:grid-cols-12">
          <div className="md:col-span-6">
            <Wordmark />
            <p className="mt-3 max-w-[56ch] text-small">{FOOTER_TEXT}</p>
          </div>
          <nav aria-label="Footer" className="md:col-span-6 md:justify-self-end">
            <ul className="grid grid-cols-2 gap-x-10 gap-y-2 text-small">
              <li>
                <Link className="hover:text-teal" to="/how-it-works">
                  How it works
                </Link>
              </li>
              <li>
                <Link className="hover:text-teal" to="/console/run">
                  Forecast run
                </Link>
              </li>
              <li>
                <Link className="hover:text-teal" to="/science">
                  Science
                </Link>
              </li>
              <li>
                <Link className="hover:text-teal" to="/console/alerts">
                  Risk &amp; review
                </Link>
              </li>
              <li>
                <Link className="hover:text-teal" to="/science#limits">
                  What this prototype is
                </Link>
              </li>
              <li>
                <Link className="hover:text-teal" to="/console/sources">
                  Data &amp; provenance
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </footer>
    </div>
  );
}
