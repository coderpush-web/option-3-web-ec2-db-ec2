export const dynamic = 'force-dynamic';
import { sqlClient } from '@/app/lib/db';

export async function GET() {
  let dbStatus = 'not_configured';
  if (sqlClient) {
    try {
      await sqlClient`SELECT 1`;
      dbStatus = 'connected';
    } catch {
      dbStatus = 'unreachable';
    }
  }

  return Response.json(
    {
      status: 'ok',
      database: dbStatus,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
    { status: 200 }
  );
}
