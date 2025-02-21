const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  action: { type: String, required: true }, 
  entryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Entry' },
  details: { type: String }, 
  timestamp: { type: Date, default: Date.now },
});

const Activity = mongoose.model('Activity', activitySchema);

module.exports = Activity;