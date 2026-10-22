const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// 1. Middlewares de base
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cors({ origin: '*' }));

// 2. Configuration pour servir le frontend (HTML, CSS, JS)
// Cela dit à Express d'aller chercher les fichiers dans le dossier 'frontend' situé un niveau au-dessus
app.use(express.static(path.join(__dirname, '../frontend')));

// 3. Routes de l'API
app.use('/api/auth', require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/admins', require('./routes/admins'));

// 4. Route de test pour vérifier que l'API fonctionne
app.get('/api/test', (req, res) => {
    res.json({ message: 'API ADA AGRO fonctionne correctement !' });
});

// 5. Redirection de secours (Optionnel mais recommandé)
// Si un utilisateur tape une URL qui n'est pas une API et qui n'est pas un fichier, 
// on lui renvoie la page d'accueil (index.html)
app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
        return next(); // On laisse les routes API gérer les erreurs 404
    }
    res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
});

// 6. Démarrage du serveur
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Serveur démarré sur le port ${PORT}`);
});