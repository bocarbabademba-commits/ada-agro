const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const router = express.Router();

// --- Connexion classique ---
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: 'Nom d\'utilisateur et mot de passe requis.' });
    }

    try {
        const result = await pool.query(
            'SELECT * FROM admins WHERE nom = $1 OR email = $1',
            [username]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ message: 'Identifiants incorrects.' });
        }

        const admin = result.rows[0];
        const isMatch = await bcrypt.compare(password, admin.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Identifiants incorrects.' });
        }

        const token = jwt.sign(
            { id: admin.id, nom: admin.nom, role: admin.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            token,
            admin: { id: admin.id, nom: admin.nom, email: admin.email, role: admin.role }
        });
    } catch (err) {
        console.error('Erreur serveur:', err);
        res.status(500).json({ message: 'Erreur serveur.' });
    }
});

// --- Demande de réinitialisation ---
router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;

    try {
        const result = await pool.query('SELECT * FROM admins WHERE email = $1', [email]);

        if (result.rows.length === 0) {
            return res.status(400).json({ message: 'Aucun compte associé à cet email.' });
        }

        // Générer un code à 6 chiffres
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expires = new Date(Date.now() + 15 * 60000); // 15 minutes

        // Sauvegarder le code en base
        await pool.query(
            'UPDATE admins SET reset_code = $1, reset_code_expires = $2 WHERE email = $3',
            [code, expires, email]
        );

        // Pour la démo, on affiche le code dans le terminal
        console.log(`\n🔐 CODE DE RÉINITIALISATION pour ${email} : ${code}\n`);

        res.json({ message: 'Code de réinitialisation envoyé (voir console backend).' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Erreur serveur.' });
    }
});

// --- Validation du code et changement du mot de passe ---
router.post('/reset-password', async (req, res) => {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
        return res.status(400).json({ message: 'Tous les champs sont requis.' });
    }

    try {
        const result = await pool.query(
            'SELECT * FROM admins WHERE email = $1 AND reset_code = $2 AND reset_code_expires > NOW()',
            [email, code]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ message: 'Code invalide ou expiré.' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Mettre à jour le mot de passe et effacer le code
        await pool.query(
            'UPDATE admins SET password = $1, reset_code = NULL, reset_code_expires = NULL WHERE email = $2',
            [hashedPassword, email]
        );

        res.json({ message: 'Mot de passe réinitialisé avec succès.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Erreur serveur.' });
    }
});

module.exports = router;