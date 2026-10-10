import { sqlClient, initDatabase } from '@/app/lib/db';

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return Response.json(
      { message: 'Seed endpoint is disabled in production' },
      { status: 403 }
    );
  }

  if (!sqlClient) {
    return Response.json(
      { message: 'Database connection not configured (POSTGRES_URL / DATABASE_URL missing)' },
      { status: 503 }
    );
  }

  try {
    await initDatabase();
    return Response.json({ message: 'Database seeded successfully' });
  } catch (error) {
    console.error('Database seed error:', error);
    return Response.json({ message: 'Failed to seed database' }, { status: 500 });
  }
}
