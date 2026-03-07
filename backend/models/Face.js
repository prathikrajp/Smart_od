const mongoose = require('mongoose');

const faceSchema = new mongoose.Schema({
    studentId: { type: String, required: true, unique: true },
    imageData: { type: String, required: true }, // Base64 string
    contentType: { type: String, default: 'image/jpeg' },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Face', faceSchema);
