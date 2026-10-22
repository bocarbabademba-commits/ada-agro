const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool(
    process.env.DATABASE_URL 
    ? { 
        connectionString: process.env.DATABASE_URL, 
        ssl: { rejectUnauthorized: false } // OBLIGATOIRE POUR RENDER
      } 
    : {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        ssl: { rejectUnauthorized: false } // OBLIGATOIRE POUR RENDER
    }
);

pool.on('connect', () => console.log('✅ Connecté à la base de données'));
pool.on('error', (err) => console.error('❌ Erreur PostgreSQL :', err));

module.exports = pool;