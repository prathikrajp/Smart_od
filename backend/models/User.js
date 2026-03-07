const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true }, // 25EC002, ADVISOR1, etc.
    name: { type: String, required: true },
    role: {
        type: String,
        required: true,
        enum: ['STUDENT', 'ADVISOR', 'HOD', 'LAB_INCHARGE']
    },
    contact: {
        email: String,
        mobile_number: String
    },
    // Student specific fields
    cgpa: Number,
    marks: Number,
    className: String,
    department: String,
    yearOfStudy: String,
    achievements: { type: String, default: 'N/A' },
    remarks: { type: String, default: 'N/A' },
    labName: String,
    totalWorkingMs: { type: Number, default: 0 },
    password: { type: String, default: 'password' }, // Simple default
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);
