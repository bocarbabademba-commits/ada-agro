const bcrypt = require('bcryptjs');
const pool = require('./db');

async function seedAdmin() {
    const username = 'superadmin';
    const email = 'superadmin@ada.agro';
    const password = 'super123';

    try {
        const check = await pool.query('SELECT * FROM admins WHERE nom=$1 OR email=$2', [username, email]);
        if (check.rows.length > 0) {
            console.log('ℹ️ L\'admin existe déjà.');
            process.exit(0);
        }

        const hashed = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO admins (nom, email, password, role) VALUES ($1, $2, $3, $4) RETURNING *',
            [username, email, hashed, 'superadmin']
        );

        console.log('✅ Superadmin créé :', result.rows[0]);
    } catch (err) {
        console.error('❌ Erreur :', err);
    } finally {
        process.exit(0);
    }
}

seedAdmin();