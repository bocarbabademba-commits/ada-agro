const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');
const router = express.Router();

router.get('/', auth, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/', async (req, res) => {
    const { clientName, phone, address, items, total, payment, paymentDetails } = req.body;
    try {
        // Vérifier les stocks et décrémenter
        for (const item of items) {
            const prodResult = await pool.query('SELECT stock FROM products WHERE id=$1', [item.id]);
            if (prodResult.rows.length === 0) {
                return res.status(400).json({ message: `Produit ${item.nom} introuvable.` });
            }
            const stock = prodResult.rows[0].stock;
            if (stock < item.quantite) {
                return res.status(400).json({ message: `Stock insuffisant pour ${item.nom}.` });
            }
            await pool.query('UPDATE products SET stock = stock - $1 WHERE id=$2', [item.quantite, item.id]);
        }

        // Créer la commande avec le mode de paiement
        const result = await pool.query(
            'INSERT INTO orders ("clientName", phone, address, items, total, payment, "paymentDetails") VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
            [clientName, phone, address, JSON.stringify(items), total, payment, JSON.stringify(paymentDetails || {})]
        );

        // Points de fidélité
        const points = Math.floor(total / 100);
        if (points > 0) {
            const custResult = await pool.query('SELECT * FROM customers WHERE phone=$1', [phone]);
            if (custResult.rows.length > 0) {
                await pool.query('UPDATE customers SET points = points + $1 WHERE phone=$2', [points, phone]);
            } else {
                await pool.query('INSERT INTO customers (name, phone, points) VALUES ($1, $2, $3)', [clientName, phone, points]);
            }
        }

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(400).json({ message: err.message });
    }
});

router.put('/:id', auth, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    try {
        const result = await pool.query(
            'UPDATE orders SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
            [status, id]
        );
        if (result.rows.length === 0) return res.status(404).json({ message: 'Commande non trouvée' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

router.delete('/:id', auth, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM orders WHERE id=$1', [id]);
        res.json({ message: 'Commande supprimée' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;