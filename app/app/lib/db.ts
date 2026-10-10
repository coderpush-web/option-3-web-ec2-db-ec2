import postgres from 'postgres';
import bcrypt from 'bcrypt';
import { invoices, customers, revenue } from './placeholder-data';

const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;

let sqlClient: any = null;

if (connectionString) {
  try {
    const isSsl =
      connectionString.includes('sslmode=require') ||
      connectionString.includes('ssl=true') ||
      process.env.NODE_ENV === 'production';

    sqlClient = postgres(connectionString, {
      ssl: isSsl ? { rejectUnauthorized: false } : false,
      connect_timeout: 5,
      idle_timeout: 10,
      max: 10,
    });
  } catch (e) {
    console.error('Failed to init postgres client:', e);
  }
}

let initPromise: Promise<void> | null = null;

export async function initDatabase(): Promise<void> {
  if (!sqlClient) return;
  if (!initPromise) {
    initPromise = (async () => {
      try {
        try {
          await sqlClient`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;
        } catch {
          // Extension might already exist or uuid generation might be native
        }

        await sqlClient`
          CREATE TABLE IF NOT EXISTS users (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL
          );
        `;

        await sqlClient`
          CREATE TABLE IF NOT EXISTS customers (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) NOT NULL,
            image_url VARCHAR(255) NOT NULL
          );
        `;

        await sqlClient`
          CREATE TABLE IF NOT EXISTS invoices (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            customer_id UUID NOT NULL,
            amount INT NOT NULL,
            status VARCHAR(255) NOT NULL,
            date DATE NOT NULL
          );
        `;

        await sqlClient`
          CREATE TABLE IF NOT EXISTS revenue (
            month VARCHAR(4) NOT NULL UNIQUE,
            revenue INT NOT NULL
          );
        `;

        // Initial seeding for users if empty and explicit password provided in environment
        const userCount = await sqlClient`SELECT COUNT(*) FROM users`;
        const initialPassword =
          process.env.INITIAL_USER_PASSWORD ||
          process.env.DEMO_USER_PASSWORD;
        if (Number(userCount[0]?.count ?? 0) === 0 && initialPassword) {
          const defaultHash = await bcrypt.hash(initialPassword, 10);
          await sqlClient`
            INSERT INTO users (id, name, email, password)
            VALUES ('410544b2-4001-4271-9855-fec4b6a6442a', 'Admin User', 'admin@example.com', ${defaultHash})
            ON CONFLICT (id) DO NOTHING;
          `;
        }

        // Initial seeding for customers if empty
        const custCount = await sqlClient`SELECT COUNT(*) FROM customers`;
        if (Number(custCount[0]?.count ?? 0) === 0 && customers.length > 0) {
          for (const c of customers) {
            await sqlClient`
              INSERT INTO customers (id, name, email, image_url)
              VALUES (${c.id}, ${c.name}, ${c.email}, ${c.image_url})
              ON CONFLICT (id) DO NOTHING;
            `;
          }
        }

        // Initial seeding for invoices if empty
        const invCount = await sqlClient`SELECT COUNT(*) FROM invoices`;
        if (Number(invCount[0]?.count ?? 0) === 0 && invoices.length > 0) {
          for (const inv of invoices) {
            await sqlClient`
              INSERT INTO invoices (customer_id, amount, status, date)
              VALUES (${inv.customer_id}, ${inv.amount}, ${inv.status}, ${inv.date})
              ON CONFLICT DO NOTHING;
            `;
          }
        }

        // Initial seeding for revenue if empty
        const revCount = await sqlClient`SELECT COUNT(*) FROM revenue`;
        if (Number(revCount[0]?.count ?? 0) === 0 && revenue.length > 0) {
          for (const r of revenue) {
            await sqlClient`
              INSERT INTO revenue (month, revenue)
              VALUES (${r.month}, ${r.revenue})
              ON CONFLICT (month) DO NOTHING;
            `;
          }
        }

        console.log('PostgreSQL database schema and initial data initialized successfully.');
      } catch (err) {
        console.error('Error auto-initializing PostgreSQL database:', err);
      }
    })();
  }
  return initPromise;
}

// Automatically initialize schema when database client is configured
if (sqlClient) {
  initDatabase().catch((err) => {
    console.error('Failed to run PostgreSQL schema auto-initialization:', err);
  });
}

export { sqlClient, invoices, customers, revenue };
