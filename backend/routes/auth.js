const express = require('express');
const router = express.Router();
const User = require('../models/User');

/**
 * POST /api/auth/login
 * Body: { name, id }
 * Returns: complete user object with role, email, mobile_number
 */
router.post('/login', async (req, res) => {
    try {
        const { name, id } = req.body;
        if (!name || !id) return res.status(400).json({ error: 'Name and ID are required.' });

        // Case-insensitive regex match for name to behave like the CSV search did
        const user = await User.findOne({
            id: id.trim(),
            name: new RegExp(`^${name.trim()}$`, 'i')
        });

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials. Please check your Name and ID.' });
        }

        res.json({ user });

    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error processing login' });
    }
});

module.exports = router;
