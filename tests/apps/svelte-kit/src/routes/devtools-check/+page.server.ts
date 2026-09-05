import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, url }) => {
  const label = url.searchParams.get('label') ?? 'SSR fixture';
  const response = await fetch(`/devtools-check/response?label=${encodeURIComponent(label)}`);
  return {
    label,
    echoed: (await response.json()).label,
    delayed: new Promise<string>((resolve) => setTimeout(() => resolve('Stream complete'), 80)),
  };
};
