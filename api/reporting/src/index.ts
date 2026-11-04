import {
  avatarCoordinates,
  maxPhotoBytes,
  parseReport,
  photoRetentionDays,
  type MapReport,
} from './report';
import { cleanPhoto } from './photo';

type Value = string | number | number[] | null;
export type Statement = {
  bind(...values: Value[]): Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
};
export type Env = {
  DB: { prepare(sql: string): Statement };
  ALLOWED_ORIGIN: string;
  PUBLIC_URL: string;
  TURNSTILE_SECRET_KEY: string;
  REVIEW_SERVICE_KEY: string;
};
type Context = { waitUntil(task: Promise<unknown>): void };
type StoredReport = {
  id: string;
  payload: string;
  photo_token: string;
  expires_at: number;
  attempts: number;
};
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
function configured(env: Env) {
  return [
    env.DB,
    env.ALLOWED_ORIGIN,
    env.PUBLIC_URL,
    env.TURNSTILE_SECRET_KEY,
    env.REVIEW_SERVICE_KEY,
  ].every(Boolean);
}
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
async function quota(env: Env, key: string, limit: number, expires: number) {
  const result = await env.DB.prepare(
    `INSERT INTO submission_limits(key,count,expires_at) VALUES (?,1,?)
     ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<?
     RETURNING count`,
  )
    .bind(key, expires, limit)
    .first<{ count: number }>();
  if (!result)
    throw new HttpError(
      429,
      'Reporting has reached its limit. Please try later.',
    );
}
async function formData(request: Request) {
  if (!request.headers.get('Content-Type')?.startsWith('multipart/form-data;'))
    throw new HttpError(415, 'Use the photo reporting form.');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'The report is empty.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxPhotoBytes + 16000) {
      await reader.cancel();
      throw new HttpError(413, 'The photo report is too large.');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return await new Response(bytes, { headers: request.headers }).formData();
  } catch {
    throw new HttpError(400, 'The photo report could not be read.');
  }
}
async function verifyHuman(token: FormDataEntryValue | null, env: Env) {
  if (typeof token !== 'string' || token.length < 1 || token.length > 2048)
    throw new HttpError(400, 'Complete the anti-spam check.');
  const response = await fetch(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    {
      method: 'POST',
      body: new URLSearchParams({
        secret: env.TURNSTILE_SECRET_KEY,
        response: token,
      }),
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!response.ok) throw new Error('Anti-spam verification is unavailable.');
  const result: { success?: boolean; hostname?: string; action?: string } =
    await response.json();
  if (
    result.success !== true ||
    result.hostname !== new URL(env.ALLOWED_ORIGIN).hostname ||
    result.action !== 'report'
  )
    throw new HttpError(400, 'The anti-spam check expired. Please try again.');
}

export function issueBody(report: MapReport, photoUrl: string) {
  const gps = avatarCoordinates(report.avatar);
  return [
    '**Untrusted visitor submission: review evidence before acting.**',
    `Report ID: \`${report.id}\``,
    `Model revision: \`${report.revision}\``,
    `Avatar: x=${report.avatar.x}, z=${report.avatar.z}; heading=${report.avatar.heading}`,
    `Approximate map coordinates: ${gps.latitude.toFixed(7)}, ${gps.longitude.toFixed(7)}`,
    `Interior: ${report.avatar.interior ?? 'outdoors'}`,
    report.gps
      ? `Optional phone GPS: ${report.gps.latitude}, ${report.gps.longitude}; accuracy ±${report.gps.accuracy} m`
      : 'Phone GPS: not shared.',
    '',
    '### Visitor description (untrusted text)',
    '',
    ...report.description.split('\n').map((line) => `    ${line}`),
    '',
    `[Open private photo](${photoUrl})`,
    '',
    `Photo access expires after ${photoRetentionDays} days. Anyone given this private link can open it until expiry. Do not publish it without review.`,
  ].join('\n');
}

async function handle(request: Request, env: Env) {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/health')
    return json({ ready: configured(env) }, configured(env) ? 200 : 503);
  if (!configured(env))
    throw new HttpError(
      503,
      'Reporting is not connected yet. No report was sent.',
    );
  if (url.pathname.startsWith('/internal/')) {
    const provided = request.headers.get('Authorization') ?? '';
    const expected = `Bearer ${env.REVIEW_SERVICE_KEY}`;
    let difference = provided.length ^ expected.length;
    for (let i = 0; i < expected.length; i++)
      difference |= expected.charCodeAt(i) ^ (provided.charCodeAt(i) || 0);
    if (difference) throw new HttpError(403, 'Review access denied.');
    if (request.method === 'GET' && url.pathname === '/internal/reports') {
      const now = Date.now();
      const rows = await env.DB.prepare(
        `UPDATE reports SET status='publishing',attempts=attempts+1,updated_at=?
         WHERE id IN (SELECT id FROM reports WHERE expires_at>? AND
           (status='pending' OR (status='publishing' AND updated_at<?))
           ORDER BY created_at LIMIT 20)
         RETURNING id,payload,photo_token,expires_at,attempts`,
      )
        .bind(now, now, now - 15 * 60 * 1000)
        .all<StoredReport>();
      return json({
        reports: rows.results.map((row) => {
          const report = parseReport(JSON.parse(row.payload));
          const photoUrl = new URL(`/photos/${report.id}`, env.PUBLIC_URL);
          photoUrl.searchParams.set('token', row.photo_token);
          return {
            id: report.id,
            title: `${report.kind === 'incorrect' ? 'Map correction' : 'Photo contribution'} near ${report.avatar.x.toFixed(1)}, ${report.avatar.z.toFixed(1)}`,
            body: issueBody(report, photoUrl.href),
          };
        }),
      });
    }
    if (request.method === 'POST' && url.pathname === '/internal/ack') {
      const body = await request.text();
      if (body.length > 1000)
        throw new HttpError(400, 'Invalid acknowledgement.');
      const value: unknown = JSON.parse(body);
      if (
        !value ||
        typeof value !== 'object' ||
        !('id' in value) ||
        !('issue' in value) ||
        typeof value.id !== 'string' ||
        !Number.isInteger(value.issue) ||
        typeof value.issue !== 'number' ||
        value.issue < 1
      )
        throw new HttpError(400, 'Invalid acknowledgement.');
      await env.DB.prepare(
        "UPDATE reports SET status='delivered',issue_number=?,updated_at=? WHERE id=?",
      )
        .bind(value.issue, Date.now(), value.id)
        .run();
      return json({ acknowledged: true });
    }
    throw new HttpError(404, 'Review endpoint not found.');
  }
  if (request.method === 'GET' && url.pathname.startsWith('/photos/')) {
    const id = url.pathname.slice('/photos/'.length);
    const token = url.searchParams.get('token') ?? '';
    if (!/^[0-9a-f-]{36}$/.test(id) || !/^[0-9a-f]{64}$/.test(token))
      throw new HttpError(404, 'Photo unavailable or expired.');
    const photo = await env.DB.prepare(
      'SELECT photo FROM reports WHERE id=? AND photo_token=? AND expires_at>?',
    )
      .bind(id, token, Date.now())
      .first<{ photo: number[] }>();
    if (!photo) throw new HttpError(404, 'Photo unavailable or expired.');
    return new Response(Uint8Array.from(photo.photo), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Disposition': 'inline; filename="map-report.jpg"',
        'Cache-Control': 'private, no-store',
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  }
  if (request.headers.get('Origin') !== env.ALLOWED_ORIGIN)
    throw new HttpError(
      403,
      'Reporting is available only through the website.',
    );
  if (request.method === 'OPTIONS' && url.pathname === '/reports')
    return new Response(null, { status: 204 });
  if (request.method !== 'POST' || url.pathname !== '/reports')
    throw new HttpError(404, 'Reporting endpoint not found.');
  const data = await formData(request);
  let report: MapReport;
  try {
    const metadata = data.get('report');
    if (typeof metadata !== 'string' || metadata.length > 10000)
      throw new Error('The report metadata is invalid.');
    report = parseReport(JSON.parse(metadata));
  } catch (error) {
    throw new HttpError(
      400,
      error instanceof Error ? error.message : 'The report is invalid.',
    );
  }
  const existing = await env.DB.prepare(
    'SELECT id,payload FROM reports WHERE id=?',
  )
    .bind(report.id)
    .first<{ id: string; payload: string }>();
  if (existing) {
    if (existing.payload !== JSON.stringify(report))
      throw new HttpError(
        409,
        'This report reference was already used. Reopen the form to submit changed details.',
      );
    return json({ id: report.id, received: true }, 202);
  }
  await verifyHuman(data.get('token'), env);
  const file = data.get('photo');
  if (!(file instanceof File) || file.type !== 'image/jpeg')
    throw new HttpError(400, 'Attach a JPEG photo.');
  let photo: Uint8Array;
  try {
    photo = cleanPhoto(new Uint8Array(await file.arrayBuffer()));
  } catch (error) {
    throw new HttpError(
      400,
      error instanceof Error ? error.message : 'Invalid photo.',
    );
  }
  const now = Date.now();
  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip)
    throw new HttpError(
      503,
      'The reporting gateway could not verify the connection.',
    );
  const digest = new Uint8Array(
    await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`${env.TURNSTILE_SECRET_KEY}:${ip}`),
    ),
  );
  const ipHash = [...digest]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  await quota(
    env,
    `ip:${ipHash}:${Math.floor(now / 3600000)}`,
    3,
    now + 7200000,
  );
  await quota(env, `day:${Math.floor(now / 86400000)}`, 20, now + 172800000);
  const token = [...crypto.getRandomValues(new Uint8Array(32))]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  await env.DB.prepare(
    `INSERT OR IGNORE INTO reports
     (id,created_at,expires_at,updated_at,payload,photo,photo_token)
     VALUES (?,?,?,?,?,?,?)`,
  )
    .bind(
      report.id,
      now,
      now + photoRetentionDays * 86400000,
      now,
      JSON.stringify(report),
      [...photo],
      token,
    )
    .run();
  return json({ id: report.id, received: true }, 202);
}

export default {
  async fetch(request: Request, env: Env, _context?: Context) {
    let response: Response;
    try {
      response = await handle(request, env);
    } catch (error) {
      if (error instanceof HttpError) {
        response = json({ error: error.message }, error.status);
      } else {
        console.error('Report submission failed:', error);
        response = json(
          { error: 'Reporting is temporarily unavailable. Please try again.' },
          503,
        );
      }
    }
    if (request.headers.get('Origin') === env.ALLOWED_ORIGIN) {
      response.headers.set('Access-Control-Allow-Origin', env.ALLOWED_ORIGIN);
      response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
      response.headers.set('Vary', 'Origin');
    }
    return response;
  },
  async scheduled(_event: unknown, env: Env) {
    const now = Date.now();
    await env.DB.prepare('DELETE FROM reports WHERE expires_at<=?')
      .bind(now)
      .run();
    await env.DB.prepare('DELETE FROM submission_limits WHERE expires_at<=?')
      .bind(now)
      .run();
  },
};
