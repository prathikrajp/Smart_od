const express = require('express');
const router = express.Router();
const BreakTimer = require('../models/BreakTimer');
const Notification = require('../models/Notification');

// In-memory timer store: { [studentId]: timeoutHandle }
const activeTimers = {};
// In-memory class return timer store: { [studentId]: timeoutHandle }
const classReturnTimers = {};

// Fixed break buffer duration (20 minutes)
const BREAK_BUFFER_MS = 20 * 60 * 1000;

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
        const { studentId, studentName, labName, department, timeSlot, durationMs, source } = req.body;

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

        const actualDurationMs = durationMs || BREAK_BUFFER_MS;
        const now = new Date();
        const expiresAt = new Date(now.getTime() + actualDurationMs);

        const timer = new BreakTimer({
            studentId, studentName, labName, department, timeSlot,
            breakDurationMs: actualDurationMs,
            source: source || 'BREAK',
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
                    const msg = timer.source === 'APPROVAL_GRACE'
                        ? `${studentName} failed to report to ${labName} within the 10-minute reporting window.`
                        : `${studentName} is not present in ${labName} lab. Break timer expired.`;
                    await sendNotification(msg, department, 'BREAK_ALERT');
                    console.log(`[BreakTimer] EXPIRED: ${msg}`);
                }
            } catch (err) {
                console.error('[BreakTimer] Expiry handler error:', err);
            }
            delete activeTimers[studentId];
        }, actualDurationMs);

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

        const now = new Date();
        const timer = await BreakTimer.findOne({
            studentId,
            status: { $in: ['ACTIVE', 'PAUSED'] }
        });

        if (!timer) {
            return res.json({ message: 'No active break timer found', stopped: false });
        }

        // ── Class Attendance Flow (PAUSE) ────────────────────────────────────
        if (stoppedBy === 'CLASS_SCAN' && className) {
            if (timer.status === 'PAUSED') {
                 // Already paused
                 return res.json({ message: 'Break timer already paused', stopped: true, timer });
            }
            
            timer.status = 'PAUSED';
            timer.stoppedBy = 'CLASS_SCAN';
            timer.pausedAt = now;
            timer.remainingDurationMs = Math.max(0, timer.expiresAt.getTime() - now.getTime());

            const classStart = new Date();
            
            // Constraint: No one can attend class after 3:00 PM (15:00)
            if (classStart.getHours() >= 15) {
                return res.status(400).json({ error: 'Class attendance is not permitted after 3:00 PM' });
            }

            const classEnd = new Date(classStart.getTime() + 45 * 60 * 1000); // 45 min duration
            const returnDeadline = new Date(classEnd.getTime() + 15 * 60 * 1000); // 15 min return buffer

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
            const Notification = require('../models/Notification');
            const ntf = new Notification({
                id: `NTF-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
                recipientRole: 'LAB_INCHARGE',
                department: timer.department,
                message: classMsg,
                type: 'CLASS_ATTENDANCE',
                title: 'Class Attendance Notice'
            });
            await ntf.save();

            // Schedule class return check (45min class) to auto-resume break
            if (classReturnTimers[studentId]) {
                clearTimeout(classReturnTimers[studentId]);
            }
            const resumeCheckMs = 45 * 60 * 1000; // 45 min class
            classReturnTimers[studentId] = setTimeout(async () => {
                try {
                    const pausedTimer = await BreakTimer.findById(timer._id);
                    if (pausedTimer && pausedTimer.status === 'PAUSED') {
                        // Resume the timer
                        pausedTimer.status = 'ACTIVE';
                        pausedTimer.stoppedBy = null;
                        pausedTimer.expiresAt = new Date(Date.now() + pausedTimer.remainingDurationMs);
                        await pausedTimer.save();
                        
                        console.log(`[BreakTimer] AUTO-RESUMED for ${studentId}`);
                        
                        // Restart the expiry timer
                        activeTimers[studentId] = setTimeout(async () => {
                            try {
                                const t = await BreakTimer.findById(pausedTimer._id);
                                if (t && t.status === 'ACTIVE') {
                                    t.status = 'EXPIRED';
                                    t.stoppedBy = 'EXPIRED';
                                    await t.save();
                                    const msg = `${t.studentName} is not present in ${t.labName} lab. Break timer expired after class.`;
                                    await sendNotification(msg, t.department, 'BREAK_ALERT');
                                }
                            } catch (err) { }
                            delete activeTimers[studentId];
                        }, pausedTimer.remainingDurationMs);
                    }
                } catch (err) {
                    console.error('[ClassReturn] Auto-resume error:', err);
                }
                delete classReturnTimers[studentId];
            }, resumeCheckMs);
            
            return res.json({ message: 'Break timer paused', stopped: true, timer });
        }

        // ── Standard STOP Flow ─────────────────────────────────────────────
        timer.status = 'STOPPED';
        timer.stoppedBy = stoppedBy || 'ENTRY_SCAN';
        await timer.save();
        
        if (classReturnTimers[studentId]) {
            clearTimeout(classReturnTimers[studentId]);
            delete classReturnTimers[studentId];
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
            status: { $in: ['ACTIVE', 'PAUSED'] }
        });
        res.json(timer || null);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch break timer' });
    }
});

module.exports = router;
