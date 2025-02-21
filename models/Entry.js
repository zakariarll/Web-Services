const mongoose = require('mongoose');

const entrySchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
  date: { type: Date, default: Date.now },
  pinColor: { type: String, enum: ['yellow', 'red', 'green', 'orange'], default: 'green' },
  status: { type: String, enum: ['Active', 'Deleted'], default: 'Active' }
});

const Entry = mongoose.model('Entry', entrySchema);

module.exports = Entry;