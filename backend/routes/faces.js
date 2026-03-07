const express = require('express');
const router = express.Router();
const Face = require('../models/Face');

// Get face image by studentId
router.get('/:studentId', async (req, res) => {
    try {
        const face = await Face.findOne({ studentId: req.params.studentId });
        if (!face) {
            return res.status(404).json({ error: 'Face bio-data not found' });
        }

        const buffer = Buffer.from(face.imageData, 'base64');
        res.set('Content-Type', face.contentType);
        res.send(buffer);
    } catch (err) {
        console.error('Error fetching face:', err);
        res.status(500).json({ error: 'Server error fetching face' });
    }
});

module.exports = router;
