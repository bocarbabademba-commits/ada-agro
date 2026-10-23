const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const router = express.Router();

// Créer le dossier "factures" s'il n'existe pas
const facturesDir = path.join(__dirname, '../factures');
if (!fs.existsSync(facturesDir)) {
    fs.mkdirSync(facturesDir);
}

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
    const { clientName, phone, address, items, total, payment, paymentDetails, promoCode, discountAmount } = req.body;

    try {
        // A. Vérification et déduction des stocks
        for (const item of items) {
            const prodResult = await pool.query('SELECT stock FROM products WHERE id=$1', [item.id]);
            if (prodResult.rows.length === 0) return res.status(400).json({ message: `Produit ${item.nom} introuvable.` });
            const stock = prodResult.rows[0].stock;
            if (stock < item.quantite) return res.status(400).json({ message: `Stock insuffisant pour ${item.nom}.` });
            await pool.query('UPDATE products SET stock = stock - $1 WHERE id=$2', [item.quantite, item.id]);
        }

        // B. Enregistrement de la commande
        const result = await pool.query(
            `INSERT INTO orders ("clientName", phone, address, items, total, payment, "paymentDetails", promo_code, discount_amount) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [clientName, phone, address, JSON.stringify(items), total, payment, JSON.stringify(paymentDetails || {}), promoCode || null, discountAmount || 0]
        );

        const newOrder = result.rows[0];

        // --- C. GÉNÉRATION DE LA FACTURE PDF ---
        const invoiceFileName = `facture_${newOrder.id}.pdf`;
        const invoicePath = path.join(facturesDir, invoiceFileName);
        generateInvoicePDF(newOrder, invoicePath);

        // D. Attribution des points de fidélité
        const points = Math.floor(total / 100);
        if (points > 0) {
            const custResult = await pool.query('SELECT * FROM customers WHERE phone=$1', [phone]);
            if (custResult.rows.length > 0) {
                await pool.query('UPDATE customers SET points = points + $1 WHERE phone=$2', [points, phone]);
            } else {
                await pool.query('INSERT INTO customers (name, phone, points) VALUES ($1, $2, $3)', [clientName, phone, points]);
            }
        }

        // On renvoie la commande avec le nom du fichier PDF
        res.status(201).json({ ...newOrder, invoice_file: invoiceFileName });

    } catch (err) {
        console.error(err);
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
        const result = await pool.query('UPDATE orders SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *', [status, id]);
        if (result.rows.length === 0) return res.status(404).json({ message: 'Commande non trouvée' });
        res.json(result.rows[0]);
    } catch (err) { res.status(400).json({ message: err.message }); }
});

// ==========================================
// 4. DELETE : Supprimer une commande (Admin)
// ==========================================
router.delete('/:id', auth, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM orders WHERE id=$1', [id]);
        res.json({ message: 'Commande supprimée' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// ==========================================
// FONCTION DE GÉNÉRATION DE FACTURE PDF
// ==========================================
function generateInvoicePDF(order, filePath) {
    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(fs.createWriteStream(filePath));

    // En-tête
    doc.fontSize(20).fillColor('#1a5e1a').text('ADA AGRO-BUSINESS', { align: 'center' });
    doc.fontSize(10).fillColor('#000').text('Etablissement Traoré - Dakar, Sénégal', { align: 'center' });
    doc.text('Téléphone: +221 78 013 51 07 | Email: trao2@live.fr', { align: 'center' });
    doc.moveDown();

    // Titre
    doc.fontSize(16).text(`FACTURE N° ${order.id}`, { align: 'center', underline: true });
    doc.moveDown();

    // Infos Client
    doc.fontSize(12).text(`Date : ${new Date(order.created_at).toLocaleDateString()}`);
    doc.text(`Client : ${order.clientName}`);
    doc.text(`Téléphone : ${order.phone}`);
    doc.text(`Adresse : ${order.address}`);
    doc.moveDown();

    // Tableau des articles
    doc.fontSize(12).text('Détail des achats :', { underline: true });
    doc.moveDown(0.5);
    
    let y = doc.y;
    doc.text('Produit', 50, y);
    doc.text('Qté', 300, y);
    doc.text('Prix Unitaire', 350, y);
    doc.text('Total', 450, y);
    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();

    order.items.forEach(item => {
        doc.moveDown(0.5);
        y = doc.y;
        doc.text(item.nom, 50, y);
        doc.text(item.quantite.toString(), 300, y);
        doc.text(item.prix.toLocaleString() + ' FCFA', 350, y);
        doc.text((item.prix * item.quantite).toLocaleString() + ' FCFA', 450, y);
    });

    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown();

    // Totaux
    if (order.discount_amount > 0) {
        doc.fontSize(12).fillColor('green').text(`Réduction (${order.promo_code}) : -${order.discount_amount.toLocaleString()} FCFA`, { align: 'right' });
    }
    doc.fontSize(14).fillColor('#000').text(`TOTAL À PAYER : ${order.total.toLocaleString()} FCFA`, { align: 'right', bold: true });
    
    doc.moveDown(2);
    doc.fontSize(10).fillColor('gray').text(`Mode de paiement : ${order.payment}`, { align: 'right' });

    doc.end();
}

module.exports = router;