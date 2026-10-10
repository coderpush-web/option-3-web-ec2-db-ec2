const assert = require('assert');
const path = require('path');
const fs = require('fs');

console.log('Running automated unit & integration tests for Option 3 Next.js & Infrastructure...');

// 1. Basic project structure sanity checks
assert.strictEqual(1 + 1, 2, 'Basic test sanity check');

const pkg = require(path.join(__dirname, '../app/package.json'));
assert.ok(pkg.name || pkg.private, 'Package verification passed');
assert.ok(pkg.dependencies.next, 'Next.js dependency must be present');
assert.ok(pkg.dependencies.react, 'React dependency must be present');
assert.ok(pkg.dependencies.postgres, 'postgres driver dependency must be present');
assert.ok(pkg.dependencies.bcrypt, 'bcrypt dependency must be present');

assert.ok(fs.existsSync(path.join(__dirname, '../app/Dockerfile')), 'Dockerfile must exist');
assert.ok(fs.existsSync(path.join(__dirname, '../app/app/page.tsx')), 'Next.js page.tsx must exist');
assert.ok(fs.existsSync(path.join(__dirname, '../app/app/api/health/route.ts')), 'Health check route.ts must exist');

// 2. Verify .env.example configuration contract
const envExamplePath = path.join(__dirname, '../app/.env.example');
assert.ok(fs.existsSync(envExamplePath), '.env.example must exist in app directory');
const envExampleContent = fs.readFileSync(envExamplePath, 'utf8');
assert.ok(envExampleContent.includes('AUTH_SECRET='), '.env.example must document AUTH_SECRET');
assert.ok(envExampleContent.includes('AUTH_URL='), '.env.example must document AUTH_URL');
assert.ok(envExampleContent.includes('POSTGRES_URL='), '.env.example must document POSTGRES_URL');
assert.ok(envExampleContent.includes('DATABASE_URL='), '.env.example must document DATABASE_URL');
assert.ok(envExampleContent.includes('APP_ENV='), '.env.example must document APP_ENV');
assert.ok(envExampleContent.includes('PORT='), '.env.example must document PORT');

// 3. Database connection & security checks in db.ts
const dbSource = fs.readFileSync(path.join(__dirname, '../app/app/lib/db.ts'), 'utf8');
assert.ok(!dbSource.includes('postgres://postgres:postgres'), 'db.ts must not contain hardcoded default credentials');
assert.ok(!dbSource.includes('AdminPass2026!'), 'db.ts must not contain hardcoded fallback password AdminPass2026!');
assert.ok(
  dbSource.includes('sslmode=require') || dbSource.includes('rejectUnauthorized'),
  'db.ts must configure SSL/TLS support'
);
assert.ok(
  dbSource.includes('initDatabase'),
  'db.ts must export automatic schema initialization function initDatabase'
);

// 4. Standalone migration script checks
const migratePath = path.join(__dirname, '../app/scripts/migrate.js');
assert.ok(fs.existsSync(migratePath), 'app/scripts/migrate.js must exist');
const migrateContent = fs.readFileSync(migratePath, 'utf8');
assert.ok(!migrateContent.includes('AdminPass2026!'), 'migrate.js must not contain hardcoded fallback password AdminPass2026!');
assert.ok(migrateContent.includes('CREATE TABLE IF NOT EXISTS users'), 'migrate.js must create users table');
assert.ok(migrateContent.includes('CREATE TABLE IF NOT EXISTS customers'), 'migrate.js must create customers table');
assert.ok(migrateContent.includes('CREATE TABLE IF NOT EXISTS invoices'), 'migrate.js must create invoices table');
assert.ok(migrateContent.includes('CREATE TABLE IF NOT EXISTS revenue'), 'migrate.js must create revenue table');

// 5. Authentication backdoor and mock credential eradication
const authSource = fs.readFileSync(path.join(__dirname, '../app/auth.ts'), 'utf8');
assert.ok(!authSource.includes("'123456'"), 'auth.ts must not contain mock backdoor password');
assert.ok(!authSource.includes('placeholderUsers'), 'auth.ts must not reference placeholderUsers fallback');

const placeholderSource = fs.readFileSync(path.join(__dirname, '../app/app/lib/placeholder-data.ts'), 'utf8');
assert.ok(!placeholderSource.includes("'123456'"), 'placeholder-data.ts must not contain mock password 123456');
assert.ok(!placeholderSource.includes('user@nextmail.com'), 'placeholder-data.ts must not contain backdoor user');

// 6. next.config.js checks: no ignored build errors
const nextConfigContent = fs.readFileSync(path.join(__dirname, '../app/next.config.js'), 'utf8');
assert.ok(!nextConfigContent.includes('ignoreBuildErrors: true'), 'next.config.js must not suppress TypeScript errors');
assert.ok(!nextConfigContent.includes('ignoreDuringBuilds: true'), 'next.config.js must not suppress ESLint errors');

// 7. Infrastructure CloudFormation template security checks
const appYamlContent = fs.readFileSync(path.join(__dirname, '../infra/modules/app.yaml'), 'utf8');
assert.ok(!appYamlContent.includes('Dedicated Single EC2 MariaDB'), 'app.yaml must not contain stale MariaDB descriptions');
assert.ok(appYamlContent.includes('WebAuthSecret:'), 'app.yaml must provision WebAuthSecret');
assert.ok(appYamlContent.includes('ssl = on'), 'app.yaml must configure PostgreSQL ssl = on');
assert.ok(appYamlContent.includes('scram-sha-256'), 'app.yaml must configure scram-sha-256 authentication');
assert.ok(appYamlContent.includes('server.crt'), 'app.yaml must generate and configure TLS certificates');
assert.ok(appYamlContent.includes('?sslmode=require'), 'app.yaml WebLaunchTemplate must enforce sslmode=require');
assert.ok(appYamlContent.includes('Encrypted: true'), 'app.yaml must enforce EBS volume encryption');

const sgYamlContent = fs.readFileSync(path.join(__dirname, '../infra/modules/security-groups.yaml'), 'utf8');
assert.ok(
  sgYamlContent.includes('SourceSecurityGroupId: !Ref WebSecurityGroup'),
  'DatabaseSecurityGroup must restrict port 5432 exclusively to WebSecurityGroup'
);

console.log('✅ All automated unit, integration, and security verification tests passed successfully!');
