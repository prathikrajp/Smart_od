const mongoose = require('mongoose');

const odRequestSchema = new mongoose.Schema({
    id: { type: String }, // Optional now, since frontend uses MongoDB _id mostly or generates differently
    studentId: { type: String, required: true },
    studentName: { type: String, required: true },
    className: { type: String },
    department: { type: String },
    yearOfStudy: { type: String },
    purpose: { type: String },
    startDate: { type: String },
    endDate: { type: String },
    inTime: { type: String },
    outTime: { type: String },
    labName: { type: String },
    labInchargeName: { type: String },
    advisorName: { type: String },
    hodName: { type: String },
    cgpa: { type: Number },
    marks: { type: Number },
    priorityScore: { type: Number },
    
    // Legacy fields mapped for safety
    reason: { type: String },
    date: { type: String },
    time: { type: String },
    meridiem: { type: String },
    destination: { type: String },
    timestamp: { type: String },
    advisorId: { type: String },

    status: {
        type: String,
        default: 'PENDING_LAB'
    },
    requestedAt: { type: String },
    statusUpdateTime: { type: Number },

    paperId: { type: String },
    scannedInAt: { type: String },
    labInchargeId: { type: String }
}, { strict: false }); // Allow frontend to insert arbitrary new fields without crashing

module.exports = mongoose.model('ODRequest', odRequestSchema);
