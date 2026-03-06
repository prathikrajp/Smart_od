const mongoose = require('mongoose');

const odRequestSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    studentId: { type: String, required: true },
    studentName: { type: String, required: true },
    className: { type: String },
    reason: { type: String, required: true },
    date: { type: String, required: true },
    time: { type: String, required: true },
    meridiem: { type: String, required: true },
    destination: { type: String, required: true },
    timestamp: { type: String, required: true },

    advisorId: { type: String, required: true },
    advisorName: { type: String },

    status: {
        type: String,
        enum: ['Pending', 'Approved by Advisor', 'Approved by HOD', 'Rejected'],
        default: 'Pending'
    },

    paperId: { type: String },

    // Tracking usage
    scannedInAt: { type: String },
    labName: { type: String },
    labInchargeId: { type: String }
});

module.exports = mongoose.model('ODRequest', odRequestSchema);
