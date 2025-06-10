const express = require('express');
const mongoose = require('mongoose');
const geoip = require('geoip-lite');
const cors = require('cors');
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const { getName } = require('country-list');
const winston = require('winston');
const expressWinston = require('express-winston');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

app.use(expressWinston.logger({
  winstonInstance: logger,
  meta: true,
  msg: 'HTTP {{req.method}} {{req.url}}',
  expressFormat: true,
  colorize: false
}));

app.use(cors({
  origin: process.env.CLIENT_URL || 'https://findmeds-ma.web.app',
  methods: ['GET', 'POST'],
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' }
});
app.use('/api', limiter);

mongoose.connect(process.env.MONGO_URI, {
  serverSelectionTimeoutMS: 5000
}).catch(err => logger.error('MongoDB connection error:', err));

const emailSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email format']
  },
  ipAddress: {
    type: String,
    required: true,
    match: [/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/, 'Invalid IPv4 format']
  },
  location: {
    type: String,
    required: true,
    minlength: 2
  },
  createdAt: {
    type: Date,
    default: Date.now,
    immutable: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

const Email = mongoose.model('Email', emailSchema);

const getPublicIp = async (req) => {
  try {
    const forwarded = req.headers['x-forwarded-for'];
    let ip = forwarded ? forwarded.split(',')[0].trim() : req.ip;

    if (ip.startsWith('::ffff:')) {
      ip = ip.replace('::ffff:', '');
    }

    if (!/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(ip) || ip.match(/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|127\.)/)) {
      const response = await axios.get('https://api.ipify.org?format=json', { timeout: 3000 });
      return response.data.ip;
    }
    return ip;
  } catch (error) {
    logger.error('Error fetching public IP:', error.message);
    throw new Error('Unable to determine public IP');
  }
};

app.post('/api/emails', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const ipAddress = await getPublicIp(req);
    const geo = geoip.lookup(ipAddress);
    const location = geo && geo.country ? getName(geo.country) || 'Unknown' : 'Unknown';

    const newEmail = new Email({
      email: email.trim().toLowerCase(),
      ipAddress,
      location
    });

    await newEmail.save();
    res.status(201).json({ message: 'Email saved successfully' });
  } catch (error) {
    logger.error('Email submission error:', error.message);
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Email already exists' });
    }
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: Object.values(error.errors).map(e => e.message).join(', ') });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  server.close(() => process.exit(1));
});
