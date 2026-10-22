const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const auth = require('../middleware/auth');
const router = express.Router();

const isSuperAdmin = (req, res, next) => {
    if (req.admin.role !== 'superadmin') {
        return res.status(403).json({ message: 'Action réservée aux superadmins.' });
    }
    next();
};

router.get('/', auth, isSuperAdmin, async (req, res) => {
    try {
        const result = await pool.query('SELECT id, nom, email, role, created_at FROM admins ORDER BY created_at');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/', auth, isSuperAdmin, async (req, res) => {
    const { nom, email, password, role } = req.body;
    if (!password) return res.status(400).json({ message: 'Mot de passe requis.' });
    try {
        const hashed = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO admins (nom, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id, nom, email, role',
            [nom, email, hashed, role || 'admin']
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

router.put('/:id', auth, isSuperAdmin, async (req, res) => {
    const { id } = req.params;
    const { nom, email, password, role } = req.body;
    try {
        let query = 'UPDATE admins SET nom=$1, email=$2, role=$3, updated_at=NOW()';
        const params = [nom, email, role];
        if (password) {
            const hashed = await bcrypt.hash(password, 10);
            query += ', password=$4 WHERE id=$5 RETURNING id, nom, email, role';
            params.push(hashed, id);
        } else {
            query += ' WHERE id=$4 RETURNING id, nom, email, role';
            params.push(id);
        }
        const result = await pool.query(query, params);
        if (result.rows.length === 0) return res.status(404).json({ message: 'Admin non trouvé' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

router.delete('/:id', auth, isSuperAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const countResult = await pool.query("SELECT COUNT(*) FROM admins WHERE role='superadmin'");
        const targetResult = await pool.query('SELECT role FROM admins WHERE id=$1', [id]);
        if (targetResult.rows.length === 0) return res.status(404).json({ message: 'Admin non trouvé' });
        const count = parseInt(countResult.rows[0].count);
        if (targetResult.rows[0].role === 'superadmin' && count <= 1) {
            return res.status(400).json({ message: 'Impossible de supprimer le dernier superadmin.' });
        }
        await pool.query('DELETE FROM admins WHERE id=$1', [id]);
        res.json({ message: 'Admin supprimé' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;