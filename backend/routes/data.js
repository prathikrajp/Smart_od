const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const Papa = require('papaparse');

const User = require('../models/User');

const DATA_DIR = path.join(__dirname, '../data');

// Helper to serve non-DB static CSVs that frontend relies on
const getCSV = (filename) => {
    const file = path.join(DATA_DIR, filename);
    if (!fs.existsSync(file)) return [];
    return Papa.parse(fs.readFileSync(file, 'utf8'), { header: true, skipEmptyLines: true, transform: v => v.trim() }).data;
};

// Returns locations from MAC_address.csv
router.get('/locations', (req, res) => {
    res.json(getCSV('MAC_address.csv'));
});

// Returns students from MongoDB
router.get('/students', async (req, res) => {
    try {
        const students = await User.find({ role: 'STUDENT' });
        res.json(students);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch students from database' });
    }
});

module.exports = router;
