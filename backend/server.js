const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cors({ origin: '*' }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/admins', require('./routes/admins'));

app.get('/test', (req, res) => {
    res.json({ message: 'API ADA AGRO fonctionne !' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Serveur démarré sur le port ${PORT}`);
});