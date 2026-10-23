const express = require('express');
const pool = require('../db');
const router = express.Router();

// GET : Récupérer toutes les zones de livraison (Public)
router.get('/', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM delivery_zones ORDER BY price ASC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;