const mysql = require('mysql2');
const path = require('path');

require('dotenv').config({
  path: path.resolve(__dirname, '../.env')
});

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'sakura.proxy.rlwy.net',

  port: process.env.DB_PORT || 47390,

  user: process.env.DB_USER || 'root',

  password: process.env.DB_PASSWORD || '2388008832',

  database: process.env.DB_NAME || 'bm_bastha',

  ssl: {
    rejectUnauthorized: false
  },

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const db = pool.promise();

// Test connection
pool.getConnection((err, connection) => {
  if (err) {
    console.error('❌ Database connection failed:', err.message);
    return;
  }

  console.log('✅ MySQL connected successfully');

  connection.release();
});

module.exports = db;