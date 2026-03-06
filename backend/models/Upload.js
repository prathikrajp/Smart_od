const mongoose = require('mongoose');

const uploadSchema = new mongoose.Schema({
    studentId: { type: String, required: true },
    studentName: { type: String },
    labName: { type: String, required: true },
    projectName: { type: String, required: true },
    techStack: { type: String, required: true },
    duration: { type: Number, required: true }, // in minutes
    fileData: { type: String, required: true }, // Base64 or URL
    fileName: { type: String, required: true },
    fileType: { type: String, required: true },
    timestamp: { type: Number, required: true },
    uploadedBy: { type: String, required: true } // student Id
});

module.exports = mongoose.model('Upload', uploadSchema);
