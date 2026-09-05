import { error, json, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) => {
  if (url.searchParams.has('redirect')) redirect(307, '/about');
  if (url.searchParams.has('error')) error(418, 'Fixture error');
  if (url.searchParams.has('stream')) {
    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: first\n\n'));
        setTimeout(() => {
          controller.enqueue(encoder.encode('data: second\n\n'));
          controller.close();
        }, 400);
      },
    }), { headers: { 'content-type': 'text/event-stream' } });
  }
  return json({ label: url.searchParams.get('label') ?? 'echo' });
};

export const POST: RequestHandler = async ({ request }) => {
  return new Response(await request.text(), { status: 201, headers: { 'content-type': 'text/plain' } });
};
