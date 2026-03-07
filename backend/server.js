const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';

// ── Database Connection ──────────────────────────────────────────────────────
connectDB();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({
    origin: [FRONTEND_ORIGIN, 'http://localhost:3000', 'http://localhost:3001'],
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/data', require('./routes/data'));
app.use('/api/od-requests', require('./routes/od_requests'));
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/presence', require('./routes/presence'));
app.use('/api/uploads', require('./routes/uploads'));
app.use('/api/faces', require('./routes/faces'));
app.use('/api/violations', require('./routes/misc').violationsRouter);
app.use('/api/metadata', require('./routes/misc').metadataRouter);
app.use('/api/working-time', require('./routes/misc').workingTimeRouter);

// ── Health Check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`✅ SmartOD Backend running on http://localhost:${PORT}`);
    console.log(`   Accepting requests from: ${FRONTEND_ORIGIN}`);
});

module.exports = app;
