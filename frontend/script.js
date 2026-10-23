// ============================================================
// 1. CONFIGURATION
// ============================================================
const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:') 
    ? 'http://localhost:5000/api' 
    : '/api';

let token = sessionStorage.getItem('adaToken') || null;
let currentAdmin = null;
let cart = JSON.parse(sessionStorage.getItem('adaCart')) || [];
let allProductsData = []; 
let appliedDiscount = 0;
let currentCategoryFilter = 'all';

// ============================================================
// 2. FONCTIONS UTILITAIRES
// ============================================================
function formatPrice(price) {
    return Number(price).toLocaleString() + ' FCFA';
}

async function apiRequest(endpoint, method = 'GET', body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['x-auth-token'] = token;

    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);

    const response = await fetch(`${API_BASE}${endpoint}`, options);
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || 'Erreur serveur');
    }
    return data;
}

function getStockClass(stock) {
    if (stock <= 0) return 'stock-out';
    if (stock <= 5) return 'stock-low';
    return 'stock-ok';
}

function getStockLabel(stock) {
    if (stock <= 0) return 'Rupture';
    return `Stock: ${stock}`;
}

// ============================================================
// 3. GESTION DU PANIER
// ============================================================
function saveCart() {
    sessionStorage.setItem('adaCart', JSON.stringify(cart));
    updateCartUI();
}

function updateCartUI() {
    const total = cart.reduce((sum, item) => sum + item.prix * item.quantite, 0);
    document.getElementById('cartTotal').textContent = formatPrice(total);
    document.getElementById('cartCount').textContent = cart.reduce((s, i) => s + i.quantite, 0);
    renderCartItems();
}

function renderCartItems() {
    const container = document.getElementById('cartItems');
    if (cart.length === 0) {
        container.innerHTML = `<div class="cart-empty"><i class="fas fa-shopping-basket"></i>Votre panier est vide.</div>`;
        return;
    }
    let html = '';
    cart.forEach((item, index) => {
        html += `
            <div class="cart-item">
                <div class="cart-item-info"><h4>${item.nom}</h4><div class="item-price">${formatPrice(item.prix)}</div></div>
                <div class="cart-item-qty">
                    <button class="qty-dec" data-index="${index}">-</button>
                    <span>${item.quantite}</span>
                    <button class="qty-inc" data-index="${index}">+</button>
                </div>
                <button class="cart-item-remove" data-index="${index}"><i class="fas fa-trash-alt"></i></button>
            </div>
        `;
    });
    container.innerHTML = html;

    container.querySelectorAll('.qty-inc').forEach(btn => {
        btn.addEventListener('click', function() {
            const idx = parseInt(this.dataset.index);
            cart[idx].quantite += 1;
            saveCart();
        });
    });
    container.querySelectorAll('.qty-dec').forEach(btn => {
        btn.addEventListener('click', function() {
            const idx = parseInt(this.dataset.index);
            if (cart[idx].quantite > 1) { cart[idx].quantite -= 1; } else { cart.splice(idx, 1); }
            saveCart();
        });
    });
    container.querySelectorAll('.cart-item-remove').forEach(btn => {
        btn.addEventListener('click', function() {
            const idx = parseInt(this.dataset.index);
            cart.splice(idx, 1);
            saveCart();
        });
    });
}

function addToCart(product) {
    if (product.stock <= 0) { alert('Produit en rupture de stock.'); return; }
    const existing = cart.find(item => item.id === product.id);
    if (existing) {
        if (existing.quantite + 1 > product.stock) { alert(`Stock insuffisant. Il ne reste que ${product.stock} unités.`); return; }
        existing.quantite += 1;
    } else {
        cart.push({ id: product.id, nom: product.nom, prix: product.prix, quantite: 1, stock: product.stock });
    }
    saveCart();
    openCart();
}

// ============================================================
// 4. AFFICHAGE DES PRODUITS & RECHERCHE
// ============================================================
async function renderClientProducts(filter = 'all') {
    try {
        const products = await apiRequest('/products');
        allProductsData = products; 
        currentCategoryFilter = filter;
        applyFiltersAndRender(filter, document.getElementById('searchInput')?.value || '');
    } catch (error) {
        document.getElementById('productGrid').innerHTML = `<p style="color:red;text-align:center;">Erreur : ${error.message}</p>`;
    }
}

function applyFiltersAndRender(categoryFilter = 'all', searchText = '') {
    const grid = document.getElementById('productGrid');
    let filtered = allProductsData;
    
    if (categoryFilter !== 'all') {
        filtered = filtered.filter(p => p.categorie === categoryFilter);
    }
    
    if (searchText.trim() !== '') {
        const lowerSearch = searchText.toLowerCase();
        filtered = filtered.filter(p => 
            p.nom.toLowerCase().includes(lowerSearch) || 
            (p.description && p.description.toLowerCase().includes(lowerSearch))
        );
    }

    if (filtered.length === 0) {
        grid.innerHTML = '<p style="text-align:center;color:var(--gray);padding:40px 0;">Aucun produit ne correspond à votre recherche.</p>';
        return;
    }

    let html = '';
    filtered.forEach(p => {
        const mediaHtml = p.media ? (p.media.startsWith('data:video') ?
            `<video src="${p.media}" muted loop></video>` :
            `<img src="${p.media}" alt="${p.nom}" />`) :
            `<div class="img-placeholder"><i class="fas fa-seedling"></i><span>${p.nom}</span></div>`;
        
        const stock = p.stock || 0;
        const stockClass = getStockClass(stock);
        const stockLabel = getStockLabel(stock);
        const disabled = stock <= 0 ? 'disabled' : '';
        const btnText = stock <= 0 ? 'Rupture de stock' : 'Ajouter au panier';

        html += `
            <div class="product-card" data-id="${p.id}">
                <div class="product-image">${mediaHtml}<span class="product-tag">${p.categorie}</span></div>
                <div class="product-body">
                    <span class="product-badge">${p.categorie}</span>
                    <h3>${p.nom} <span class="stock-badge ${stockClass}">${stockLabel}</span></h3>
                    <div class="subtitle">${p.categorie}</div>
                    <p>${p.description || ''}</p>
                    <div class="product-price">${formatPrice(p.prix)} <small>l'unité</small></div>
                    <button class="btn btn-sm btn-secondary add-to-cart" data-id="${p.id}" ${disabled}>${btnText}</button>
                </div>
            </div>
        `;
    });
    grid.innerHTML = html;

    grid.querySelectorAll('.add-to-cart').forEach(btn => {
        btn.addEventListener('click', function() {
            if (this.disabled) return;
            const id = parseInt(this.dataset.id);
            const product = allProductsData.find(p => p.id === id);
            if (product) addToCart(product);
        });
    });
}

// Événements Recherche et Filtres
document.getElementById('searchInput').addEventListener('input', function() {
    applyFiltersAndRender(currentCategoryFilter, this.value);
});

document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        currentCategoryFilter = this.dataset.filter;
        const searchText = document.getElementById('searchInput').value;
        applyFiltersAndRender(currentCategoryFilter, searchText);
    });
});

// ============================================================
// 5. COMMANDE + PAIEMENT + CODE PROMO
// ============================================================
document.getElementById('checkoutBtn').addEventListener('click', () => {
    if (cart.length === 0) { alert('Votre panier est vide.'); return; }
    appliedDiscount = 0; // Reset promo
    document.getElementById('promoCodeInput').value = '';
    document.getElementById('promoMessage').textContent = '';
    openCheckout();
});

function openCheckout() {
    updateCheckoutSummary();
    document.getElementById('checkoutModal').classList.add('active');
    document.getElementById('cartOverlay').classList.add('active');
    document.getElementById('paymentDetails').innerHTML = '';
    document.getElementById('checkoutPayment').value = '';
}

function updateCheckoutSummary() {
    const summary = document.getElementById('checkoutSummary');
    let html = '';
    let subtotal = 0;
    
    cart.forEach(item => {
        const st = item.prix * item.quantite;
        subtotal += st;
        html += `<div class="line"><span>${item.nom} (×${item.quantite})</span><span>${formatPrice(st)}</span></div>`;
    });
    
    let discountValue = (subtotal * appliedDiscount) / 100;
    let finalTotal = subtotal - discountValue;

    if (appliedDiscount > 0) {
        html += `<div class="line" style="color: #2e7d32;"><span>Réduction (${appliedDiscount}%)</span><span>-${formatPrice(discountValue)}</span></div>`;
    }
    
    html += `<div class="line total"><span>Total à payer</span><span>${formatPrice(finalTotal)}</span></div>`;
    summary.innerHTML = html;
}

document.getElementById('applyPromoBtn').addEventListener('click', async () => {
    const code = document.getElementById('promoCodeInput').value.trim();
    const msg = document.getElementById('promoMessage');
    
    if (!code) { msg.textContent = "Veuillez saisir un code."; msg.style.color = "red"; return; }

    try {
        const data = await apiRequest('/promos/verify', 'POST', { code });
        appliedDiscount = data.discount;
        msg.textContent = `Code appliqué : -${appliedDiscount}% !`;
        msg.style.color = "#2e7d32";
        updateCheckoutSummary();
    } catch (error) {
        appliedDiscount = 0;
        msg.textContent = error.message;
        msg.style.color = "red";
        updateCheckoutSummary();
    }
});

document.getElementById('checkoutClose').addEventListener('click', closeCheckout);
document.getElementById('cartOverlay').addEventListener('click', () => {
    if (document.getElementById('checkoutModal').classList.contains('active')) closeCheckout();
});

function closeCheckout() {
    document.getElementById('checkoutModal').classList.remove('active');
    if (!document.getElementById('cartSidebar').classList.contains('open')) {
        document.getElementById('cartOverlay').classList.remove('active');
        document.body.style.overflow = '';
    }
}

document.getElementById('checkoutPayment').addEventListener('change', function() {
    const val = this.value;
    const container = document.getElementById('paymentDetails');
    if (val === 'mobile_money') {
        container.innerHTML = `
            <div class="payment-fields">
                <h5><i class="fas fa-mobile-alt"></i> Paiement Mobile Money</h5>
                <div class="form-group"><label>Opérateur</label><select id="pmOperator" required><option value="">-- Choisir --</option><option value="Orange Money">Orange Money</option><option value="Wave">Wave</option><option value="Free Money">Free Money</option></select></div>
                <div class="form-group"><label>Numéro de téléphone</label><input type="tel" id="pmPhone" placeholder="+221 77 000 00 00" required /></div>
            </div>`;
    } else if (val === 'carte_bancaire') {
        container.innerHTML = `
            <div class="payment-fields">
                <h5><i class="fas fa-credit-card"></i> Paiement par carte bancaire</h5>
                <div class="form-group"><label>Numéro de carte</label><input type="text" id="cbNumber" placeholder="1234 5678 9012 3456" maxlength="19" required /></div>
                <div class="form-row"><div class="form-group"><label>Expiration</label><input type="text" id="cbExpiry" placeholder="MM/AA" maxlength="5" required /></div><div class="form-group"><label>CVV</label><input type="text" id="cbCvv" placeholder="123" maxlength="4" required /></div></div>
                <div class="form-group"><label>Nom sur la carte</label><input type="text" id="cbName" placeholder="NOM PRENOM" required /></div>
            </div>`;
    } else if (val === 'especes') {
        container.innerHTML = `<div class="payment-fields"><h5><i class="fas fa-money-bill-wave"></i> Espèces à la livraison</h5><p style="font-size:0.9rem;color:var(--gray);">Vous paierez en espèces au moment de la livraison. Merci de préparer le montant exact.</p></div>`;
    } else {
        container.innerHTML = '';
    }
});

document.getElementById('checkoutForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('checkoutName').value.trim();
    const phone = document.getElementById('checkoutPhone').value.trim();
    const address = document.getElementById('checkoutAddress').value.trim();
    const payment = document.getElementById('checkoutPayment').value;

    if (!name || !phone || !address || !payment) { alert('Veuillez remplir tous les champs obligatoires.'); return; }

    let paymentDetails = {};
    if (payment === 'mobile_money') {
        const operator = document.getElementById('pmOperator')?.value;
        const pmPhone = document.getElementById('pmPhone')?.value;
        if (!operator || !pmPhone) { alert('Veuillez remplir les détails Mobile Money.'); return; }
        paymentDetails = { operator, phone: pmPhone };
    } else if (payment === 'carte_bancaire') {
        const num = document.getElementById('cbNumber')?.value;
        const exp = document.getElementById('cbExpiry')?.value;
        const cvv = document.getElementById('cbCvv')?.value;
        const holder = document.getElementById('cbName')?.value;
        if (!num || !exp || !cvv || !holder) { alert('Veuillez remplir les détails de la carte.'); return; }
        paymentDetails = { last4: num.slice(-4), holder };
    }

    let subtotal = cart.reduce((sum, item) => sum + item.prix * item.quantite, 0);
    let total = subtotal - (subtotal * appliedDiscount / 100);
    let discountAmount = subtotal * appliedDiscount / 100;
    const items = cart.map(i => ({ id: i.id, nom: i.nom, quantite: i.quantite, prix: i.prix }));
    const promoCode = document.getElementById('promoCodeInput').value.trim().toUpperCase() || null;

    try {
        await apiRequest('/orders', 'POST', { 
            clientName: name, 
            phone, 
            address, 
            items, 
            total, 
            payment, 
            paymentDetails, 
            promoCode, 
            discountAmount 
        });
        
        cart = [];
        appliedDiscount = 0;
        saveCart();
        closeCheckout();
        closeCart();
        document.getElementById('checkoutForm').reset();
        document.getElementById('paymentDetails').innerHTML = '';
        document.getElementById('promoMessage').textContent = '';
        alert('✅ Commande enregistrée ! Merci.');
        renderClientProducts();
    } catch (error) {
        alert('Erreur : ' + error.message);
    }
});

// (Les fonctions ADMIN restent inchangées, elles sont identiques à votre version actuelle)
// ... [Le reste du code admin de connexion, produits, commandes, clients est à conserver tel quel] ...

// ============================================================
// 15. INITIALISATION
// ============================================================
(async function init() {
    checkSession();
    await renderClientProducts();
    renderCartItems();
    updateCartUI();
    console.log('✅ ADA AGRO-BUSINESS connecté à l\'API');
})();