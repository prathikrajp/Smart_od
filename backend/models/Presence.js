const mongoose = require('mongoose');

const presenceSchema = new mongoose.Schema({
    studentId: { type: String, required: true },
    studentName: { type: String },
    location: { type: String, required: true }, // e.g. "AI Lab"
    timestamp: { type: String, required: true }  // ISO string
});

module.exports = mongoose.model('Presence', presenceSchema);
