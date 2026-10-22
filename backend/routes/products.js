const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');
const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM products ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/', auth, async (req, res) => {
    const { nom, prix, categorie, description, media, stock } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO products (nom, prix, categorie, description, media, stock) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [nom, prix, categorie, description, media, stock || 0]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

router.put('/:id', auth, async (req, res) => {
    const { id } = req.params;
    const { nom, prix, categorie, description, media, stock } = req.body;
    try {
        const result = await pool.query(
            'UPDATE products SET nom=$1, prix=$2, categorie=$3, description=$4, media=$5, stock=$6, updated_at=NOW() WHERE id=$7 RETURNING *',
            [nom, prix, categorie, description, media, stock, id]
        );
        if (result.rows.length === 0) return res.status(404).json({ message: 'Produit non trouvé' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

router.delete('/:id', auth, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM products WHERE id=$1', [id]);
        res.json({ message: 'Produit supprimé' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;