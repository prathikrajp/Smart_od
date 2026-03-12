const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
    studentId: { type: String, required: true },
    studentName: { type: String, required: true },
    labName: { type: String, required: true },
    startTime: { type: Number, required: true },
    isActive: { type: Boolean, default: true },
    isPaused: { type: Boolean, default: false },
    pausedAt: { type: Number },
    accumulatedPauseMs: { type: Number, default: 0 },
    startedBy: { type: String, enum: ['QR_SCAN', 'MANUAL', 'DIGITAL_SIGN_IN'], default: 'MANUAL' },
    stoppedBy: { type: String },
    endTime: { type: Number },
    durationMinutes: { type: Number },
    gpsRegion: {
        lat: { type: Number },
        lng: { type: Number },
        radius: { type: Number }
    }
});

module.exports = mongoose.model('Session', sessionSchema);
