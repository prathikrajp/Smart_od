const express = require('express');
const router = express.Router();
const Session = require('../models/Session');

// Get all active sessions
router.get('/', async (req, res) => {
    try {
        // Return active sessions as an object map by studentId (matching old localStorage format)
        const sessions = await Session.find({ isActive: true });
        const sessionMap = {};
        sessions.forEach(s => sessionMap[s.studentId] = s);
        res.json(sessionMap);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch sessions' });
    }
});

// Get historical sessions for a student
router.get('/history/:studentId', async (req, res) => {
    try {
        const sessions = await Session.find({ studentId: req.params.studentId, isActive: false }).sort({ startTime: -1 });
        res.json(sessions);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch historical sessions' });
    }
});

// Start session
router.post('/', async (req, res) => {
    try {
        const { studentId } = req.body;
        // End any existing active sessions for this student first
        await Session.updateMany(
            { studentId, isActive: true },
            { $set: { isActive: false, stoppedBy: 'AUTO_OVERRIDE', endTime: Date.now() } }
        );

        const newSession = new Session(req.body);
        await newSession.save();
        res.json(newSession);
    } catch (err) {
        res.status(400).json({ error: 'Failed to start session' });
    }
});

// Update/Stop/Pause session
router.patch('/:studentId', async (req, res) => {
    try {
        const session = await Session.findOneAndUpdate(
            { studentId: req.params.studentId, isActive: true },
            { $set: req.body },
            { new: true }
        );
        if (!session) return res.status(404).json({ error: 'No active session found' });
        res.json(session);
    } catch (err) {
        res.status(400).json({ error: 'Failed to update session' });
    }
});

module.exports = router;
