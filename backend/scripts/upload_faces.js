const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Face = require('../models/Face');
require('dotenv').config();

const dirPath = '/home/sabareesh/Downloads/Smart OD FACE/';

const uploadFaces = async () => {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected.');

        const files = fs.readdirSync(dirPath);
        console.log(`Found ${files.length} files in ${dirPath}`);

        for (const file of files) {
            if (file.toLowerCase().endsWith('.jpeg') || file.toLowerCase().endsWith('.jpg') || file.toLowerCase().endsWith('.png')) {
                // Extract Student ID (e.g. 25EC001)
                const match = file.match(/[0-9]{2}EC[0-9]{3}/i);
                if (match) {
                    const studentId = match[0].toUpperCase();
                    console.log(`Processing ${file} -> Student ID: ${studentId}`);
                    
                    const data = fs.readFileSync(path.join(dirPath, file));
                    const base64 = data.toString('base64');
                    
                    await Face.findOneAndUpdate(
                        { studentId },
                        { 
                            imageData: base64, 
                            contentType: file.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg' 
                        },
                        { upsert: true }
                    );
                    console.log(`Successfully uploaded/updated: ${studentId}`);
                } else {
                    console.warn(`Skipping ${file}: No Student ID found in filename`);
                }
            }
        }

        console.log('All face uploads completed.');
        process.exit(0);
    } catch (err) {
        console.error('Upload failed:', err);
        process.exit(1);
    }
};

uploadFaces();
