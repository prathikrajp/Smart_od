const mongoose = require('mongoose');
const User = require('./models/User');
const Session = require('./models/Session');
const Upload = require('./models/Upload');
const connectDB = require('./db');

async function seedDummyData() {
    try {
        await connectDB();
        console.log('Connected to DB for seeding...');

        const students = await User.find({ cgpa: { $gte: 7 }, role: 'STUDENT' });
        console.log(`Seeding data for ${students.length} students with CGPA >= 7`);

        const now = new Date();
        
        for (const student of students) {
            console.log(`Seeding student: ${student.name} (${student.id})`);
            
            let totalAdditionalMs = 0;

            for (let i = 0; i < 10; i++) {
                const date = new Date();
                date.setDate(now.getDate() - i);
                const dateStr = date.toISOString().split('T')[0];
                const startTime = date.setHours(9, 0, 0, 0);
                
                // 1. Add Dummy Session (COE Working Hours)
                // Random duration between 2 and 5 hours
                const durationMinutes = Math.floor(Math.random() * 180) + 120;
                const durationMs = durationMinutes * 60 * 1000;
                
                const session = new Session({
                    studentId: student.id,
                    studentName: student.name,
                    labName: student.labName || 'COE LAB',
                    startTime: startTime,
                    endTime: startTime + durationMs,
                    durationMinutes: durationMinutes,
                    isActive: false,
                    stoppedBy: 'SYSTEM_SEED'
                });
                await session.save();
                totalAdditionalMs += durationMs;

                // 2. Add Dummy Upload (Work Text)
                const upload = new Upload({
                    studentId: student.id,
                    topic: `Research Activity Day ${i + 1}`,
                    description: `Automated log for research work performed on ${dateStr}`,
                    uploadDate: dateStr,
                    content: `On ${dateStr}, concentrated on advanced algorithm implementation and system architecture refine. Performance metrics were within optimal range.`,
                    isComposed: true,
                    timestamp: date.getTime()
                });
                await upload.save();
            }

            // Update student's total working hours
            await User.findOneAndUpdate(
                { id: student.id },
                { $inc: { totalWorkingMs: totalAdditionalMs } }
            );
        }

        console.log('Seeding completed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Seeding failed:', err);
        process.exit(1);
    }
}

seedDummyData();
