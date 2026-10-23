const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');
const router = express.Router();

// ==========================================
// 1. GET : Récupérer toutes les commandes (Admin)
// ==========================================
router.get('/', auth, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ==========================================
// 2. POST : Créer une nouvelle commande (Client)
// ==========================================
router.post('/', async (req, res) => {
    // On récupère toutes les données envoyées par le frontend (y compris le code promo)
    const { 
        clientName, 
        phone, 
        address, 
        items, 
        total, 
        payment, 
        paymentDetails, 
        promoCode, 
        discountAmount 
    } = req.body;

    try {
        // --- A. Vérification et déduction des stocks ---
        for (const item of items) {
            const prodResult = await pool.query('SELECT stock FROM products WHERE id=$1', [item.id]);
            
            if (prodResult.rows.length === 0) {
                return res.status(400).json({ message: `Produit ${item.nom} introuvable.` });
            }
            
            const stock = prodResult.rows[0].stock;
            if (stock < item.quantite) {
                return res.status(400).json({ message: `Stock insuffisant pour ${item.nom}. Il ne reste que ${stock} unités.` });
            }
            
            // Déduire la quantité commandée du stock
            await pool.query('UPDATE products SET stock = stock - $1 WHERE id=$2', [item.quantite, item.id]);
        }

        // --- B. Enregistrement de la commande ---
        // Note : On ajoute promo_code et discount_amount dans la requête SQL
        const result = await pool.query(
            `INSERT INTO orders (
                "clientName", 
                phone, 
                address, 
                items, 
                total, 
                payment, 
                "paymentDetails", 
                promo_code, 
                discount_amount
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [
                clientName, 
                phone, 
                address, 
                JSON.stringify(items), 
                total, 
                payment, 
                JSON.stringify(paymentDetails || {}), 
                promoCode || null, 
                discountAmount || 0
            ]
        );

        // --- C. Attribution des points de fidélité ---
        // 1 point pour 100 FCFA dépensés
        const points = Math.floor(total / 100);
        if (points > 0) {
            const custResult = await pool.query('SELECT * FROM customers WHERE phone=$1', [phone]);
            
            if (custResult.rows.length > 0) {
                // Le client existe déjà, on ajoute les points
                await pool.query('UPDATE customers SET points = points + $1 WHERE phone=$2', [points, phone]);
            } else {
                // Nouveau client, on le crée avec ses premiers points
                await pool.query('INSERT INTO customers (name, phone, points) VALUES ($1, $2, $3)', [clientName, phone, points]);
            }
        }

        // On renvoie la commande créée au frontend
        res.status(201).json(result.rows[0]);

    } catch (err) {
        console.error('Erreur lors de la création de la commande :', err);
        res.status(400).json({ message: err.message });
    }
});

// ==========================================
// 3. PUT : Mettre à jour le statut (Admin)
// ==========================================
router.put('/:id', auth, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    try {
        const result = await pool.query(
            'UPDATE orders SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
            [status, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Commande non trouvée' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// ==========================================
// 4. DELETE : Supprimer une commande (Admin)
// ==========================================
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