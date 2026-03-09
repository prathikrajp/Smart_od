const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');

// Get notifications for a role/dept
router.get('/:role', async (req, res) => {
    try {
        const { dept } = req.query;
        const query = { recipientRole: req.params.role };
        if (dept) query.department = dept;
        
        const notifications = await Notification.find(query).sort({ createdAt: -1 }).limit(50);
        res.json(notifications);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

// Create notification
router.post('/', async (req, res) => {
    try {
        const id = `NTF-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const ntf = new Notification({ ...req.body, id });
        await ntf.save();
        res.status(201).json(ntf);
    } catch (err) {
        res.status(400).json({ error: 'Failed to create notification' });
    }
});

// Mark as read
router.patch('/read/:id/:userId', async (req, res) => {
    try {
        const updated = await Notification.findOneAndUpdate(
            { id: req.params.id },
            { $addToSet: { readBy: req.params.userId } },
            { new: true }
        );
        res.json(updated);
    } catch (err) {
        res.status(400).json({ error: 'Update failed' });
    }
});

module.exports = router;
