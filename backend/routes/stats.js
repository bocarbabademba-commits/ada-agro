const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');
const router = express.Router();

// Route pour récupérer toutes les statistiques
router.get('/', auth, async (req, res) => {
    try {
        // 1. Chiffre d'affaires total (seulement les commandes livrées ou confirmées)
        const caResult = await pool.query(
            "SELECT SUM(total) as chiffre_affaires FROM orders WHERE status IN ('confirmée', 'livrée')"
        );
        const chiffreAffaires = caResult.rows[0].chiffre_affaires || 0;

        // 2. Nombre de commandes en attente
        const attenteResult = await pool.query(
            "SELECT COUNT(*) as en_attente FROM orders WHERE status = 'en attente'"
        );
        const commandesEnAttente = parseInt(attenteResult.rows[0].en_attente);

        // 3. Produits en rupture de stock (stock <= 0)
        const ruptureResult = await pool.query(
            "SELECT id, nom, stock FROM products WHERE stock <= 0"
        );
        const produitsEnRupture = ruptureResult.rows;

        // 4. Top 5 des produits les plus vendus
        // On extrait les données JSONB des items de la table orders
        const topProduitsResult = await pool.query(`
            SELECT 
                item->>'nom' as nom,
                SUM((item->>'quantite')::int) as quantite_totale
            FROM orders,
            jsonb_array_elements(items) as item
            WHERE status IN ('confirmée', 'livrée')
            GROUP BY item->>'nom'
            ORDER BY quantite_totale DESC
            LIMIT 5
        `);
        const topProduits = topProduitsResult.rows;

        res.json({
            chiffreAffaires,
            commandesEnAttente,
            produitsEnRupture,
            topProduits
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Erreur lors du calcul des statistiques.' });
    }
});

module.exports = router;