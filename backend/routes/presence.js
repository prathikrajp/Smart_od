const express = require('express');
const router = express.Router();
const Presence = require('../models/Presence');

// Get all presence logs (for notifications)
router.get('/logs', async (req, res) => {
    try {
        const logs = await Presence.find().sort({ timestamp: -1 }).limit(50);
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch presence logs' });
    }
});

// Get real-time presence map
router.get('/', async (req, res) => {
    try {
        // Find latest presence per student (active within some window if desired, but returning all for now like old map)
        const allPresence = await Presence.find().sort({ timestamp: -1 });
        const presenceMap = {};
        // Map stores only the latest entry per student
        allPresence.forEach(p => {
            if (!presenceMap[p.studentId]) presenceMap[p.studentId] = p;
        });
        res.json(presenceMap);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch presence' });
    }
});

// Add presence check-in
router.post('/', async (req, res) => {
    try {
        const newPresence = new Presence(req.body);
        await newPresence.save();
        res.json(newPresence);
    } catch (err) {
        res.status(400).json({ error: 'Failed to record presence' });
    }
});

module.exports = router;
