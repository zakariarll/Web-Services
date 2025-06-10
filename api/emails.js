const mongoose = require('mongoose');
const geoip = require('geoip-lite');
const axios = require('axios');
const { getName } = require('country-list');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({ format: winston.format.simple() })
  ]
});

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
    let ip = forwarded ? forwarded.split(',')[0].trim() : req.headers['x-vercel-proxied-for'] || '127.0.0.1';

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

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', process.env.CLIENT_URL || 'https://findmeds-ma.web.app');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
    res.setHeader('Access-Control-Allow-Origin', process.env.CLIENT_URL || 'https://findmeds-ma.web.app');
    return res.status(201).json({ message: 'Email saved successfully' });
  } catch (error) {
    logger.error('Email submission error:', error.message);
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Email already exists' });
    }
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: Object.values(error.errors).map(e => e.message).join(', ') });
    }
    return res.status(500).json({ error: 'Server error' });
  }
};
