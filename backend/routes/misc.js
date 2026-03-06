const express = require('express');
const User = require('../models/User');
const Violation = require('../models/Violation');

const metadataRouter = express.Router();
const violationsRouter = express.Router();
const workingTimeRouter = express.Router();

// --- Metadata (Achievements/Remarks) ---
metadataRouter.get('/', async (req, res) => {
    try {
        const users = await User.find({ role: 'STUDENT' }).select('id achievements remarks').lean();
        const metaMap = {};
        users.forEach(u => metaMap[u.id] = { achievements: u.achievements, remarks: u.remarks });
        res.json(metaMap);
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

metadataRouter.patch('/:studentId', async (req, res) => {
    try {
        const { achievements, remarks } = req.body;
        const updated = await User.findOneAndUpdate(
            { id: req.params.studentId },
            { $set: { achievements, remarks } },
            { new: true }
        );
        res.json(updated);
    } catch (err) { res.status(400).json({ error: 'Update failed' }); }
});


// --- Violations ---
violationsRouter.get('/', async (req, res) => {
    try {
        const viols = await Violation.find().sort({ time: -1 });
        res.json(viols);
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

violationsRouter.post('/', async (req, res) => {
    try {
        const v = new Violation(req.body);
        await v.save();
        res.status(201).json(v);
    } catch (err) { res.status(400).json({ error: 'Create failed' }); }
});

violationsRouter.patch('/read/:id/:userId', async (req, res) => {
    try {
        const v = await Violation.findOneAndUpdate(
            { id: req.params.id },
            { $addToSet: { readBy: req.params.userId } },
            { new: true }
        );
        res.json(v);
    } catch (err) { res.status(400).json({ error: 'Update failed' }); }
});


// --- Working Time --- 
workingTimeRouter.get('/:studentId', async (req, res) => {
    try {
        const user = await User.findOne({ id: req.params.studentId }).select('totalWorkingMs');
        res.json({ ms: user ? user.totalWorkingMs : 0 });
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

workingTimeRouter.patch('/:studentId', async (req, res) => {
    try {
        const { ms } = req.body;
        const updated = await User.findOneAndUpdate(
            { id: req.params.studentId },
            { $inc: { totalWorkingMs: ms } },
            { new: true }
        );
        res.json(updated);
    } catch (err) { res.status(400).json({ error: 'Update failed' }); }
});

module.exports = { metadataRouter, violationsRouter, workingTimeRouter };
