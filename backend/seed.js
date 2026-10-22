const bcrypt = require('bcryptjs');
const pool = require('./db');

async function resetPassword() {
    const username = 'superadmin';
    const password = 'super123';

    try {
        // Génère le hash avec la même bibliothèque que le serveur
        const hashed = await bcrypt.hash(password, 10);
        
        // Met à jour l'admin existant
        const result = await pool.query(
            'UPDATE admins SET password = $1 WHERE nom = $2 RETURNING *',
            [hashed, username]
        );

        if (result.rows.length > 0) {
            console.log('✅ Mot de passe mis à jour avec succès pour superadmin !');
            console.log('Nouveau hash :', hashed);
        } else {
            console.log('❌ Admin non trouvé.');
        }
    } catch (err) {
        console.error('❌ Erreur :', err);
    } finally {
        process.exit(0);
    }
}

resetPassword();