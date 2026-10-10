const express = require('express');
const cors = require('cors');
const path = require('path');
const mysql = require('mysql2/promise');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Database connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'broken_hill_lms',
  port: process.env.DB_PORT || 3306,
  ssl: process.env.DB_HOST && process.env.DB_HOST.includes('azure') ? { rejectUnauthorized: false } : false,
  waitForConnections: true,
  connectionLimit: 10
});

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../frontend')));

// ---------- API: All rooms ----------
app.get('/api/rooms', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT r.room_id, r.room_number, r.status,
             rc.name AS category, rc.base_price
      FROM rooms r
      JOIN room_categories rc ON rc.category_id = r.category_id
      ORDER BY r.room_number
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- API: Dashboard summary ----------
app.get('/api/rooms/summary', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        SUM(status='clean')      AS clean_rooms,
        SUM(status='dirty')      AS dirty_rooms,
        SUM(status='occupied')   AS occupied_rooms,
        SUM(status='maintenance') AS maintenance_rooms,
        COUNT(*)                 AS total_rooms,
        ROUND(SUM(status='occupied')/COUNT(*)*100, 1) AS occupancy_pct
      FROM rooms
    `);
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- API: Update room status ----------
app.put('/api/rooms/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    await pool.query('UPDATE rooms SET status = ? WHERE room_id = ?', [status, id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- API: Invoices ----------
app.get('/api/invoices', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT i.invoice_number AS id,
             CONCAT(g.first_name, ' ', g.last_name) AS guest,
             r.room_number AS room,
             i.total AS amount,
             i.tax,
             i.status
      FROM invoices i
      JOIN guests g   ON g.guest_id = i.guest_id
      JOIN bookings b ON b.booking_id = i.booking_id
      LEFT JOIN rooms r ON r.room_id = b.room_id
      ORDER BY i.issued_at DESC
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- API: Requirements ----------
app.get('/api/requirements', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM requirements ORDER BY req_code');
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- API: Today's arrivals & departures ----------
app.get('/api/bookings/today', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT CONCAT(g.first_name, ' ', g.last_name) AS guest,
             r.room_number AS room,
             b.status,
             CASE
               WHEN b.check_in_date  = CURDATE() THEN 'ARRIVAL'
               WHEN b.check_out_date = CURDATE() THEN 'DEPARTURE'
             END AS movement
      FROM bookings b
      JOIN guests g ON g.guest_id = b.guest_id
      LEFT JOIN rooms r ON r.room_id = b.room_id
      WHERE CURDATE() IN (b.check_in_date, b.check_out_date)
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- Catch-all → serve the frontend ----------
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.listen(PORT, () => {
  console.log('BHL-LMS running on port ' + PORT);
});
