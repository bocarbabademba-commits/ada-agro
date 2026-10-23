const express = require('express');
const pool = require('../db');
const router = express.Router();

// Récupérer les avis d'un produit
router.get('/product/:productId', async (req, res) => {
    const { productId } = req.params;
    try {
        const result = await pool.query(
            'SELECT * FROM reviews WHERE product_id = $1 ORDER BY created_at DESC',
            [productId]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Ajouter un avis
router.post('/', async (req, res) => {
    const { product_id, client_name, rating, comment } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO reviews (product_id, client_name, rating, comment) VALUES ($1, $2, $3, $4) RETURNING *',
            [product_id, client_name, rating, comment]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

module.exports = router;