const mongoose = require('mongoose');

const presenceSchema = new mongoose.Schema({
    studentId: { type: String, required: true },
    studentName: { type: String },
    type: { type: String },
    name: { type: String },
    location: { type: String }, 
    floor: { type: String },
    bssid: { type: String },
    timestamp: { type: String, required: true }
}, { strict: false });

module.exports = mongoose.model('Presence', presenceSchema);
