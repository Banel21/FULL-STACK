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
  // Ezasekamelweni
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

  // Ezempilo
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

  // Ezokuthandeka
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

// --- Connect to MongoDB ---
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
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  },
  tls: { rejectUnauthorized: false }
});
transporter.verify(err => {
  if (err) logger.error('SMTP Connection Error:', err);
  else logger.info('SMTP Server ready to send emails');
});

// --- Google Sheets setup ---
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// FIXED: Use environment variable in production, local file in development
let credentials;
if (process.env.NODE_ENV === 'production') {
  // Parse the JSON string from the environment variable
  credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
} else {
  // Use the local file for development
  credentials = JSON.parse(fs.readFileSync('credentials.json'));
}
const auth = new google.auth.GoogleAuth({ credentials, scopes: SCOPES });
const sheets = google.sheets({ version: 'v4', auth });

// --- Helpers ---
function formatSA(date) {
  return new Date(date).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' });
}

function formatOrderEmail(order) {
  return `
    <div style="font-family: Arial, sans-serif; color: #333;">
      <h2 style="color: #2e7d32;">New Order Received</h2>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <tr><td><b>Customer Name</b></td><td>${order.name}</td></tr>
        <tr><td><b>Sender Number</b></td><td>${order.sender_number}</td></tr>
        <tr><td><b>Receiver Name</b></td><td>${order.receiver_name}</td></tr>
        <tr><td><b>Receiver Number</b></td><td>${order.receiver_number}</td></tr>
        <tr><td><b>Pep Code</b></td><td>${order.pep_code || 'N/A'}</td></tr>
        <tr><td><b>Order ID</b></td><td>${order._id}</td></tr>
        <tr><td><b>Created At</b></td><td>${formatSA(order.created_at)}</td></tr>
      </table>
      <h3 style="color: #2e7d32;">Products Ordered:</h3>
      <table style="width:100%; border-collapse: collapse;">
        <tr style="background:#f1f8e9;">
          <th>Product Name</th>
          <th>Category</th>
          <th>Quantity</th>
        </tr>
        ${order.products.map(p => 
          `<tr><td>${p.name}</td><td>${p.category}</td><td>${p.quantity}</td></tr>`
        ).join('')}
      </table>
    </div>
  `;
}

// --- Append order to Google Sheet and update summary ---
async function appendOrderToSheet(order) {
  try {
    // Append raw order
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

    // Read all orders to calculate summary
    const sheetData = await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: 'Sheet1!G2:H'
    });

    const rows = sheetData.data.values || [];
    const summary = {};

    rows.forEach(row => {
      const products = row[0].split(', ');
      products.forEach(p => {
        const match = p.match(/(.+?) \(x(\d+)\)/);
        if (match) {
          const name = match[1].trim();
          const qty = parseInt(match[2], 10);
          summary[name] = (summary[name] || 0) + qty;
        }
      });
    });

    // Prepare summary table
    const summaryValues = [['Product', 'Total Sold']];
    Object.keys(summary).forEach(product => {
      summaryValues.push([product, summary[product]]);
    });

    // Clear previous summary
    await sheets.spreadsheets.values.clear({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: 'Sheet1!J2:K1000'
    });

    // Write new summary
    await sheets.spreadsheets.values.update({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: 'Sheet1!J2',
      valueInputOption: 'RAW',
      resource: { values: summaryValues }
    });
    
    return true;
  } catch (error) {
    logger.error('Error in appendOrderToSheet:', error);
    throw error;
  }
}

// --- Routes ---
app.get('/status', (req, res) => res.json({ 
  uptime: process.uptime(), 
  message: 'OK',
  environment: process.env.NODE_ENV || 'development'
}));

app.post('/submit', async (req, res) => {
  try {
    logger.info('--- New Order Submission ---', { body: req.body });

    const { name, sender_number, receiver_name, receiver_number, pep_code, products } = req.body;
    if (!name || !sender_number || !receiver_name || !receiver_number) {
      return res.status(400).json({ success: false, message: 'Missing required fields.' });
    }
    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ success: false, message: 'No products selected.' });
    }

    // Convert product strings into objects with category
    const productList = products.map(p => {
      const productName = p.split(' (x')[0];
      const quantity = parseInt(p.match(/\(x(\d+)\)/)?.[1] || '1', 10);
      const category = productCategories[productName] || 'Unknown';
      return { name: productName, quantity, category };
    });

    const savedOrder = await new Order({
      name,
      sender_number,
      receiver_name,
      receiver_number,
      pep_code: pep_code || '',
      products: productList
    }).save();

    try {
      await appendOrderToSheet(savedOrder);
      logger.info('Order appended to Google Sheet and summary updated', { orderId: savedOrder._id });
    } catch (err) {
      logger.error('Google Sheet error', { error: err });
    }

    try {
      await transporter.sendMail({
        from: `"Order System" <${process.env.SMTP_USER}>`,
        to: COMPANY_EMAIL,
        subject: `New Order #${savedOrder._id}`,
        html: formatOrderEmail(savedOrder)
      });
      logger.info('Email sent successfully', { orderId: savedOrder._id });
    } catch (err) {
      logger.error('Email sending error', { error: err });
    }

    res.json({ success: true, message: 'Order processed successfully.', orderId: savedOrder._id });
  } catch (err) {
    logger.error('Error handling /submit', { error: err });
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// --- Start server ---
app.listen(PORT, () => logger.info(`Server running on http://localhost:${PORT} in ${process.env.NODE_ENV || 'development'} mode`));