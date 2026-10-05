import { usePageTitle } from '../../app/hooks';
import { CONSOLE_PAGES, type ConsolePageId } from '../../content/site';

/** Shared header for console pages that have not been built yet. */
export default function ConsolePlaceholder({ id }: { id: ConsolePageId }) {
  const page = CONSOLE_PAGES.find((p) => p.id === id);
  usePageTitle(page?.name ?? 'Console');
  return (
    <div className="max-w-[1200px]">
      <h1 className="text-h3 sm:text-h2">{page?.name}</h1>
      <p className="mt-3 max-w-[62ch] text-body">{page?.summary}</p>
      <div className="mt-8 grid min-h-[320px] place-items-center rounded-panel border border-dashed border-line bg-paper p-8 text-center">
        <p className="max-w-[44ch] text-small">This view is being built. Use the left rail to move between console pages.</p>
      </div>
    </div>
  );
}
