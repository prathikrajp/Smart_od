const express = require('express');
const router = express.Router();
const ODRequest = require('../models/ODRequest');

// Get all requests (and cleanup expired ones)
router.get('/', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        
        // Cleanup expired ODs
        await ODRequest.deleteMany({ endDate: { $lt: today } });

        const requests = await ODRequest.find().sort({ timestamp: -1 });
        res.json(requests);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch OD requests' });
    }
});

// Create new request
router.post('/', async (req, res) => {
    try {
        const newReq = new ODRequest(req.body);
        await newReq.save();
        res.status(201).json(newReq);
    } catch (err) {
        res.status(400).json({ error: 'Failed to create OD request', details: err.message });
    }
});

// Update standard status fields
router.patch('/:id', async (req, res) => {
    try {
        const updated = await ODRequest.findOneAndUpdate(
            { id: req.params.id },
            { $set: req.body },
            { new: true }
        );
        if (!updated) return res.status(404).json({ error: 'Request not found' });
        res.json(updated);
    } catch (err) {
        res.status(400).json({ error: 'Failed to update request' });
    }
});

module.exports = router;
