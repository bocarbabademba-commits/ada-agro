const express = require('express');
const pool = require('../db');
const router = express.Router();

// Vérifier un code promo
router.post('/verify', async (req, res) => {
    const { code } = req.body;
    try {
        const result = await pool.query('SELECT * FROM promo_codes WHERE code = $1 AND is_active = true', [code.toUpperCase()]);
        if (result.rows.length === 0) {
            return res.status(400).json({ message: 'Code promo invalide ou expiré.' });
        }
        res.json({ discount: result.rows[0].discount_percent });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;