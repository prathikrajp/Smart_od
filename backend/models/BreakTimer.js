const mongoose = require('mongoose');

const breakTimerSchema = new mongoose.Schema({
    studentId: { type: String, required: true },
    studentName: { type: String },
    labName: { type: String },
    department: { type: String },
    timeSlot: { type: String }, // Slot-1, Slot-2, Slot-3
    breakDurationMs: { type: Number },
    startedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date },
    status: { type: String, default: 'ACTIVE', enum: ['ACTIVE', 'STOPPED', 'EXPIRED'] },
    stoppedBy: { type: String }, // ENTRY_SCAN, EXIT_RESCAN, EXPIRED, CLASS_SCAN
    // Class attendance tracking
    classAttendance: {
        className: { type: String },
        startTime: { type: Date },
        endTime: { type: Date },   // startTime + 45min
        returnDeadline: { type: Date } // endTime + 15min
    }
}, { timestamps: true });

module.exports = mongoose.model('BreakTimer', breakTimerSchema);
