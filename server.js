require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const path = require('path');
const morgan = require('morgan');
const winston = require('winston');
const { google } = require('googleapis');
const fs = require('fs');

// --- Product → Category mapping ---
const productCategories = {
  "DONSA": "Ezasekamelweni",
  "MAPHIPHA": "Ezasekamelweni",
  "MIXER FOR MAN": "Ezasekamelweni",
  "MV": "Ezasekamelweni",
  "RS": "Ezasekamelweni",
  "MD": "Ezasekamelweni",
  "NHLONIPHO": "Ezasekamelweni",
  "NHLONIPHO WENKANI": "Ezasekamelweni",
  "DLISO LANGAPHANSI": "Ezasekamelweni",
  "SCOBECOBE": "Ezasekamelweni",
  "DUMBA": "Ezasekamelweni",
  "FRANK": "Ezasekamelweni",
  "NSIZI MVUSA": "Ezasekamelweni",
  "MASHESHISA": "Ezasekamelweni",
  "MACHAMISA": "Ezasekamelweni",
  "MAHLANYISA": "Ezasekamelweni",
  "MSHUBO": "Ezasekamelweni",
  "ASTHMA & DLISO": "Ezempilo",
  "MBIZA EMHLOPHE": "Ezempilo",
  "SKHONDLA KHONDLA": "Ezempilo",
  "JIKELELE": "Ezempilo",
  "BP & SUGER": "Ezempilo",
  "STAPUTAPU": "Ezempilo",
  "SLODWANA": "Ezempilo",
  "SHAYIZIFO IMBIZA": "Ezempilo",
  "NSIZI SHAYIZIFO": "Ezempilo",
  "NSIZI STROKE": "Ezempilo",
  "NO 1 MBIZA": "Ezempilo",
  "MHLABELO": "Ezempilo",
  "MBIZA EMHLOPHE (ISIWASHO)": "Ezempilo",
  "GUDUZA": "Ezempilo",
  "COMBO YAMA PILES": "Ezempilo",
  "KHIPHA IDLISO POWDER": "Ezempilo",
  "MOYI MOYI": "Ezokuthandeka",
  "IBHODLELA": "Ezokuthandeka",
  "SHUKELA": "Ezokuthandeka",
  "GANDA GANDA": "Ezokuthandeka",
  "UHLANGA": "Ezokuthandeka",
  "KHIYE": "Ezokuthandeka",
  "SHINGAMU": "Ezokuthandeka",
  "INYAMAZANE": "Ezokuthandeka",
  "INTELEZI": "Ezokuthandeka",
  "NDLEBEZIKHAYA ILANGA": "Ezokuthandeka",
  "COMBO YAMATHUNZI (UBHAVU)": "Ezokuthandeka",
  "XABANISA": "Ezokuthandeka",
  "SKHAFULO": "Ezokuthandeka"
};

// --- Create app ---
const app = express();

// --- Logger setup ---
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'project.log' })
  ],
});

// --- Middleware ---
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(morgan('dev'));

// --- Env variables ---
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const COMPANY_EMAIL = process.env.COMPANY_EMAIL;
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;

// --- MongoDB connection ---
mongoose.connect(MONGO_URI)
  .then(() => logger.info('MongoDB connected'))
  .catch(err => {
    logger.error('MongoDB connection error:', err);
    process.exit(1);
  });

// --- Schema & Model ---
const orderSchema = new mongoose.Schema({
  name: { type: String, required: true },
  sender_number: { type: String, required: true },
  receiver_name: { type: String, required: true },
  receiver_number: { type: String, required: true },
  pep_code: String,
  products: [{
    name: String,
    quantity: Number,
    category: String
  }],
  created_at: { type: Date, default: () => new Date(new Date().toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })) }
});
const Order = mongoose.model('Order', orderSchema);

// --- Nodemailer setup ---
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: false,
  requireTLS: true,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  tls: { rejectUnauthorized: false }
});
transporter.verify(err => {
  if (err) logger.error('SMTP Connection Error:', err);
  else logger.info('SMTP Server ready');
});

// --- Google Sheets setup ---
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
let sheets = null;
try {
  if (process.env.GOOGLE_CREDENTIALS) {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    const auth = new google.auth.GoogleAuth({ credentials, scopes: SCOPES });
    sheets = google.sheets({ version: 'v4', auth });
    logger.info('Google Sheets API ready');
  } else {
    logger.warn('GOOGLE_CREDENTIALS not set - Sheets disabled');
  }
} catch (err) {
  logger.error('Failed to initialize Google Sheets:', err.message);
}

// --- Helpers ---
const formatSA = date => new Date(date).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' });

const formatOrderEmail = order => `
  <div style="font-family: Arial; color:#333">
    <h2 style="color:#2e7d32">New Order Received</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      <tr><td><b>Customer Name</b></td><td>${order.name}</td></tr>
      <tr><td><b>Sender Number</b></td><td>${order.sender_number}</td></tr>
      <tr><td><b>Receiver Name</b></td><td>${order.receiver_name}</td></tr>
      <tr><td><b>Receiver Number</b></td><td>${order.receiver_number}</td></tr>
      <tr><td><b>Pep Code</b></td><td>${order.pep_code || 'N/A'}</td></tr>
      <tr><td><b>Order ID</b></td><td>${order._id}</td></tr>
      <tr><td><b>Created At</b></td><td>${formatSA(order.created_at)}</td></tr>
    </table>
    <h3 style="color:#2e7d32">Products Ordered:</h3>
    <table style="width:100%;border-collapse:collapse;">
      <tr style="background:#f1f8e9;"><th>Product</th><th>Category</th><th>Quantity</th></tr>
      ${order.products.map(p => `<tr><td>${p.name}</td><td>${p.category}</td><td>${p.quantity}</td></tr>`).join('')}
    </table>
  </div>
`;

// --- Append order to Google Sheet ---
async function appendOrderToSheet(order) {
  if (!sheets) return false;

  try {
    const values = [[
      order._id.toString(),
      order.name,
      order.sender_number,
      order.receiver_name,
      order.receiver_number,
      order.pep_code || '',
      order.products.map(p => `${p.name} (x${p.quantity})`).join(', '),
      formatSA(order.created_at)
    ]];

    await sheets.spreadsheets.values.append({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: 'Sheet1!A:H',
      valueInputOption: 'RAW',
      resource: { values }
    });
    logger.info('Order appended to Google Sheet', { orderId: order._id });
    return true;
  } catch (err) {
    logger.error('Failed to append order to sheet:', err.message);
    return false;
  }
}

// --- Routes ---
app.get('/status', (req, res) => res.json({ uptime: process.uptime(), message: 'OK', environment: process.env.NODE_ENV || 'development', googleSheets: !!sheets }));

app.post('/submit', async (req, res) => {
  try {
    const { name, sender_number, receiver_name, receiver_number, pep_code, products } = req.body;
    if (!name || !sender_number || !receiver_name || !receiver_number || !Array.isArray(products) || !products.length)
      return res.status(400).json({ success: false, message: 'Missing required fields or products' });

    const productList = products.map(p => {
      const productName = p.split(' (x')[0];
      const quantity = parseInt(p.match(/\(x(\d+)\)/)?.[1] || '1', 10);
      return { name: productName, quantity, category: productCategories[productName] || 'Unknown' };
    });

    const savedOrder = await new Order({ name, sender_number, receiver_name, receiver_number, pep_code: pep_code || '', products: productList }).save();

    // Google Sheets (non-critical)
    await appendOrderToSheet(savedOrder);

    // Email (non-critical)
    try {
      await transporter.sendMail({ from: `"Order System" <${process.env.SMTP_USER}>`, to: COMPANY_EMAIL, subject: `New Order #${savedOrder._id}`, html: formatOrderEmail(savedOrder) });
      logger.info('Email sent', { orderId: savedOrder._id });
    } catch (err) { logger.error('Email send failed:', err.message); }

    res.json({ success: true, message: 'Order processed', orderId: savedOrder._id, googleSheetsUpdated: !!sheets });
  } catch (err) {
    logger.error('Submit error:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// --- Health check ---
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    googleSheets: !!sheets,
    mongo: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// --- Start server ---
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  logger.info(`Google Sheets: ${sheets ? 'ENABLED' : 'DISABLED'}`);
});
