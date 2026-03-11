const express = require('express');
const router = express.Router();
const BreakTimer = require('../models/BreakTimer');
const Notification = require('../models/Notification');

// In-memory timer store: { [studentId]: timeoutHandle }
const activeTimers = {};
// In-memory class return timer store: { [studentId]: timeoutHandle }
const classReturnTimers = {};

// Fixed break buffer duration (15 minutes)
const BREAK_BUFFER_MS = 15 * 60 * 1000;

// Helper: create and save a notification
const sendNotification = async (message, department, type = 'BREAK_ALERT') => {
    const roles = ['LAB_INCHARGE', 'ADVISOR'];
    for (const role of roles) {
        const ntf = new Notification({
            id: `NTF-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
            recipientRole: role,
            department,
            message,
            type,
            title: type === 'CLASS_ATTENDANCE' ? 'Class Attendance Notice' : 'Absence Alert'
        });
        await ntf.save();
    }
};

// ── START break timer ────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
    try {
        const { studentId, studentName, labName, department, timeSlot } = req.body;

        // Cancel any existing timer for this student
        if (activeTimers[studentId]) {
            clearTimeout(activeTimers[studentId]);
            delete activeTimers[studentId];
        }

        // Mark any previous ACTIVE timers as STOPPED
        await BreakTimer.updateMany(
            { studentId, status: 'ACTIVE' },
            { $set: { status: 'STOPPED', stoppedBy: 'NEW_BREAK' } }
        );

        const durationMs = BREAK_BUFFER_MS;
        const now = new Date();
        const expiresAt = new Date(now.getTime() + durationMs);

        const timer = new BreakTimer({
            studentId, studentName, labName, department, timeSlot,
            breakDurationMs: durationMs,
            startedAt: now,
            expiresAt,
            status: 'ACTIVE'
        });
        await timer.save();

        // Schedule expiry notification
        activeTimers[studentId] = setTimeout(async () => {
            try {
                const t = await BreakTimer.findById(timer._id);
                if (t && t.status === 'ACTIVE') {
                    t.status = 'EXPIRED';
                    t.stoppedBy = 'EXPIRED';
                    await t.save();

                    const msg = `${studentName} is not present in ${labName} lab`;
                    await sendNotification(msg, department, 'BREAK_ALERT');
                    console.log(`[BreakTimer] EXPIRED: ${msg}`);
                }
            } catch (err) {
                console.error('[BreakTimer] Expiry handler error:', err);
            }
            delete activeTimers[studentId];
        }, durationMs);

        res.status(201).json(timer);
    } catch (err) {
        console.error(err);
        res.status(400).json({ error: 'Failed to start break timer' });
    }
});

// ── STOP break timer (student scanned a QR) ─────────────────────────────────
router.post('/stop', async (req, res) => {
    try {
        const { studentId, stoppedBy, className } = req.body;

        // Clear in-memory timeout
        if (activeTimers[studentId]) {
            clearTimeout(activeTimers[studentId]);
            delete activeTimers[studentId];
        }

        const timer = await BreakTimer.findOneAndUpdate(
            { studentId, status: 'ACTIVE' },
            { $set: { status: 'STOPPED', stoppedBy: stoppedBy || 'ENTRY_SCAN' } },
            { new: true }
        );

        if (!timer) {
            return res.json({ message: 'No active break timer found', stopped: false });
        }

        // ── Class Attendance Flow ────────────────────────────────────────────
        if (stoppedBy === 'CLASS_SCAN' && className) {
            const classStart = new Date();
            const classEnd = new Date(classStart.getTime() + 45 * 60 * 1000);
            const returnDeadline = new Date(classEnd.getTime() + 15 * 60 * 1000);

            timer.classAttendance = {
                className,
                startTime: classStart,
                endTime: classEnd,
                returnDeadline
            };
            await timer.save();

            // Format times
            const fmt = (d) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

            // Notify lab incharge about class attendance
            const classMsg = `${timer.studentName} is in ${className} for attending his class lecture between ${fmt(classStart)} to ${fmt(classEnd)} (HH:MM:SS)`;
            const ntf = new Notification({
                id: `NTF-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
                recipientRole: 'LAB_INCHARGE',
                department: timer.department,
                message: classMsg,
                type: 'CLASS_ATTENDANCE',
                title: 'Class Attendance Notice'
            });
            await ntf.save();

            // Schedule class return check (45min class + 15min buffer)
            if (classReturnTimers[studentId]) {
                clearTimeout(classReturnTimers[studentId]);
            }
            const returnCheckMs = (45 + 15) * 60 * 1000; // 60 min total
            classReturnTimers[studentId] = setTimeout(async () => {
                try {
                    // Check if student has scanned lab exit QR since class started
                    const latestTimer = await BreakTimer.findById(timer._id);
                    // If classAttendance exists and returnDeadline has passed, check presence
                    // We check if a new break timer was started (meaning student scanned lab exit = returned)
                    const newerTimer = await BreakTimer.findOne({
                        studentId,
                        createdAt: { $gt: classStart },
                        _id: { $ne: timer._id }
                    });

                    if (!newerTimer) {
                        // Student did NOT return to lab within deadline
                        const absentMsg = `${timer.studentName} is not present in ${timer.labName} lab`;
                        await sendNotification(absentMsg, timer.department, 'BREAK_ALERT');
                        console.log(`[ClassReturn] ABSENT: ${absentMsg}`);
                    }
                } catch (err) {
                    console.error('[ClassReturn] Check error:', err);
                }
                delete classReturnTimers[studentId];
            }, returnCheckMs);
        }

        res.json({ message: 'Break timer stopped', stopped: true, timer });
    } catch (err) {
        console.error(err);
        res.status(400).json({ error: 'Failed to stop break timer' });
    }
});

// ── GET break timer history for a student (for COE timeline) ─────────────────
router.get('/student-history/:studentId', async (req, res) => {
    try {
        const timers = await BreakTimer.find({
            studentId: req.params.studentId
        }).sort({ createdAt: -1 });
        res.json(timers);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch student break history' });
    }
});

// ── GET all break timers for a lab (for Lab Incharge tracking panel) ─────────
// NOTE: This must be defined BEFORE /:studentId to prevent Express matching "lab" as a studentId
router.get('/lab/:labName', async (req, res) => {
    try {
        // Return ACTIVE and recently STOPPED/EXPIRED timers (last 24h)
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const timers = await BreakTimer.find({
            labName: req.params.labName,
            createdAt: { $gte: since }
        }).sort({ createdAt: -1 });
        res.json(timers);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch lab break timers' });
    }
});

// ── GET active break timer for a student ─────────────────────────────────────
router.get('/:studentId', async (req, res) => {
    try {
        const timer = await BreakTimer.findOne({
            studentId: req.params.studentId,
            status: 'ACTIVE'
        });
        res.json(timer || null);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch break timer' });
    }
});

module.exports = router;
