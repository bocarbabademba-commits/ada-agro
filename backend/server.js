const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cors({ origin: '*' }));

// Servir le frontend
app.use(express.static(path.join(__dirname, '../frontend')));
// Servir le dossier des factures PDF
app.use('/factures', express.static(path.join(__dirname, 'factures')));

// Routes API
app.use('/api/auth', require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/admins', require('./routes/admins'));
app.use('/api/promos', require('./routes/promos'));
app.use('/api/reviews', require('./routes/reviews'));

app.get('/api/test', (req, res) => {
    res.json({ message: 'API ADA AGRO fonctionne correctement !' });
});

app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
        return next();
    }
    res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Serveur démarré sur le port ${PORT}`);
});