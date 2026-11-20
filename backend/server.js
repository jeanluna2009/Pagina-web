require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

const ENVIO_GRATIS_DESDE = 150000;  // tu regla: envío gratis desde $150.000
const COSTO_ENVIO = 12000;          // ajusta al costo real de tu envío
const METODOS = ['visa', 'mastercard', 'pse', 'nequi'];
const TALLAS = ['S', 'M', 'L', 'XL'];

class ErrorPublico extends Error {
  constructor(mensaje, status = 400) { super(mensaje); this.status = status; }
}


app.get('/api/productos', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT p.id, p.nombre, p.precio, p.precio_oferta, p.imagen_url,
             json_agg(json_build_object('talla', t.talla, 'stock', t.stock)
                      ORDER BY t.talla) AS tallas
      FROM productos p
      JOIN producto_tallas t ON t.producto_id = p.id
      WHERE p.activo = TRUE
      GROUP BY p.id
      ORDER BY p.id
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener los productos' });
  }
});


app.post('/api/pedidos', async (req, res) => {
  const { cliente, metodo_pago, items } = req.body;

  if (!cliente?.nombre || !cliente?.email || !cliente?.direccion)
    return res.status(400).json({ error: 'Faltan datos del cliente' });
  if (!METODOS.includes(metodo_pago))
    return res.status(400).json({ error: 'Método de pago no válido' });
  if (!Array.isArray(items) || items.length === 0)
    return res.status(400).json({ error: 'El carrito está vacío' });

  const db = await pool.connect();
  try {
    await db.query('BEGIN');

    
    const { rows: [cli] } = await db.query(
      `INSERT INTO clientes (nombre, email, telefono, direccion, ciudad)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE
         SET nombre = EXCLUDED.nombre, telefono = EXCLUDED.telefono,
             direccion = EXCLUDED.direccion, ciudad = EXCLUDED.ciudad
       RETURNING id`,
      [cliente.nombre, cliente.email, cliente.telefono || null,
       cliente.direccion, cliente.ciudad || null]
    );

    
    let subtotal = 0;
    const lineas = [];
    for (const it of items) {
      const id = Number(it.id);
      const qty = Number(it.qty);
      if (!Number.isInteger(id) || !Number.isInteger(qty) || qty <= 0 || !TALLAS.includes(it.size))
        throw new ErrorPublico('Producto del carrito no válido');

      const { rows } = await db.query(
        `SELECT p.nombre, COALESCE(p.precio_oferta, p.precio) AS precio, t.stock
         FROM productos p
         JOIN producto_tallas t ON t.producto_id = p.id
         WHERE p.id = $1 AND t.talla = $2 AND p.activo = TRUE
         FOR UPDATE OF t`,
        [id, it.size]
      );
      if (rows.length === 0) throw new ErrorPublico('Producto no disponible');
      if (rows[0].stock < qty)
        throw new ErrorPublico(`Sin stock suficiente de ${rows[0].nombre} talla ${it.size}`);

      await db.query(
        'UPDATE producto_tallas SET stock = stock - $1 WHERE producto_id = $2 AND talla = $3',
        [qty, id, it.size]
      );
      const precio = Number(rows[0].precio);
      subtotal += precio * qty;
      lineas.push({ id, talla: it.size, qty, precio });
    }

    
    const costoEnvio = subtotal >= ENVIO_GRATIS_DESDE ? 0 : COSTO_ENVIO;
    const total = subtotal + costoEnvio;

    
    const { rows: [pedido] } = await db.query(
      `INSERT INTO pedidos (cliente_id, subtotal, costo_envio, total, metodo_pago)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [cli.id, subtotal, costoEnvio, total, metodo_pago]
    );
    for (const l of lineas) {
      await db.query(
        `INSERT INTO pedido_items (pedido_id, producto_id, talla, cantidad, precio_unitario)
         VALUES ($1, $2, $3, $4, $5)`,
        [pedido.id, l.id, l.talla, l.qty, l.precio]
      );
    }

    await db.query('COMMIT');
    res.status(201).json({ pedido_id: pedido.id, subtotal, costo_envio: costoEnvio, total });
  } catch (err) {
    await db.query('ROLLBACK');
    if (err instanceof ErrorPublico) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'No se pudo crear el pedido' });
  } finally {
    db.release();
  }
});

app.listen(3000, () => console.log('API lista en http://localhost:3000'));