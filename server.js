// --- Patch fetch + Headers for Node.js 16 (needed for googleapis) ---
(async () => {
  const fetchModule = await import("node-fetch");
  const fetch = fetchModule.default;
  const { Headers, Request, Response } = fetchModule;

  globalThis.fetch = fetch;
  globalThis.Headers = Headers;
  globalThis.Request = Request;
  globalThis.Response = Response;
})();

// --- Dependencies ---
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const path = require('path');
const morgan = require('morgan');
const winston = require('winston');
const { google } = require('googleapis');

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

// --- App setup ---
const app = express();

// --- Logger ---
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'project.log' })
  ]
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
  created_at: {
    type: Date,
    default: () => new Date(new Date().toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' }))
  }
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
transporter.verify(err => err ? logger.error('SMTP Error:', err) : logger.info('SMTP ready'));

// --- Google Sheets setup ---
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
let sheets = null;

if (process.env.GOOGLE_CREDENTIALS) {
  try {
    const creds = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    creds.private_key = creds.private_key.replace(/\\n/g, '\n');
    const auth = new google.auth.GoogleAuth({ credentials: creds, scopes: SCOPES });
    sheets = google.sheets({ version: 'v4', auth });
    logger.info('Google Sheets API initialized');
  } catch (err) { logger.error('GOOGLE_CREDENTIALS error:', err); }
}

// --- Helpers ---
function formatSA(date) {
  return new Date(date).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' });
}

function formatOrderEmail(order) {
  return `
    <div style="font-family: Arial, sans-serif; color: #333;">
      <h2 style="color: #2e7d32;">New Order Received</h2>
      <table style="width:100%; border-collapse: collapse;">
        <tr><td><b>Customer Name</b></td><td>${order.name}</td></tr>
        <tr><td><b>Sender Number</b></td><td>${order.sender_number}</td></tr>
        <tr><td><b>Receiver Name</b></td><td>${order.receiver_name}</td></tr>
        <tr><td><b>Receiver Number</b></td><td>${order.receiver_number}</td></tr>
        <tr><td><b>Pep Code</b></td><td>${order.pep_code || 'N/A'}</td></tr>
        <tr><td><b>Order ID</b></td><td>${order._id}</td></tr>
        <tr><td><b>Created At</b></td><td>${formatSA(order.created_at)}</td></tr>
      </table>
      <h3>Products Ordered:</h3>
      <table style="width:100%; border-collapse: collapse;">
        <tr style="background:#f1f8e9;">
          <th>Product</th><th>Category</th><th>Quantity</th>
        </tr>
        ${order.products.map(p => `<tr><td>${p.name}</td><td>${p.category}</td><td>${p.quantity}</td></tr>`).join('')}
      </table>
    </div>
  `;
}

// --- Append order + update product summary ---
async function appendOrderToSheet(order) {
  if (!sheets) return;
  try {
    // Append individual order
    const orderValues = [[
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
      range: 'Orders!A:H',
      valueInputOption: 'RAW',
      requestBody: { values: orderValues }
    });
    logger.info('Order appended', { orderId: order._id });

    // Update product summary
    const totals = await Order.aggregate([
      { $unwind: "$products" },
      { $group: { _id: "$products.name", totalQuantity: { $sum: "$products.quantity" }, itemsSold: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    const summaryValues = [["Product Name","Quantity Ordered","Items Sold"], ...totals.map(p => [p._id, p.totalQuantity, p.itemsSold])];
    await sheets.spreadsheets.values.update({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: "ProductsSummary!A1:C",
      valueInputOption: "RAW",
      requestBody: { values: summaryValues }
    });
    logger.info('Product summary updated');
  } catch (err) { logger.error('Google Sheets error:', err); }
}

// --- Routes ---
app.get('/status', (req, res) => res.json({ uptime: process.uptime(), environment: process.env.NODE_ENV || 'development', googleSheets: !!sheets }));

app.post('/submit', async (req, res) => {
  try {
    const { name, sender_number, receiver_name, receiver_number, pep_code, products } = req.body;
    if (!name || !sender_number || !receiver_name || !receiver_number || !Array.isArray(products) || products.length === 0)
      return res.status(400).json({ success: false, message: 'Missing required fields or products.' });

    const productList = products.map(p => {
      const productName = p.split(' (x')[0];
      const quantity = parseInt(p.match(/\(x(\d+)\)/)?.[1] || '1', 10);
      return { name: productName, quantity, category: productCategories[productName] || 'Unknown' };
    });

    const savedOrder = await new Order({ name, sender_number, receiver_name, receiver_number, pep_code: pep_code || '', products: productList }).save();

    appendOrderToSheet(savedOrder);

    transporter.sendMail({
      from: `"Order System" <${process.env.SMTP_USER}>`,
      to: COMPANY_EMAIL,
      subject: `New Order #${savedOrder._id}`,
      html: formatOrderEmail(savedOrder)
    }).then(() => logger.info('Email sent', { orderId: savedOrder._id }))
      .catch(err => logger.error('Email error:', err));

    res.json({ success: true, message: 'Order processed successfully.', orderId: savedOrder._id });
  } catch (err) { logger.error('Submit error:', err); res.status(500).json({ success: false, message: err.message }); }
});

app.get('/health', (req, res) => res.json({ status: 'OK', environment: process.env.NODE_ENV || 'development', mongo: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected', googleSheets: !!sheets }));

// --- Start server ---
app.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  logger.info(`Google Sheets API: ${sheets ? 'ENABLED' : 'DISABLED'}`);
});
