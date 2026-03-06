const mongoose = require('mongoose');

const violationSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true }, // usually timestamp string
    studentId: { type: String, required: true },
    studentName: { type: String, required: true },
    labName: { type: String, required: true },
    message: { type: String, required: true },
    time: { type: String, required: true }, // ISO string
    readBy: [{ type: String }] // Array of user IDs who have dismissed/read it
});

module.exports = mongoose.model('Violation', violationSchema);
