const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');
const router = express.Router();

router.get('/', auth, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM customers ORDER BY points DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/', auth, async (req, res) => {
    const { name, phone } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO customers (name, phone) VALUES ($1, $2) RETURNING *',
            [name, phone]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

router.delete('/:id', auth, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM customers WHERE id=$1', [id]);
        res.json({ message: 'Client supprimé' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;