const express = require('express');
const path = require('path');
const fs = require('fs');
const Papa = require('papaparse');
const router = express.Router();

const DATA_DIR = path.join(__dirname, '../data');

const parseCSV = (filename) => {
    const filePath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filePath)) return [];
    const text = fs.readFileSync(filePath, 'utf8');
    return Papa.parse(text, { header: true, skipEmptyLines: true, transform: v => v.trim() }).data;
};

/**
 * POST /api/auth/login
 * Body: { name, id }
 * Returns: complete user object with role, email, mobile_number
 */
router.post('/login', (req, res) => {
    const { name, id } = req.body;
    if (!name || !id) return res.status(400).json({ error: 'Name and ID are required.' });

    const sources = [
        { file: 'students.csv', role: 'STUDENT' },
        { file: 'advisors.csv', role: 'ADVISOR' },
        { file: 'hod.csv', role: 'HOD' },
        { file: 'lab_incharge.csv', role: 'LAB_INCHARGE' }
    ];

    let foundUser = null;
    for (const src of sources) {
        const rows = parseCSV(src.file);
        const match = rows.find(u =>
            u.name?.toLowerCase() === name.trim().toLowerCase() &&
            u.id?.trim() === id.trim()
        );
        if (match) {
            foundUser = { ...match, role: src.role };
            break;
        }
    }

    if (!foundUser) {
        return res.status(401).json({ error: 'Invalid credentials. Please check your Name and ID.' });
    }

    // Enrich with email + mobile
    const emails = parseCSV('maild.csv');
    const mobiles = parseCSV('mobile_number.csv');
    const userEmail = emails.find(e => e.id?.trim() === foundUser.id?.trim());
    const userMobile = mobiles.find(m => m.id?.trim() === foundUser.id?.trim());

    const completeUser = {
        ...foundUser,
        email: userEmail?.email || 'N/A',
        mobile_number: userMobile?.mobile_number || 'N/A'
    };

    res.json({ user: completeUser });
});

module.exports = router;
