import { usePageTitle } from '../app/hooks';
import { ButtonLink } from '../components/ui/Button';

export default function NotFound() {
  usePageTitle('Page not found');
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6">
      <h1 className="text-h2">Page not found</h1>
      <p className="mt-4 max-w-[52ch] text-lead">There is nothing at this address. The forecast is still where you left it.</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <ButtonLink to="/">Back to home</ButtonLink>
        <ButtonLink to="/console" variant="secondary">
          Open the console
        </ButtonLink>
      </div>
    </div>
  );
}
