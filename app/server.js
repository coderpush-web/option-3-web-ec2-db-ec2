const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise');

const app = express();
const port = process.env.PORT || 80;
const APP_ENV = process.env.APP_ENV || 'Production';
const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_USER = process.env.DB_USER || 'appuser';
const DB_PASSWORD = process.env.DB_PASSWORD || 'SecretDBPass123!';
const DB_NAME = process.env.DB_NAME || 'appdb';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

let pool = null;
if (process.env.DB_HOST) {
  pool = mysql.createPool({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 5,
    connectTimeout: 3000
  });
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', env: APP_ENV });
});

app.get('/api/cluster-status', async (req, res) => {
  let dbConnected = false;
  let latencyMs = '0.9';
  let message = 'Standalone Demo Mode (Mock DB)';

  if (pool) {
    const t0 = Date.now();
    try {
      const [rows] = await pool.query('SELECT 1 + 1 AS solution, NOW() as current_time');
      latencyMs = (Date.now() - t0).toFixed(1);
      dbConnected = true;
      message = 'Connected to Dedicated EC2 Database via Private Subnet';
    } catch (err) {
      dbConnected = false;
      message = `Database connection attempt: ${err.message}`;
    }
  } else {
    dbConnected = true;
    message = 'Simulated Private Subnet MariaDB connection';
  }

  res.json({
    env: APP_ENV,
    dbHost: DB_HOST,
    dbConnected,
    latencyMs,
    message
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(port, () => {
  console.log(`ClusterMesh Web Server running on port ${port} in ${APP_ENV} mode`);
});
