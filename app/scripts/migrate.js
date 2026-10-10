#!/usr/bin/env node

/**
 * Option 3: Automated Database Schema Migration & Initialization Script
 * Runs against PostgreSQL 16 on dedicated EC2 instance.
 */

const postgres = require('postgres');
const bcrypt = require('bcrypt');

const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ Error: POSTGRES_URL or DATABASE_URL must be set to run database migrations.');
  process.exit(1);
}

const isSsl =
  connectionString.includes('sslmode=require') ||
  connectionString.includes('ssl=true') ||
  process.env.NODE_ENV === 'production';

const sql = postgres(connectionString, {
  ssl: isSsl ? { rejectUnauthorized: false } : false,
  connect_timeout: 10,
  max: 1,
});

async function migrate() {
  console.log('🔄 Running database schema migrations for Option 3 PostgreSQL...');

  try {
    try {
      await sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;
    } catch {
      // Extension may not be allowed or gen_random_uuid is native
    }

    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL
      );
    `;
    console.log('  ✓ Table `users` verified/created');

    await sql`
      CREATE TABLE IF NOT EXISTS customers (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        image_url VARCHAR(255) NOT NULL
      );
    `;
    console.log('  ✓ Table `customers` verified/created');

    await sql`
      CREATE TABLE IF NOT EXISTS invoices (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        customer_id UUID NOT NULL,
        amount INT NOT NULL,
        status VARCHAR(255) NOT NULL,
        date DATE NOT NULL
      );
    `;
    console.log('  ✓ Table `invoices` verified/created');

    await sql`
      CREATE TABLE IF NOT EXISTS revenue (
        month VARCHAR(4) NOT NULL UNIQUE,
        revenue INT NOT NULL
      );
    `;
    console.log('  ✓ Table `revenue` verified/created');

    const userCount = await sql`SELECT COUNT(*) FROM users`;
    const initialPassword =
      process.env.INITIAL_USER_PASSWORD ||
      process.env.DEMO_USER_PASSWORD;
    if (Number(userCount[0]?.count ?? 0) === 0 && initialPassword) {
      const defaultHash = await bcrypt.hash(initialPassword, 10);
      await sql`
        INSERT INTO users (id, name, email, password)
        VALUES ('410544b2-4001-4271-9855-fec4b6a6442a', 'Admin User', 'admin@example.com', ${defaultHash})
        ON CONFLICT (id) DO NOTHING;
      `;
      console.log('  ✓ Seeded default initial admin user');
    } else if (Number(userCount[0]?.count ?? 0) === 0) {
      console.log('  ℹ Skipped initial admin user seeding (no INITIAL_USER_PASSWORD provided)');
    }

    console.log('✅ All migrations applied successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

migrate();
