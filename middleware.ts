import { next } from '@vercel/functions';
import auth from './lib/auth.js';

// Vercel Routing Middleware: every request (pages, scripts, /api/*) needs a valid dashboard
// user via HTTP Basic auth. The browser prompts once and then resends the credentials on every
// same-origin request, including the frontend's fetch() calls to /api.

export const config = {
  runtime: 'nodejs'
};

function unauthorized() {
  return new Response('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Operations Dashboard", charset="UTF-8"' }
  });
}

export default async function middleware(request) {
  try {
    const user = await auth.authenticate(request.headers.get('authorization'));
    return user ? next() : unauthorized();
  } catch (error) {
    // Fail closed: if the user table can't be checked, nobody gets in.
    console.error('Auth check failed:', error.message);
    return new Response('Authentication unavailable', { status: 503 });
  }
}
