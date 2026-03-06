const express = require('express');
const router = express.Router();
const Upload = require('../models/Upload');

// Get uploads for a specific student
router.get('/:studentId', async (req, res) => {
    try {
        const works = await Upload.find({ studentId: req.params.studentId }).sort({ timestamp: -1 });
        res.json(works);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch uploads' });
    }
});

// Upload new work
router.post('/:studentId', async (req, res) => {
    try {
        const newWork = new Upload({
            ...req.body,
            studentId: req.params.studentId,
            timestamp: Date.now()
        });
        await newWork.save();
        res.status(201).json(newWork);
    } catch (err) {
        res.status(400).json({ error: 'Failed to upload work' });
    }
});

// Delete specific work
router.delete('/:studentId/:workId', async (req, res) => {
    try {
        const deleted = await Upload.findOneAndDelete({
            _id: req.params.workId,
            studentId: req.params.studentId
        });
        if (!deleted) return res.status(404).json({ error: 'Work not found' });
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ error: 'Failed to delete work' });
    }
});

module.exports = router;
