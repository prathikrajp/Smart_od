const express = require('express');
const router = express.Router();
const ODRequest = require('../models/ODRequest');
const Session = require('../models/Session');
const BreakTimer = require('../models/BreakTimer');
const Notification = require('../models/Notification');

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

// Cancel OD request
router.post('/cancel/:id', async (req, res) => {
    try {
        const od = await ODRequest.findOne({ id: req.params.id });
        if (!od) return res.status(404).json({ error: 'OD Request not found' });

        // 1. Update status to CANCELLED
        od.status = 'CANCELLED';
        od.statusUpdateTime = Date.now();
        await od.save();

        const studentId = od.studentId;

        // 2. Stop any active sessions
        await Session.updateMany(
            { studentId, isActive: true },
            { $set: { isActive: false, stoppedBy: 'OD_CANCELLED', endTime: Date.now() } }
        );

        // 3. Stop any active/paused breaks
        await BreakTimer.updateMany(
            { studentId, status: { $in: ['ACTIVE', 'PAUSED'] } },
            { $set: { status: 'STOPPED', stoppedBy: 'OD_CANCELLED' } }
        );

        // 4. Notify Advisor and Lab Incharge
        const timestamp = new Date().toISOString();
        const notificationData = {
            title: 'OD Cancellation Alert',
            message: `Student ${od.studentName} (${studentId}) has cancelled their OD request for ${od.labName}. All active sessions and timers have been terminated.`,
            department: od.department,
            type: 'INFO',
            senderName: od.studentName,
            createdAt: new Date()
        };

        const roles = ['ADVISOR', 'LAB_INCHARGE'];
        for (const role of roles) {
            const ntfId = `NTF-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            const ntf = new Notification({
                ...notificationData,
                id: ntfId,
                recipientRole: role
            });
            await ntf.save();
        }

        res.json({ message: 'OD Request cancelled and resources unlocked', od });
    } catch (err) {
        console.error('Cancellation error:', err);
        res.status(500).json({ error: 'Failed to cancel OD request', details: err.message });
    }
});

module.exports = router;
