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
let deliveryZones = []; // Stockera les zones de livraison
let selectedDeliveryFee = 0; // Frais de livraison actuels

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
// 3. GESTION DU PANIER & LIVRAISON
// ============================================================
async function loadDeliveryZones() {
    try {
        deliveryZones = await apiRequest('/delivery');
        const select = document.getElementById('checkoutDeliveryZone');
        if (!select) return; // Sécurité si l'élément n'est pas encore chargé
        
        select.innerHTML = '<option value="">-- Choisissez votre zone --</option>';
        deliveryZones.forEach(zone => {
            select.innerHTML += `<option value="${zone.id}" data-price="${zone.price}" data-name="${zone.name}">${zone.name} (+${formatPrice(zone.price)})</option>`;
        });
    } catch (error) {
        console.error("Erreur lors du chargement des zones:", error);
    }
}

// Écouter le changement de zone de livraison
document.addEventListener('DOMContentLoaded', () => {
    const zoneSelect = document.getElementById('checkoutDeliveryZone');
    if (zoneSelect) {
        zoneSelect.addEventListener('change', function() {
            const selectedOption = this.options[this.selectedIndex];
            if (selectedOption.value) {
                selectedDeliveryFee = parseFloat(selectedOption.dataset.price);
            } else {
                selectedDeliveryFee = 0;
            }
            updateCheckoutSummary();
        });
    }
});

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
    
    if (categoryFilter !== 'all') filtered = filtered.filter(p => p.categorie === categoryFilter);
    
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
                    <div style="display: flex; gap: 8px; margin-top: 4px;">
                        <button class="btn btn-sm btn-secondary add-to-cart" data-id="${p.id}" ${disabled} style="flex:1;">${btnText}</button>
                        <button class="btn btn-sm btn-outline" onclick="toggleReviews(${p.id})" style="padding: 8px 12px;"><i class="fas fa-comment"></i> Avis</button>
                    </div>
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

// --- GESTION DES AVIS CLIENTS ---
function toggleReviews(productId) {
    let existingSection = document.getElementById(`reviews_section_${productId}`);
    if (existingSection) { existingSection.remove(); return; }
    const card = document.querySelector(`.product-card[data-id="${productId}"]`);
    if (!card) return;
    const section = document.createElement('div');
    section.id = `reviews_section_${productId}`;
    section.className = 'reviews-section';
    section.innerHTML = `<div id="reviews_${productId}"></div>`;
    card.querySelector('.product-body').appendChild(section);
    loadReviews(productId, `reviews_${productId}`);
}

async function loadReviews(productId, containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = '<p style="font-size:0.8rem;color:gray;">Chargement des avis...</p>';
    try {
        const reviews = await apiRequest(`/reviews/product/${productId}`);
        let html = `<h4>Avis clients (${reviews.length})</h4>`;
        if (reviews.length === 0) {
            html += `<p style="font-size:0.85rem;color:gray;margin-bottom:10px;">Aucun avis. Soyez le premier !</p>`;
        } else {
            reviews.forEach(r => {
                let stars = '';
                for(let i=0; i<5; i++) stars += `<i class="fas fa-star ${i < r.rating ? 'active' : ''}"></i>`;
                html += `<div class="review-item"><div class="review-header"><span class="review-author">${r.client_name}</span><span class="review-stars">${stars}</span></div><p class="review-comment">"${r.comment}"</p></div>`;
            });
        }
        html += `
            <div class="add-review-form">
                <h5>Laisser un avis :</h5>
                <input type="text" id="revName_${productId}" placeholder="Votre nom" required>
                <div class="star-rating" id="stars_${productId}">
                    <i class="fas fa-star" data-value="1"></i><i class="fas fa-star" data-value="2"></i><i class="fas fa-star" data-value="3"></i><i class="fas fa-star" data-value="4"></i><i class="fas fa-star" data-value="5"></i>
                </div>
                <input type="hidden" id="rating_${productId}" value="5">
                <textarea id="revComment_${productId}" placeholder="Votre avis..." required></textarea>
                <button class="btn btn-sm btn-primary" onclick="submitReview(${productId})">Publier</button>
            </div>`;
        container.innerHTML = html;
        const starContainer = document.getElementById(`stars_${productId}`);
        starContainer.addEventListener('click', (e) => {
            if (e.target.tagName === 'I') {
                const val = parseInt(e.target.dataset.value);
                document.getElementById(`rating_${productId}`).value = val;
                starContainer.querySelectorAll('i').forEach((star, index) => {
                    if (index < val) star.classList.add('active'); else star.classList.remove('active');
                });
            }
        });
    } catch (error) { container.innerHTML = `<p style="color:red;font-size:0.8rem;">Erreur chargement des avis.</p>`; }
}

async function submitReview(productId) {
    const name = document.getElementById(`revName_${productId}`).value.trim();
    const rating = document.getElementById(`rating_${productId}`).value;
    const comment = document.getElementById(`revComment_${productId}`).value.trim();
    if (!name || !comment) { alert("Veuillez remplir votre nom et votre commentaire."); return; }
    try {
        await apiRequest('/reviews', 'POST', { product_id: productId, client_name: name, rating: parseInt(rating), comment: comment });
        loadReviews(productId, `reviews_${productId}`);
        alert("✅ Merci pour votre avis !");
    } catch (error) { alert("Erreur : " + error.message); }
}

document.getElementById('searchInput').addEventListener('input', function() { applyFiltersAndRender(currentCategoryFilter, this.value); });
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        currentCategoryFilter = this.dataset.filter;
        applyFiltersAndRender(currentCategoryFilter, document.getElementById('searchInput').value);
    });
});

// ============================================================
// 4bis. SUIVI DE COMMANDE (CLIENT)
// ============================================================
const trackOrderModal = document.getElementById('trackOrderModal');
const trackOrderClose = document.getElementById('trackOrderClose');
const trackOrderNavLink = document.getElementById('trackOrderNavLink');
const trackOrderHeroBtn = document.getElementById('trackOrderHeroBtn');

if (trackOrderNavLink) trackOrderNavLink.addEventListener('click', (e) => { e.preventDefault(); trackOrderModal.classList.add('active'); });
if (trackOrderHeroBtn) trackOrderHeroBtn.addEventListener('click', (e) => { e.preventDefault(); trackOrderModal.classList.add('active'); });
if (trackOrderClose) trackOrderClose.addEventListener('click', () => { trackOrderModal.classList.remove('active'); document.getElementById('trackResults').innerHTML = ''; });
if (trackOrderModal) trackOrderModal.addEventListener('click', (e) => { if (e.target === e.currentTarget) { trackOrderModal.classList.remove('active'); document.getElementById('trackResults').innerHTML = ''; } });

if (document.getElementById('trackOrderForm')) {
    document.getElementById('trackOrderForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const phone = document.getElementById('trackPhone').value.trim();
        const resultsDiv = document.getElementById('trackResults');
        resultsDiv.innerHTML = '<p style="text-align:center;">Recherche...</p>';

        try {
            const orders = await apiRequest(`/orders/track/${phone}`);
            if (orders.length === 0) {
                resultsDiv.innerHTML = '<p style="color:red; text-align:center;">Aucune commande trouvée pour ce numéro.</p>';
                return;
            }
            
            let html = '';
            orders.forEach(order => {
                const statusClass = 'status-' + order.status.replace(' ', '-');
                let statusIcon = order.status === 'en attente' ? 'fa-clock' : (order.status === 'confirmée' ? 'fa-check-circle' : 'fa-truck');
                html += `
                    <div style="background: var(--cream); padding: 15px; border-radius: 8px; margin-bottom: 10px; border-left: 4px solid ${order.status === 'livrée' ? '#10b981' : 'var(--secondary)'};">
                        <div style="display:flex; justify-content:space-between; margin-bottom: 8px;">
                            <strong>Commande #${order.id}</strong>
                            <span class="status-badge ${statusClass}"><i class="fas ${statusIcon}"></i> ${order.status}</span>
                        </div>
                        <p style="font-size: 0.85rem; color: var(--gray); margin-bottom: 5px;">Date : ${new Date(order.created_at).toLocaleDateString()}</p>
                        <p style="font-size: 0.9rem;">Total : <strong>${formatPrice(order.total)}</strong></p>
                    </div>
                `;
            });
            resultsDiv.innerHTML = html;
        } catch (error) {
            resultsDiv.innerHTML = `<p style="color:red; text-align:center;">Erreur : ${error.message}</p>`;
        }
    });
}

// ============================================================
// 5. COMMANDE + PAIEMENT + CODE PROMO + LIVRAISON
// ============================================================
document.getElementById('checkoutBtn').addEventListener('click', () => {
    if (cart.length === 0) { alert('Votre panier est vide.'); return; }
    appliedDiscount = 0;
    selectedDeliveryFee = 0;
    document.getElementById('promoCodeInput').value = '';
    document.getElementById('promoMessage').textContent = '';
    document.getElementById('checkoutDeliveryZone').value = '';
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
    let finalTotal = subtotal - discountValue + selectedDeliveryFee;

    if (appliedDiscount > 0) {
        html += `<div class="line" style="color: #2e7d32;"><span>Réduction (${appliedDiscount}%)</span><span>-${formatPrice(discountValue)}</span></div>`;
    }
    
    if (selectedDeliveryFee > 0) {
        html += `<div class="line"><span>Frais de livraison</span><span>+${formatPrice(selectedDeliveryFee)}</span></div>`;
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
        container.innerHTML = `<div class="payment-fields"><h5><i class="fas fa-mobile-alt"></i> Mobile Money</h5><div class="form-group"><label>Opérateur</label><select id="pmOperator" required><option value="">-- Choisir --</option><option value="Orange Money">Orange Money</option><option value="Wave">Wave</option><option value="Free Money">Free Money</option></select></div><div class="form-group"><label>Numéro de téléphone</label><input type="tel" id="pmPhone" placeholder="+221 77 000 00 00" required /></div></div>`;
    } else if (val === 'carte_bancaire') {
        container.innerHTML = `<div class="payment-fields"><h5><i class="fas fa-credit-card"></i> Carte bancaire</h5><div class="form-group"><label>Numéro de carte</label><input type="text" id="cbNumber" placeholder="1234 5678 9012 3456" maxlength="19" required /></div><div class="form-row"><div class="form-group"><label>Expiration</label><input type="text" id="cbExpiry" placeholder="MM/AA" maxlength="5" required /></div><div class="form-group"><label>CVV</label><input type="text" id="cbCvv" placeholder="123" maxlength="4" required /></div></div><div class="form-group"><label>Nom sur la carte</label><input type="text" id="cbName" placeholder="NOM PRENOM" required /></div></div>`;
    } else if (val === 'especes') {
        container.innerHTML = `<div class="payment-fields"><h5><i class="fas fa-money-bill-wave"></i> Espèces à la livraison</h5><p style="font-size:0.9rem;color:var(--gray);">Vous paierez en espèces au moment de la livraison.</p></div>`;
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
    const zoneSelect = document.getElementById('checkoutDeliveryZone');
    const zoneId = zoneSelect.value;
    
    if (!name || !phone || !address || !payment || !zoneId) { 
        alert('Veuillez remplir tous les champs obligatoires, y compris la zone de livraison.'); 
        return; 
    }

    const selectedOption = zoneSelect.options[zoneSelect.selectedIndex];
    const deliveryZoneName = selectedOption.dataset.name;
    const deliveryFeeValue = parseFloat(selectedOption.dataset.price);

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
    let discountAmount = subtotal * appliedDiscount / 100;
    let total = subtotal - discountAmount + deliveryFeeValue;
    
    const items = cart.map(i => ({ id: i.id, nom: i.nom, quantite: i.quantite, prix: i.prix }));
    const promoCode = document.getElementById('promoCodeInput').value.trim().toUpperCase() || null;

    try {
        await apiRequest('/orders', 'POST', { 
            clientName: name, phone, address, items, total, payment, paymentDetails, promoCode, discountAmount,
            deliveryZone: deliveryZoneName, deliveryFee: deliveryFeeValue
        });
        cart = [];
        appliedDiscount = 0;
        selectedDeliveryFee = 0;
        saveCart();
        closeCheckout();
        closeCart();
        document.getElementById('checkoutForm').reset();
        document.getElementById('paymentDetails').innerHTML = '';
        alert('✅ Commande enregistrée ! Merci.');
        renderClientProducts();
    } catch (error) {
        alert('Erreur : ' + error.message);
    }
});

// ============================================================
// 6. ADMIN : AUTHENTIFICATION & RÉINITIALISATION
// ============================================================
async function loginAdmin(username, password) {
    try {
        const data = await apiRequest('/auth/login', 'POST', { username, password });
        token = data.token;
        currentAdmin = data.admin;
        sessionStorage.setItem('adaToken', token);
        showAdminUI();
        return true;
    } catch (error) { return false; }
}

function logoutAdmin() {
    sessionStorage.removeItem('adaToken');
    token = null;
    currentAdmin = null;
    hideAdminUI();
    window.location.hash = '#home';
}

function checkSession() {
    if (token) {
        apiRequest('/products', 'GET')
            .then(() => { currentAdmin = { role: 'admin' }; showAdminUI(); })
            .catch(() => { sessionStorage.removeItem('adaToken'); token = null; hideAdminUI(); });
    } else { hideAdminUI(); }
}

function showAdminUI() {
    document.getElementById('adminSection').classList.add('active');
    document.querySelectorAll('.hero, .products, .about, .contact').forEach(el => el.style.display = 'none');
    document.getElementById('home').style.display = 'none';
    document.getElementById('products').style.display = 'none';
    document.getElementById('about').style.display = 'none';
    document.getElementById('contact').style.display = 'none';
    document.getElementById('adminSection').style.display = 'block';
    
    // Charger le dashboard par défaut
    renderDashboard();
}

function hideAdminUI() {
    document.getElementById('adminSection').classList.remove('active');
    document.getElementById('adminSection').style.display = 'none';
    document.querySelectorAll('.hero, .products, .about, .contact').forEach(el => el.style.display = '');
    document.getElementById('home').style.display = '';
    document.getElementById('products').style.display = '';
    document.getElementById('about').style.display = '';
    document.getElementById('contact').style.display = '';
}

document.getElementById('adminNavLink').addEventListener('click', (e) => {
    e.preventDefault();
    if (token) { showAdminUI(); } else { document.getElementById('adminLoginModal').classList.add('active'); }
});

document.getElementById('adminLoginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value.trim();
    const success = await loginAdmin(username, password);
    if (success) {
        document.getElementById('adminLoginModal').classList.remove('active');
        document.getElementById('loginError').style.display = 'none';
        document.getElementById('adminLoginForm').reset();
    } else {
        document.getElementById('loginError').style.display = 'block';
    }
});

document.getElementById('adminLogoutBtn').addEventListener('click', logoutAdmin);
document.getElementById('adminLoginModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) { document.getElementById('adminLoginModal').classList.remove('active'); document.getElementById('loginError').style.display = 'none'; }
});

document.getElementById('togglePassword').addEventListener('click', function() {
    const passwordInput = document.getElementById('loginPassword');
    const icon = this.querySelector('i');
    if (passwordInput.type === 'password') { passwordInput.type = 'text'; icon.classList.remove('fa-eye'); icon.classList.add('fa-eye-slash'); }
    else { passwordInput.type = 'password'; icon.classList.remove('fa-eye-slash'); icon.classList.add('fa-eye'); }
});

document.getElementById('forgotPasswordLink').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('adminLoginModal').classList.remove('active');
    document.getElementById('forgotPasswordModal').classList.add('active');
});

document.getElementById('forgotPasswordClose').addEventListener('click', () => { document.getElementById('forgotPasswordModal').classList.remove('active'); });
document.getElementById('forgotPasswordModal').addEventListener('click', (e) => { if (e.target === e.currentTarget) document.getElementById('forgotPasswordModal').classList.remove('active'); });

document.getElementById('forgotPasswordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('resetEmail').value.trim();
    const errorDiv = document.getElementById('forgotPasswordError');
    const successDiv = document.getElementById('forgotPasswordSuccess');
    errorDiv.style.display = 'none'; successDiv.style.display = 'none';
    try {
        await apiRequest('/auth/forgot-password', 'POST', { email });
        successDiv.style.display = 'block';
        setTimeout(() => {
            document.getElementById('forgotPasswordModal').classList.remove('active');
            document.getElementById('resetPasswordModal').classList.add('active');
        }, 2000);
    } catch (err) { errorDiv.textContent = err.message; errorDiv.style.display = 'block'; }
});

document.getElementById('resetPasswordClose').addEventListener('click', () => { document.getElementById('resetPasswordModal').classList.remove('active'); });
document.getElementById('resetPasswordModal').addEventListener('click', (e) => { if (e.target === e.currentTarget) document.getElementById('resetPasswordModal').classList.remove('active'); });

document.getElementById('resetPasswordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('resetEmail').value.trim();
    const code = document.getElementById('resetCode').value.trim();
    const newPassword = document.getElementById('newPassword').value.trim();
    const errorDiv = document.getElementById('resetPasswordError');
    errorDiv.style.display = 'none';
    try {
        await apiRequest('/auth/reset-password', 'POST', { email, code, newPassword });
        alert('✅ Mot de passe réinitialisé avec succès !');
        document.getElementById('resetPasswordModal').classList.remove('active');
        document.getElementById('adminLoginModal').classList.add('active');
        document.getElementById('resetPasswordForm').reset();
        document.getElementById('forgotPasswordForm').reset();
    } catch (err) { errorDiv.textContent = err.message; errorDiv.style.display = 'block'; }
});

// ============================================================
// 7. ADMIN : DASHBOARD STATISTIQUES
// ============================================================
async function renderDashboard() {
    try {
        const stats = await apiRequest('/stats');
        
        const statsHtml = `
            <div class="admin-card" style="text-align: center; border-top: 4px solid #10b981;">
                <h5 style="color: var(--gray); margin-bottom: 10px;">Chiffre d'Affaires</h5>
                <span style="font-size: 2rem; font-weight: 800; color: #065f46;">${formatPrice(stats.chiffreAffaires)}</span>
            </div>
            <div class="admin-card" style="text-align: center; border-top: 4px solid var(--secondary);">
                <h5 style="color: var(--gray); margin-bottom: 10px;">Commandes en attente</h5>
                <span style="font-size: 2rem; font-weight: 800; color: #b45309;">${stats.commandesEnAttente}</span>
            </div>
            <div class="admin-card" style="text-align: center; border-top: 4px solid #b91c1c;">
                <h5 style="color: var(--gray); margin-bottom: 10px;">Produits en rupture</h5>
                <span style="font-size: 2rem; font-weight: 800; color: #b91c1c;">${stats.produitsEnRupture.length}</span>
            </div>
        `;
        document.getElementById('dashboardStats').innerHTML = statsHtml;

        if (stats.produitsEnRupture.length === 0) {
            document.getElementById('dashboardRuptures').innerHTML = '<p style="color: green;">✅ Aucun produit en rupture de stock.</p>';
        } else {
            let html = '<ul style="list-style: none; padding: 0;">';
            stats.produitsEnRupture.forEach(p => {
                html += `<li style="padding: 8px 0; border-bottom: 1px solid rgba(0,0,0,0.05); display: flex; justify-content: space-between;">
                    <span>${p.nom}</span>
                    <span style="color: #b91c1c; font-weight: bold;">Stock: ${p.stock}</span>
                </li>`;
            });
            html += '</ul>';
            document.getElementById('dashboardRuptures').innerHTML = html;
        }

        if (stats.topProduits.length === 0) {
            document.getElementById('dashboardTopProduits').innerHTML = '<p>Aucune vente enregistrée pour le moment.</p>';
        } else {
            let html = '<ol style="padding-left: 20px;">';
            stats.topProduits.forEach(p => {
                html += `<li style="padding: 8px 0; border-bottom: 1px solid rgba(0,0,0,0.05);">
                    <strong>${p.nom}</strong> - <span style="color: var(--primary);">${p.quantite_totale} unités vendues</span>
                </li>`;
            });
            html += '</ol>';
            document.getElementById('dashboardTopProduits').innerHTML = html;
        }

    } catch (error) {
        document.getElementById('dashboardStats').innerHTML = `<p style="color:red;">Erreur chargement des stats : ${error.message}</p>`;
    }
}

// ============================================================
// 8. ADMIN : GESTION DES PRODUITS
// ============================================================
async function renderAdminProducts() {
    try {
        const products = await apiRequest('/products');
        const container = document.getElementById('productsList');
        if (products.length === 0) { container.innerHTML = '<p>Aucun produit. Ajoutez-en un !</p>'; return; }
        let html = '';
        products.forEach(p => {
            const thumb = p.media ? (p.media.startsWith('data:video') ? `<video src="${p.media}" muted style="width:50px;height:50px;object-fit:cover;border-radius:8px;"></video>` : `<img src="${p.media}" style="width:50px;height:50px;object-fit:cover;border-radius:8px;" />`) : `<div style="width:50px;height:50px;background:#e8efe4;border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--gray);font-size:1.4rem;"><i class="fas fa-seedling"></i></div>`;
            const stock = p.stock || 0;
            const stockClass = getStockClass(stock);
            html += `<div class="product-admin-item"><div class="info">${thumb}<div class="details">${p.nom} <small>${p.categorie}</small><br><span style="font-weight:400;color:var(--gray);font-size:0.85rem;">${formatPrice(p.prix)}</span><span class="stock-badge ${stockClass}">${getStockLabel(stock)}</span></div></div><div class="actions"><button class="edit-btn" data-id="${p.id}">Modifier</button><button class="delete-btn" data-id="${p.id}">Supprimer</button></div></div>`;
        });
        container.innerHTML = html;
        container.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', function() { openProductModal(parseInt(this.dataset.id)); }));
        container.querySelectorAll('.delete-btn').forEach(btn => btn.addEventListener('click', async function() {
            const id = parseInt(this.dataset.id);
            if (confirm('Supprimer ce produit ?')) {
                try { await apiRequest(`/products/${id}`, 'DELETE'); renderAdminProducts(); renderClientProducts(); }
                catch (error) { alert('Erreur : ' + error.message); }
            }
        }));
    } catch (error) { document.getElementById('productsList').innerHTML = `<p style="color:red;">Erreur : ${error.message}</p>`; }
}

function openProductModal(id = null) {
    const overlay = document.getElementById('productModalOverlay');
    const form = document.getElementById('productForm');
    const title = document.getElementById('productModalTitle');
    if (id) {
        apiRequest(`/products/${id}`, 'GET').then(product => {
            title.textContent = 'Modifier le produit';
            document.getElementById('productId').value = product.id;
            document.getElementById('pNom').value = product.nom;
            document.getElementById('pPrix').value = product.prix;
            document.getElementById('pCategorie').value = product.categorie;
            document.getElementById('pDescription').value = product.description || '';
            document.getElementById('pStock').value = product.stock || 0;
            const preview = document.getElementById('pMediaPreview');
            if (product.media) {
                preview.innerHTML = product.media.startsWith('data:video') ? `<video src="${product.media}" controls style="max-width:100%;max-height:150px;border-radius:8px;"></video>` : `<img src="${product.media}" style="max-width:100%;max-height:150px;border-radius:8px;" />`;
            } else { preview.innerHTML = ''; }
            document.getElementById('pFile').value = '';
            overlay.classList.add('active');
        }).catch(err => alert('Erreur : ' + err.message));
    } else {
        title.textContent = 'Ajouter un produit';
        form.reset();
        document.getElementById('productId').value = '';
        document.getElementById('pMediaPreview').innerHTML = '';
        document.getElementById('pStock').value = 0;
        overlay.classList.add('active');
    }
}

document.getElementById('productModalClose').addEventListener('click', () => { document.getElementById('productModalOverlay').classList.remove('active'); });
document.getElementById('productModalOverlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) document.getElementById('productModalOverlay').classList.remove('active'); });

document.getElementById('productForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const id = document.getElementById('productId').value;
    const nom = document.getElementById('pNom').value.trim();
    const prix = parseFloat(document.getElementById('pPrix').value);
    const categorie = document.getElementById('pCategorie').value;
    const description = document.getElementById('pDescription').value.trim();
    const stock = parseInt(document.getElementById('pStock').value) || 0;
    const file = document.getElementById('pFile').files[0];
    if (!nom || !prix) { alert('Nom et prix sont obligatoires.'); return; }
    let mediaData = null;
    if (file) { mediaData = await new Promise((resolve) => { const reader = new FileReader(); reader.onload = (e) => resolve(e.target.result); reader.readAsDataURL(file); }); }
    const productData = { nom, prix, categorie, description, stock };
    if (mediaData) productData.media = mediaData;
    try {
        if (id) { await apiRequest(`/products/${id}`, 'PUT', productData); }
        else { await apiRequest('/products', 'POST', productData); }
        renderAdminProducts(); renderClientProducts();
        document.getElementById('productModalOverlay').classList.remove('active');
    } catch (error) { alert('Erreur : ' + error.message); }
});

document.getElementById('addProductBtn').addEventListener('click', () => openProductModal());

// ============================================================
// 9. ADMIN : GESTION DES ADMINISTRATEURS
// ============================================================
async function renderAdmins() {
    try {
        const admins = await apiRequest('/admins');
        const container = document.getElementById('adminsList');
        if (admins.length === 0) { container.innerHTML = '<p>Aucun administrateur.</p>'; return; }
        let html = '';
        admins.forEach(a => {
            const roleClass = a.role === 'superadmin' ? 'superadmin' : '';
            html += `<div class="admin-item"><div class="info">${a.nom} <small>${a.email}</small><span class="role-badge ${roleClass}">${a.role}</span></div><div class="actions"><button class="edit-btn" data-id="${a.id}">Modifier</button><button class="delete-btn" data-id="${a.id}">Supprimer</button></div></div>`;
        });
        container.innerHTML = html;
        container.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', function() { openAdminModal(parseInt(this.dataset.id)); }));
        container.querySelectorAll('.delete-btn').forEach(btn => btn.addEventListener('click', async function() {
            const id = parseInt(this.dataset.id);
            if (confirm('Supprimer cet administrateur ?')) {
                try { await apiRequest(`/admins/${id}`, 'DELETE'); renderAdmins(); }
                catch (error) { alert('Erreur : ' + error.message); }
            }
        }));
    } catch (error) { document.getElementById('adminsList').innerHTML = `<p style="color:red;">Erreur : ${error.message}</p>`; }
}

function openAdminModal(id = null) {
    const overlay = document.getElementById('adminModalOverlay');
    const form = document.getElementById('adminForm');
    const title = document.getElementById('adminModalTitle');
    if (id) {
        apiRequest('/admins').then(admins => {
            const admin = admins.find(a => a.id === id);
            if (!admin) return;
            title.textContent = 'Modifier un administrateur';
            document.getElementById('adminId').value = admin.id;
            document.getElementById('aNom').value = admin.nom;
            document.getElementById('aEmail').value = admin.email;
            document.getElementById('aPassword').value = '';
            document.getElementById('aRole').value = admin.role;
            overlay.classList.add('active');
        }).catch(err => alert('Erreur : ' + err.message));
    } else {
        title.textContent = 'Ajouter un administrateur';
        form.reset();
        document.getElementById('adminId').value = '';
        overlay.classList.add('active');
    }
}

document.getElementById('adminModalClose').addEventListener('click', () => { document.getElementById('adminModalOverlay').classList.remove('active'); });
document.getElementById('adminModalOverlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) document.getElementById('adminModalOverlay').classList.remove('active'); });

document.getElementById('adminForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const id = document.getElementById('adminId').value;
    const nom = document.getElementById('aNom').value.trim();
    const email = document.getElementById('aEmail').value.trim();
    const password = document.getElementById('aPassword').value.trim();
    const role = document.getElementById('aRole').value;
    if (!nom || !email) { alert('Nom et email sont obligatoires.'); return; }
    const adminData = { nom, email, role };
    if (password) adminData.password = password;
    try {
        if (id) { await apiRequest(`/admins/${id}`, 'PUT', adminData); }
        else { if (!password) { alert('Le mot de passe est requis pour un nouvel admin.'); return; } await apiRequest('/admins', 'POST', adminData); }
        renderAdmins();
        document.getElementById('adminModalOverlay').classList.remove('active');
    } catch (error) { alert('Erreur : ' + error.message); }
});

document.getElementById('addAdminBtn').addEventListener('click', () => openAdminModal());

// ============================================================
// 10. ADMIN : COMMANDES (AVEC LIEN PDF)
// ============================================================
async function renderOrders() {
    try {
        const orders = await apiRequest('/orders');
        const container = document.getElementById('ordersList');
        if (orders.length === 0) { container.innerHTML = '<p>Aucune commande.</p>'; return; }
        
        let html = `<table class="admin-table"><thead><tr><th>#</th><th>Client</th><th>Téléphone</th><th>Total</th><th>Paiement</th><th>Statut</th><th>Actions</th><th>Facture</th></tr></thead><tbody>`;
        
        orders.forEach(order => {
            const statusClass = 'status-' + order.status.replace(' ', '-');
            const paymentLabels = { mobile_money: 'Mobile Money', carte_bancaire: 'Carte bancaire', especes: 'Espèces' };
            const paymentClass = 'payment-' + (order.payment || 'especes');
            const paymentLabel = paymentLabels[order.payment] || 'Non spécifié';
            const promoText = order.promo_code ? ` <br><small style="color:green;">Code: ${order.promo_code}</small>` : '';
            const pdfLink = `<a href="/factures/facture_${order.id}.pdf" target="_blank" class="btn btn-sm" style="background:#fee2e2;color:#b91c1c; text-decoration:none; display:inline-flex; align-items:center; gap:5px;"><i class="fas fa-file-pdf"></i> PDF</a>`;

            html += `
                <tr>
                    <td>${order.id}</td>
                    <td>${order.clientName}</td>
                    <td>${order.phone}</td>
                    <td>${formatPrice(order.total)}${promoText}</td>
                    <td><span class="payment-badge ${paymentClass}">${paymentLabel}</span></td>
                    <td><span class="status-badge ${statusClass}">${order.status}</span></td>
                    <td class="admin-actions">
                        <button class="btn-sm btn-secondary" data-id="${order.id}" data-status="en attente">En attente</button>
                        <button class="btn-sm" style="background:#dbeafe;color:#1e40af;" data-id="${order.id}" data-status="confirmée">Confirmée</button>
                        <button class="btn-sm" style="background:#d1fae5;color:#065f46;" data-id="${order.id}" data-status="livrée">Livrée</button>
                        <button class="btn-sm btn-danger" data-id="${order.id}" data-status="delete">Supprimer</button>
                    </td>
                    <td>${pdfLink}</td>
                </tr>`;
        });
        html += '</tbody></table>';
        container.innerHTML = html;

        container.querySelectorAll('.admin-actions button').forEach(btn => {
            btn.addEventListener('click', async function() {
                const id = parseInt(this.dataset.id);
                const status = this.dataset.status;
                if (status === 'delete') {
                    if (confirm('Supprimer cette commande ?')) {
                        try { await apiRequest(`/orders/${id}`, 'DELETE'); renderOrders(); } catch (error) { alert('Erreur : ' + error.message); }
                    }
                    return;
                }
                try { await apiRequest(`/orders/${id}`, 'PUT', { status }); renderOrders(); } catch (error) { alert('Erreur : ' + error.message); }
            });
        });
    } catch (error) { document.getElementById('ordersList').innerHTML = `<p style="color:red;">Erreur : ${error.message}</p>`; }
}

// ============================================================
// 11. ADMIN : CLIENTS
// ============================================================
async function renderCustomers() {
    try {
        const customers = await apiRequest('/customers');
        const container = document.getElementById('customersList');
        if (customers.length === 0) { container.innerHTML = '<p>Aucun client.</p>'; return; }
        let html = '';
        customers.forEach(c => { html += `<div class="customer-item"><div class="info">${c.name} <small>${c.phone}</small></div><div class="points">${c.points} pts</div></div>`; });
        container.innerHTML = html;
    } catch (error) { document.getElementById('customersList').innerHTML = `<p style="color:red;">Erreur : ${error.message}</p>`; }
}

document.getElementById('addCustomerBtn').addEventListener('click', async () => {
    const name = document.getElementById('newCustomerName').value.trim();
    const phone = document.getElementById('newCustomerPhone').value.trim();
    if (!name || !phone) { alert('Veuillez remplir les deux champs.'); return; }
    try {
        await apiRequest('/customers', 'POST', { name, phone });
        renderCustomers();
        document.getElementById('newCustomerName').value = '';
        document.getElementById('newCustomerPhone').value = '';
        alert('Client ajouté.');
    } catch (error) { alert('Erreur : ' + error.message); }
});

// ============================================================
// 12. ADMIN : ONGLETS
// ============================================================
document.querySelectorAll('.admin-tabs button[data-tab]').forEach(tab => {
    tab.addEventListener('click', function() {
        document.querySelectorAll('.admin-tabs button[data-tab]').forEach(t => t.classList.remove('active'));
        this.classList.add('active');
        const target = this.dataset.tab;
        document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
        document.getElementById('panel' + target.charAt(0).toUpperCase() + target.slice(1)).classList.add('active');
        
        if (target === 'dashboard') renderDashboard();
        else if (target === 'products') renderAdminProducts();
        else if (target === 'orders') renderOrders();
        else if (target === 'customers') renderCustomers();
        else if (target === 'admins') renderAdmins();
    });
});

// ============================================================
// 13. CART SIDEBAR & EVENTS
// ============================================================
document.getElementById('cartToggle').addEventListener('click', (e) => {
    e.preventDefault();
    if (document.getElementById('cartSidebar').classList.contains('open')) { closeCart(); } else { openCart(); }
});
document.getElementById('cartClose').addEventListener('click', closeCart);
document.getElementById('cartOverlay').addEventListener('click', closeCart);

function openCart() {
    document.getElementById('cartSidebar').classList.add('open');
    document.getElementById('cartOverlay').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeCart() {
    document.getElementById('cartSidebar').classList.remove('open');
    document.getElementById('cartOverlay').classList.remove('active');
    document.body.style.overflow = '';
}

const toggle = document.getElementById('mobileToggle');
const nav = document.getElementById('mainNav');
toggle.addEventListener('click', () => {
    nav.classList.toggle('open');
    toggle.querySelector('i').classList.toggle('fa-bars');
    toggle.querySelector('i').classList.toggle('fa-times');
});
nav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
        nav.classList.remove('open');
        const icon = toggle.querySelector('i');
        icon.classList.add('fa-bars');
        icon.classList.remove('fa-times');
    });
});

window.addEventListener('scroll', () => {
    document.getElementById('header').classList.toggle('scrolled', window.scrollY > 20);
});

document.getElementById('contactForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Envoi...';
    btn.disabled = true;
    setTimeout(() => {
        btn.innerHTML = '<i class="fas fa-check"></i> Message envoyé !';
        btn.style.background = '#2e7d32';
        setTimeout(() => { btn.innerHTML = orig; btn.style.background = ''; btn.disabled = false; e.target.reset(); }, 2500);
    }, 1500);
});

// ============================================================
// 14. INITIALISATION
// ============================================================
(async function init() {
    await loadDeliveryZones(); // Charger les zones de livraison
    checkSession();
    await renderClientProducts();
    renderCartItems();
    updateCartUI();
    console.log('✅ ADA AGRO-BUSINESS connecté à l\'API');
})();