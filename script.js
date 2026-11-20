const API = "http://localhost:3000";
let products = [];
;
const SIZES = ["S", "M", "L", "XL"];


let cart = JSON.parse(localStorage.getItem("cart")) || []; // [{id, size, qty}]
const selectedSizes = {};                                  // talla elegida por producto

const $ = (id) => document.getElementById(id);
const grid = $("productsGrid"), cartEl = $("cart"), overlay = $("overlay");

const money = (n) => "$" + n.toLocaleString("es-CO");


function renderProducts() {
  grid.innerHTML = products.map(p => `
    <article class="card">
      <img class="card__img" src="${p.img}" alt="${p.name}" loading="lazy">
      <div class="card__body">
        <h3 class="card__name">${p.name}</h3>
        <p class="card__price">${money(p.price)}</p>
        <div class="sizes" data-id="${p.id}">
          ${SIZES.map(s => `<button class="size" data-size="${s}">${s}</button>`).join("")}
        </div>
        <button class="btn btn--primary add-btn" data-id="${p.id}">Añadir al carrito</button>
      </div>
    </article>`).join("");
}


grid.addEventListener("click", (e) => {
  
  if (e.target.classList.contains("size")) {
    const box = e.target.parentElement;
    box.querySelectorAll(".size").forEach(b => b.classList.remove("active"));
    e.target.classList.add("active");
    selectedSizes[box.dataset.id] = e.target.dataset.size;
  }
  
  if (e.target.classList.contains("add-btn")) {
    const id = Number(e.target.dataset.id);
    const size = selectedSizes[id];
    if (!size) return alert("Por favor selecciona una talla.");
    addToCart(id, size);
  }
});


function addToCart(id, size) {
  const item = cart.find(i => i.id === id && i.size === size);
  item ? item.qty++ : cart.push({ id, size, qty: 1 });
  updateCart();
  openCart();
}

function changeQty(id, size, delta) {
  const item = cart.find(i => i.id === id && i.size === size);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) cart = cart.filter(i => i !== item);
  updateCart();
}

function removeItem(id, size) {
  cart = cart.filter(i => !(i.id === id && i.size === size));
  updateCart();
}

function updateCart() {
  localStorage.setItem("cart", JSON.stringify(cart));
  const box = $("cartItems");
  let total = 0, count = 0;

  if (cart.length === 0) {
    box.innerHTML = `<p class="cart__empty">Tu carrito está vacío 🛒</p>`;
  } else {
    box.innerHTML = cart.map(i => {
      const p = products.find(x => x.id === i.id);
      total += p.price * i.qty;
      count += i.qty;
      return `
        <div class="cart-item">
          <img src="${p.img}" alt="${p.name}">
          <div class="cart-item__info">
            <strong>${p.name}</strong><br>
            <small>Talla ${i.size} · ${money(p.price)}</small>
            <div class="qty">
              <button data-act="minus" data-id="${i.id}" data-size="${i.size}">−</button>
              <span>${i.qty}</span>
              <button data-act="plus" data-id="${i.id}" data-size="${i.size}">+</button>
            </div>
          </div>
          <button class="cart-item__remove" data-act="remove" data-id="${i.id}" data-size="${i.size}">🗑</button>
        </div>`;
    }).join("");
  }
  $("cartTotal").textContent = money(total);
  $("cartCount").textContent = count;
}


$("cartItems").addEventListener("click", (e) => {
  const { act, id, size } = e.target.dataset;
  if (!act) return;
  if (act === "plus") changeQty(Number(id), size, 1);
  if (act === "minus") changeQty(Number(id), size, -1);
  if (act === "remove") removeItem(Number(id), size);
});


const openCart = () => { cartEl.classList.add("open"); overlay.classList.add("show"); };
const closeCart = () => { cartEl.classList.remove("open"); overlay.classList.remove("show"); };
$("cartBtn").addEventListener("click", openCart);
$("cartClose").addEventListener("click", closeCart);
overlay.addEventListener("click", closeCart);

$("clearBtn").addEventListener("click", () => { cart = []; updateCart(); });
$("checkoutBtn").addEventListener("click", async () => {
  if (cart.length === 0) return alert("Tu carrito está vacío.");

  const nombre    = prompt("Nombre completo:");
  const email     = prompt("Correo electrónico:");
  const telefono  = prompt("Teléfono:");
  const direccion = prompt("Dirección de envío:");
  const ciudad    = prompt("Ciudad:");
  const metodo    = prompt("Método de pago (visa, mastercard, pse, nequi):");

  if (!nombre || !email || !direccion || !metodo) {
    return alert("Faltan datos para el pedido.");
  }

  try {
    const res = await fetch(`${API}/api/pedidos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cliente: {
          nombre,
          email,
          telefono,
          direccion,
          ciudad
        },
        metodo_pago: metodo.toLowerCase().trim(),
        items: cart
      })
    });

    const data = await res.json();

    if (!res.ok) {
      return alert(data.error || "No se pudo crear el pedido.");
    }

    cart = [];
    updateCart();
    closeCart();

    alert(
      `¡Gracias por tu compra! Pedido #${data.pedido_id}\nTotal: ${money(data.total)}`
    );

  } catch {
    alert("No se pudo conectar con el servidor.");
  }
});



$("menuBtn").addEventListener("click", () => $("nav").classList.toggle("open"));
$("nav").addEventListener("click", () => $("nav").classList.remove("open"));

async function loadProducts() {
  try {
    const res = await fetch(`${API}/api/productos`);
    const data = await res.json();
    products = data.map(p => ({
      id: p.id,
      name: p.nombre,
      price: Number(p.precio_oferta ?? p.precio),
      img: p.imagen_url
    }));
    renderProducts();
    updateCart();
  } catch {
    grid.innerHTML = "<p>No se pudo cargar el catálogo. Intenta más tarde.</p>";
  }
}

loadProducts();