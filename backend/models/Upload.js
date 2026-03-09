const mongoose = require('mongoose');

const uploadSchema = new mongoose.Schema({
    studentId: { type: String, required: true },
    topic: { type: String, required: true },
    description: { type: String },
    fileName: { type: String },
    fileType: { type: String },
    size: { type: String },
    uploadDate: { type: String, required: true }, // YYYY-MM-DD
    content: { type: String, required: true }, // Base64 or Composed text
    isComposed: { type: Boolean, default: false },
    timestamp: { type: Number, default: Date.now }
});

module.exports = mongoose.model('Upload', uploadSchema);
