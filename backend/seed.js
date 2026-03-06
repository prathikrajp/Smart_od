require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');

const User = require('./models/User');

const DATA_DIR = path.join(__dirname, 'data');

const parseCSV = (filename) => {
    const filePath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filePath)) {
        console.warn(`[SKIP] Missing file: ${filename}`);
        return [];
    }
    const text = fs.readFileSync(filePath, 'utf8');
    return Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        transform: v => v?.trim()
    }).data;
};

const seedDB = async () => {
    try {
        const uri = process.env.MONGODB_URI;
        if (!uri) throw new Error("MONGODB_URI missing from .env");

        console.log('Connecting to MongoDB Atlas...');
        await mongoose.connect(uri);
        console.log('✅ Connected');

        console.log('--- Clearing Existing Users ---');
        await User.deleteMany({});

        console.log('--- Reading CSVs ---');
        const sources = [
            { file: 'students.csv', role: 'STUDENT' },
            { file: 'advisors.csv', role: 'ADVISOR' },
            { file: 'hod.csv', role: 'HOD' },
            { file: 'lab_incharge.csv', role: 'LAB_INCHARGE' }
        ];

        const emails = parseCSV('maild.csv');
        const mobiles = parseCSV('mobile_number.csv');

        let userDocs = [];

        const seenIds = new Set();
        for (const src of sources) {
            const rows = parseCSV(src.file);
            for (const row of rows) {
                if (!row.id || !row.name || seenIds.has(row.id)) continue;
                seenIds.add(row.id);

                const userEmail = emails.find(e => e.id === row.id);
                const userMobile = mobiles.find(m => m.id === row.id);

                userDocs.push({
                    id: row.id,
                    name: row.name,
                    role: src.role,
                    cgpa: row.cgpa ? parseFloat(row.cgpa) : undefined,
                    marks: row.marks ? parseFloat(row.marks) : undefined,
                    className: row.class || row.className,
                    contact: {
                        email: userEmail ? userEmail.email : null,
                        mobile_number: userMobile ? userMobile.mobile_number : null
                    }
                });
            }
        }

        console.log(`--- Seeding ${userDocs.length} Users ---`);
        await User.insertMany(userDocs);

        console.log('✅ Seeding Complete!');
        process.exit(0);

    } catch (err) {
        console.error('❌ Seeding Failed:', err);
        process.exit(1);
    }
};

seedDB();
