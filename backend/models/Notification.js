const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    recipientRole: { type: String, required: true }, // 'HOD', 'ADVISOR', etc.
    recipientId: { type: String }, // Optional specific ID
    department: { type: String },
    message: { type: String, required: true },
    senderName: { type: String },
    type: { type: String, default: 'INFO' },
    readBy: [{ type: String }],
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Notification', notificationSchema);
