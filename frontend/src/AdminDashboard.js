import React, { useState, useEffect, useRef } from 'react';
import { FiUploadCloud as UploadCloud, FiCheckCircle as CheckCircle2, FiXCircle as XCircle, FiAlertCircle as AlertCircle, FiUser as User, FiMapPin as MapPin, FiMaximize as Maximize, FiClock as Clock, FiSearch as Search, FiCalendar as Calendar, FiChevronDown as ChevronDown, FiChevronUp as ChevronUp, FiPause, FiPlay } from 'react-icons/fi';
import { QRCodeSVG } from 'qrcode.react';
import { odApi, dataApi, sessionApi, presenceApi, miscApi, uploadApi, notificationApi, breakTimerApi } from './api';
import Papa from 'papaparse';

const AdminDashboard = ({ user }) => {
    const [data, setData] = useState([]);
    const [pendingRequests, setPendingRequests] = useState([]);
    const [globalRequests, setGlobalRequests] = useState([]);
    const [approvedODs, setApprovedODs] = useState({}); // studentId -> labName map
    const [locationMap, setLocationMap] = useState({}); // locationName -> {floor, bssid}
    const [livePresence, setLivePresence] = useState({});
    const [qrType, setQrType] = useState('ENTRY'); // Added for EXIT QR
    const [error, setError] = useState('');
    const [showQR, setShowQR] = useState(false);
    const [studentMetadata, setStudentMetadata] = useState({}); // studentId -> {achievements, remarks}
    const [editingStudent, setEditingStudent] = useState(null); // id of student being edited
    const [editForm, setEditForm] = useState({ achievements: '', remarks: '' });
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedStudentId, setExpandedStudentId] = useState(null);
    const [coeSessions, setCoeSessions] = useState({});
    const [activeTab, setActiveTab] = useState('SESSIONS'); // SESSIONS or UPLOADS
    const [selectedYear, setSelectedYear] = useState('1st'); // '1st', '2nd', '3rd', '4th'
    const [selectedStudentPortfolio, setSelectedStudentPortfolio] = useState(null);
    const [studentPortfolios, setStudentPortfolios] = useState({}); // Cache for fetched portfolios
    const [viewingWork, setViewingWork] = useState(null);
    const [tick, setTick] = useState(0); // forces live elapsed-time re-render
    const [successMessage, setSuccessMessage] = useState(null);
    const [notifications, setNotifications] = useState([]);
    const [labBreakTimers, setLabBreakTimers] = useState([]);
    const [expandedTrackingId, setExpandedTrackingId] = useState(null);
    const [uploadCounts, setUploadCounts] = useState({}); // studentId -> count

    useEffect(() => {
        // 0. Load Location Data from API
        dataApi.getLocations().then(parsed => {
            if (!Array.isArray(parsed)) return;
            const mapping = {};
            parsed.forEach(row => {
                if (row && row.className) {
                    mapping[row.className] = {
                        floor: row.floor,
                        bssid: row.bssid
                    };
                }
            });
            setLocationMap(mapping);
        }).catch(err => console.error("Location load failed:", err));

        // 1 & 2. Load Requests & Student Data
        const loadInitialData = async () => {
            try {
                // Fetch All Requests
                const reqs = await odApi.getAllRequests();
                const safeReqs = Array.isArray(reqs) ? reqs : [];
                setGlobalRequests(safeReqs);

                let filteredReqs = [];
                const role = user?.role;
                if (role === 'LAB_INCHARGE') {
                    filteredReqs = safeReqs.filter(r => r.labName === user?.labName && r.status === 'PENDING_LAB');
                } else if (role === 'ADVISOR') {
                    filteredReqs = safeReqs.filter(r => r.className === user?.className && r.status === 'PENDING_ADVISOR');
                } else if (role === 'HOD') {
                    filteredReqs = safeReqs.filter(r => r.department === user?.department && r.status === 'FORWARDED_TO_HOD');
                }
                setPendingRequests(filteredReqs);

                // Fetch Notifications for HOD
                if (role === 'HOD') {
                    const ntfList = await notificationApi.getNotifications('HOD', user.department);
                    setNotifications(ntfList);
                }

                // Fetch Students & Metadata
                const [students, savedMetadata] = await Promise.all([
                    dataApi.getStudents(),
                    miscApi.getMetadata()
                ]);

                setStudentMetadata(savedMetadata || {});

                const safeStudents = Array.isArray(students) ? students : [];
                const parsed = safeStudents.map(s => ({
                    ...s,
                    cgpa: parseFloat(s.cgpa) || 0,
                    marks: parseFloat(s.marks) || 0,
                    priorityScore: (parseFloat(s.cgpa) * 6) + (parseFloat(s.marks) * 0.4),
                    approved: ((parseFloat(s.cgpa) * 6) + (parseFloat(s.marks) * 0.4)) > 60
                }));

                let filteredStudents = [];
                const role2 = user?.role;
                if (role2 === 'ADVISOR') {
                    filteredStudents = parsed.filter(s => s.className === user?.className);
                } else if (role2 === 'HOD') {
                    filteredStudents = parsed.filter(s => s.department === user?.department);
                } else if (role2 === 'LAB_INCHARGE') {
                    filteredStudents = parsed;
                }

                filteredStudents.sort((a, b) => b.cgpa - a.cgpa);

                const mergedWithMetadata = filteredStudents.map(s => {
                    const meta = (savedMetadata || {})[s.id] || {};
                    
                    // Use totalWorkingMs from DB to calculate coeHours
                    const coeHours = s.totalWorkingMs ? parseFloat((s.totalWorkingMs / (1000 * 3600)).toFixed(1)) : 0;
                    const seededProgress = s.workProgress || (Math.floor(Math.random() * 40) + 20);

                    return {
                        ...s,
                        achievements: meta.achievements || s.achievements || 'N/A',
                        remarks: meta.remarks || s.remarks || 'N/A',
                        coeHours: coeHours,
                        workProgress: seededProgress
                    };
                });

                setData(mergedWithMetadata);
            } catch (err) {
                console.error("Initial data load failed:", err);
            }
        };

        loadInitialData();

        // 3. Load live presence and approved OD map
        const updatePresence = async () => {
            try {
                const presence = await presenceApi.getPresence();
                setLivePresence(presence);

                const allRequests = await odApi.getAllRequests();
                const safeAllReqs = Array.isArray(allRequests) ? allRequests : [];
                const approvedMap = {};
                let filteredReqs = [];
                const role = user?.role;

                safeAllReqs.forEach(r => {
                    if (r && r.status === 'APPROVED') {
                        approvedMap[r.studentId] = r.labName;
                    }
                    // Sync pending requests too
                    if (role === 'LAB_INCHARGE' && r.labName === user?.labName && r.status === 'PENDING_LAB') {
                        filteredReqs.push(r);
                    } else if (role === 'ADVISOR' && r.className === user?.className && r.status === 'PENDING_ADVISOR') {
                        filteredReqs.push(r);
                    } else if (role === 'HOD' && user?.department && r.department === user.department && r.status === 'FORWARDED_TO_HOD') {
                        filteredReqs.push(r);
                    }
                });
                setApprovedODs(approvedMap);
                setPendingRequests(filteredReqs);
                setGlobalRequests(safeAllReqs);
            } catch (err) { console.error(err); }
        };

        const updateCoeSessions = async () => {
            try {
                const sessions = await sessionApi.getActiveSessions();
                setCoeSessions(sessions);
            } catch (err) { console.error(err); }
        };

        updatePresence();
        updateCoeSessions();

        // 4. Load break timer data for Lab Incharge
        const updateBreakTimers = async () => {
            if (user?.role === 'LAB_INCHARGE' && user?.labName) {
                try {
                    const timers = await breakTimerApi.getLabBreaks(user.labName);
                    setLabBreakTimers(Array.isArray(timers) ? timers : []);
                } catch (err) { console.error(err); }
            }
        };

        const updateUploadCounts = async () => {
            if (user?.role === 'LAB_INCHARGE' || user?.role === 'ADVISOR' || user?.role === 'HOD') {
                try {
                    const counts = await uploadApi.getUploadSummary();
                    setUploadCounts(counts || {});
                } catch (err) { console.error("Upload summary fetch failed:", err); }
            }
        };

        updateBreakTimers();
        updateUploadCounts();

        const interval = setInterval(updatePresence, 5000);
        const coeInterval = setInterval(updateCoeSessions, 5000);
        const breakInterval = setInterval(updateBreakTimers, 5000);
        const uploadInterval = setInterval(updateUploadCounts, 10000); // Update counts every 10s
        const tickInterval = setInterval(() => setTick(t => t + 1), 1000);

        return () => {
            clearInterval(interval);
            clearInterval(coeInterval);
            clearInterval(breakInterval);
            clearInterval(uploadInterval);
            clearInterval(tickInterval);
        };
    }, [user]);


    const updateRequestStatus = async (requestId, studentId, newStatus) => {
        try {
            const isApprovedNow = newStatus === 'APPROVED';
            const updates = {
                status: newStatus,
                ...(isApprovedNow && { approvedAt: Date.now(), timeoutTriggered: false })
            };

            await odApi.updateStatus(requestId, updates);

            // 3. Refresh Local View
            setPendingRequests((prev) => (prev || []).filter(r => r && r.id !== requestId));
            setSuccessMessage(`Order of Duty successfully updated!`);
            setTimeout(() => setSuccessMessage(null), 3500);
        } catch (err) {
            console.error("Update failed:", err);
            setError("Failed to update status. Please try again.");
        }
    };

    const handleApprove = async (req) => {
        try {
            if (!req?.id) {
                setError("Invalid request data. Please refresh.");
                return;
            }

            let nextStatus = 'DENIED';
            if (req.status === 'PENDING_LAB') {
                nextStatus = 'PENDING_ADVISOR';
            } else if (req.status === 'PENDING_ADVISOR') {
                const isHighCGPA = (req.cgpa || 0) >= 8;
                nextStatus = (isHighCGPA || req.priorityScore >= 75) ? 'APPROVED' : 'FORWARDED_TO_HOD';
            } else if (req.status === 'FORWARDED_TO_HOD') {
                nextStatus = 'APPROVED';
            }
            if (req.status === 'PENDING_ADVISOR' && (nextStatus === 'APPROVED' || nextStatus === 'FORWARDED_TO_HOD')) {
                const message = `Advisor ${user.name} approved on duty for ${req.studentName} of ${req.yearOfStudy} year.`;
                await notificationApi.createNotification({
                    recipientRole: 'HOD',
                    department: req.department,
                    message,
                    senderName: user.name,
                    type: 'OD_APPROVAL'
                });
            }

            if (nextStatus === 'APPROVED') {
                // Auto-start 10 minute grace timer for check-in
                try {
                    await breakTimerApi.startBreak({
                        studentId: req.studentId,
                        studentName: req.studentName,
                        labName: req.labName,
                        department: req.department,
                        timeSlot: req.timeSlot || 'Unknown',
                        durationMs: 10 * 60 * 1000,
                        source: 'APPROVAL_GRACE'
                    });
                } catch (bErr) {
                    console.error("Failed to start auto grace timer", bErr);
                }
            }

            await updateRequestStatus(req.id, req.studentId, nextStatus);
        } catch (err) {
            console.error("Approval failed:", err);
            setError("Failed to approve request. Please try again.");
        }
    };

    const handleDeny = async (req) => {
        try {
            const getRejectedBy = (status) => {
                if (status === 'PENDING_LAB') return 'LAB_INCHARGE';
                if (status === 'PENDING_ADVISOR') return 'ADVISOR';
                if (status === 'FORWARDED_TO_HOD') return 'HOD';
                return 'LAB_INCHARGE';
            };

            const rejectedBy = getRejectedBy(req.status);
            await odApi.updateStatus(req.id, { 
                status: 'DENIED', 
                rejectedBy: rejectedBy 
            });

            // 3. Refresh Local View
            setPendingRequests((pendingRequests || []).filter(r => r && r.id !== req.id));
        } catch (err) {
            console.error("Deny failed:", err);
            setError("Failed to reject request. Please try again.");
        }
    };

    const handleSaveMetadata = async () => {
        try {
            await miscApi.updateMetadata(editingStudent, editForm);

            setStudentMetadata({
                ...studentMetadata,
                [editingStudent]: editForm
            });

            // Update local data list too
            setData(data.map(s => s.id === editingStudent ? { ...s, ...editForm } : s));
            setEditingStudent(null);
        } catch (err) {
            console.error("Save metadata failed:", err);
        }
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Check if file is CSV
        if (!file.name.endsWith('.csv')) {
            setError('Please upload a valid .csv file.');
            return;
        }
        setError('');

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                const parsed = results.data.map(student => {
                    const cgpa = parseFloat(student.cgpa) || 0;
                    const marks = parseFloat(student.marks) || 0;
                    const score = (cgpa * 10 * 0.6) + (marks * 0.4);

                    return {
                        ...student,
                        cgpa,
                        marks,
                        priorityScore: score,
                        approved: score > 60
                    };
                });

                // Filter by class if Advisor
                const filteredByRole = user.role === 'ADVISOR'
                    ? parsed.filter(s => s.className === user.className)
                    : parsed;

                filteredByRole.sort((a, b) => b.priorityScore - a.priorityScore);
                setData(filteredByRole);
            },
            error: (err) => {
                setError('Error parsing CSV: ' + err.message);
            }
        });
    };

    const handleStopTimer = async (studentId) => {
        const session = coeSessions[studentId];
        if (!session || !session.isActive) return;

        const now = Date.now();
        let accumulatedPauseMs = session.accumulatedPauseMs || 0;
        if (session.isPaused && session.pausedAt) {
            accumulatedPauseMs += now - session.pausedAt;
        }
        const effectiveDurationMs = (now - session.startTime) - accumulatedPauseMs;
        const durationMinutes = Math.max(0, Math.floor(effectiveDurationMs / (1000 * 60)));

        try {
            await sessionApi.updateSession(studentId, {
                isActive: false,
                isPaused: false,
                endTime: now,
                durationMinutes,
                stoppedBy: 'LAB_INCHARGE'
            });

            // Note: Total hours should ideally be calculated by backend on STOP
        } catch (err) { console.error(err); }
    };

    const handlePauseTimer = async (studentId) => {
        const session = coeSessions[studentId];
        if (!session || !session.isActive || session.isPaused) return;

        try {
            await sessionApi.updateSession(studentId, {
                isPaused: true,
                pausedAt: Date.now()
            });
        } catch (err) { console.error(err); }
    };

    const handleResumeTimer = async (studentId) => {
        const session = coeSessions[studentId];
        if (!session || !session.isActive || !session.isPaused) return;

        const now = Date.now();
        const addedPauseMs = session.pausedAt ? now - session.pausedAt : 0;

        try {
            await sessionApi.updateSession(studentId, {
                isPaused: false,
                pausedAt: null,
                accumulatedPauseMs: (session.accumulatedPauseMs || 0) + addedPauseMs
            });
        } catch (err) { console.error(err); }
    };

    const handleStartTimer = async (student) => {
        try {
            await sessionApi.startSession({
                startTime: Date.now(),
                isActive: true,
                isPaused: false,
                pausedAt: null,
                accumulatedPauseMs: 0,
                labName: user.labName,
                studentName: student.name,
                studentId: student.id,
                startedBy: 'MANUAL'
            });
        } catch (err) { console.error(err); }
    };

    /** Returns a HH:MM:SS string for a session's effective elapsed time (excludes paused time). */
    const getElapsedLabel = (session) => {
        if (!session || !session.isActive) return '--:--:--';
        const now = Date.now();
        let accPauseMs = session.accumulatedPauseMs || 0;
        if (session.isPaused && session.pausedAt) {
            accPauseMs += now - session.pausedAt; // current pause window — not yet committed
        }
        const elapsedMs = Math.max(0, (now - session.startTime) - accPauseMs);
        const totalSecs = Math.floor(elapsedMs / 1000);
        const hh = String(Math.floor(totalSecs / 3600)).padStart(2, '0');
        const mm = String(Math.floor((totalSecs % 3600) / 60)).padStart(2, '0');
        const ss = String(totalSecs % 60).padStart(2, '0');
        return `${hh}:${mm}:${ss}`;
    };

    return (
        <div className="max-w-6xl mx-auto py-8">
            {successMessage && (
                <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 animate-bounce">
                    <div className="bg-emerald-600 text-white px-8 py-4 rounded-2xl shadow-2xl flex items-center space-x-3 border border-emerald-400/30">
                        <CheckCircle2 size={24} />
                        <span className="font-black uppercase tracking-widest text-xs">{successMessage}</span>
                    </div>
                </div>
            )}
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-10">
                <div>
                    <h2 className="text-4xl font-extrabold text-white tracking-tight">Management Dashboard</h2>
                    <p className="text-gray-400 mt-2 font-medium">
                        Welcome, <span className="text-blue-400 font-bold">{user?.name}</span>
                        <span className="ml-3 px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded text-[10px] font-black uppercase tracking-widest border border-blue-500/20">
                            {user?.role?.replace('_', ' ')}
                        </span>
                    </p>
                    <div className="flex flex-wrap gap-2 mt-4">
                        {user?.department && (
                            <span className="bg-white/5 text-gray-300 text-xs font-bold px-4 py-1.5 rounded-full border border-white/10 flex items-center shadow-sm">
                                <span className="mr-2">🏢</span> {user.department}
                            </span>
                        )}
                        {user?.className && user?.role === 'ADVISOR' && (
                            <span className="bg-white/5 text-gray-300 text-xs font-bold px-4 py-1.5 rounded-full border border-white/10 flex items-center shadow-sm">
                                <span className="mr-2">🏛️</span> {user.className}
                            </span>
                        )}
                        {user?.labName && user?.role === 'LAB_INCHARGE' && (
                            <span className="bg-white/5 text-gray-300 text-xs font-bold px-4 py-1.5 rounded-full border border-white/10 flex items-center shadow-sm">
                                <span className="mr-2">🔬</span> {user.labName}
                            </span>
                        )}
                    </div>
                </div>

                {user?.role === 'HOD' && user?.id && Array.isArray(notifications) && notifications.filter(n => n && !n.readBy?.includes(user.id)).length > 0 && (
                    <div className="w-full mt-8 animate-fade-in px-4">
                        <div className="flex items-center space-x-3 mb-4">
                            <AlertCircle className="text-amber-500" />
                            <h3 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Priority Approval Stream</h3>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {notifications.filter(n => n && !n.readBy?.includes(user.id)).map(n => (
                                <div key={n.id} className="bg-amber-500/5 border border-amber-500/10 rounded-2xl p-5 flex items-start justify-between group transition-all hover:bg-amber-500/10 active:scale-[0.98]">
                                    <div className="space-y-1 pr-4">
                                        <p className="text-xs font-bold text-gray-300 leading-relaxed italic">"{n.message}"</p>
                                        <span className="text-[8px] font-black text-amber-500/60 uppercase tracking-widest block">{n.createdAt ? new Date(n.createdAt).toLocaleTimeString() : 'Recent'}</span>
                                    </div>
                                    <button 
                                        onClick={async () => {
                                            if (!n.id || !user.id) return;
                                            await notificationApi.markRead(n.id, user.id);
                                            setNotifications(prev => Array.isArray(prev) ? prev.map(nt => nt.id === n.id ? { ...nt, readBy: [...(nt.readBy || []), user.id] } : nt) : []);
                                        }}
                                        className="text-gray-600 hover:text-white p-1 transition-colors"
                                    >
                                        <XCircle size={18} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {(user.role === 'ADVISOR' || user.role === 'HOD') && (
                    <div className="mt-6 md:mt-0 flex-1 md:mx-8 max-w-md relative group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-400 transition-colors" size={20} />
                        <input
                            type="text"
                            placeholder="Search students by Name or ID..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-4 py-3 text-base text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 focus:bg-[#0a0a0b] transition-all shadow-xl shadow-blue-900/10"
                        />
                    </div>
                )}

                {(user.role === 'LAB_INCHARGE' || user.role === 'ADVISOR') && (
                    <button
                        onClick={() => setShowQR(true)}
                        className="mt-6 md:mt-0 flex items-center space-x-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl transition-all shadow-xl shadow-blue-900/20 active:scale-95 group"
                    >
                        <Maximize size={20} className="group-hover:rotate-12 transition-transform" />
                        <span>SHOW LOCATION QR</span>
                    </button>
                )}
            </div>

            {user.role === 'LAB_INCHARGE' && (
                <div className="flex border-b border-white/5 bg-white/[0.02] rounded-t-[2rem] overflow-hidden mb-8">
                    <button
                        onClick={() => setActiveTab('SESSIONS')}
                        className={`flex-1 py-6 text-xs font-black uppercase tracking-[0.2em] transition-all ${activeTab === 'SESSIONS' ? 'text-blue-500 border-b-2 border-blue-500 bg-blue-500/5' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
                    >
                        <div className="flex items-center justify-center"><Clock size={14} className="mr-2" /> Active Sessions</div>
                    </button>
                    <button
                        onClick={() => setActiveTab('UPLOADS')}
                        className={`flex-1 py-6 text-xs font-black uppercase tracking-[0.2em] transition-all ${activeTab === 'UPLOADS' ? 'text-blue-500 border-b-2 border-blue-500 bg-blue-500/5' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
                    >
                        <div className="flex items-center justify-center"><UploadCloud size={14} className="mr-2" /> View Uploads</div>
                    </button>
                </div>
            )}

            {/* Manual Upload Section - Hidden for all now as it's automated */}
            {false && user.role !== 'LAB_INCHARGE' && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 mb-8 text-center">
                    <UploadCloud className="mx-auto h-12 w-12 text-blue-500 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Upload Academic Records</h3>
                    <p className="text-sm text-gray-500 mb-6 max-w-sm mx-auto italic">
                        For ranking students by performance. Use headers: <code className="bg-gray-100 px-1 rounded">name</code>, <code className="bg-gray-100 px-1 rounded">id</code>, <code className="bg-gray-100 px-1 rounded">cgpa</code>, <code className="bg-gray-100 px-1 rounded">marks</code>
                    </p>
                    <label className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg transition-colors inline-block">
                        <span>Select records.csv</span>
                        <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
                    </label>
                    {error && (
                        <div className="mt-4 flex items-center justify-center text-red-600 space-x-2">
                            <AlertCircle size={18} />
                            <span className="text-sm font-medium">{error}</span>
                        </div>
                    )}
                </div>
            )}

            {user.role === 'LAB_INCHARGE' && activeTab === 'SESSIONS' && (
                <>
                    {/* ── Student Tracking Panel ──────────────────────────────── */}
                    {(() => {
                        // Derive signed-in students: those with approved ODs for this lab who have scanned
                        const signedInStudents = globalRequests
                            .filter(r => r.labName === user.labName && (r.status === 'APPROVED' || r.status === 'HOD_APPROVED') && r.scanned)
                            .reduce((acc, r) => {
                                if (!acc.find(s => s.studentId === r.studentId)) acc.push(r);
                                return acc;
                            }, []);

                        if (signedInStudents.length === 0) return null;

                        return (
                            <div className="mb-12 animate-fade-in">
                                <div className="flex items-center space-x-3 mb-6">
                                    <div className="bg-blue-600/20 p-2.5 rounded-2xl text-blue-500">
                                        <User size={22} />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-black text-white tracking-tight">Student Tracking</h3>
                                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Signed-in students with real-time status</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {signedInStudents.map(req => {
                                        const activeBreak = labBreakTimers.find(t => t.studentId === req.studentId && t.status === 'ACTIVE');
                                        const classBreak = labBreakTimers.find(t => t.studentId === req.studentId && t.status === 'PAUSED' && t.stoppedBy === 'CLASS_SCAN');

                                        let status = 'IN_LAB';
                                        let statusLabel = 'In Lab';
                                        let statusColor = 'emerald';
                                        let statusDetail = '';

                                        if (status === 'IN_LAB') {
                                            const presence = livePresence[req.studentId];
                                            if (presence) {
                                                if (presence.type === 'CLASS') {
                                                    status = 'IN_CLASS';
                                                    statusLabel = 'In Class';
                                                    statusColor = 'blue';
                                                    statusDetail = presence.name;
                                                } else if (presence.type === 'LAB' && presence.name !== user.labName) {
                                                    status = 'IN_OTHER_LAB';
                                                    statusLabel = 'In Other Lab';
                                                    statusColor = 'amber';
                                                    statusDetail = presence.name;
                                                }
                                            }
                                        }

                                        if (activeBreak) {
                                            status = 'IN_BREAK';
                                            statusLabel = 'In Break';
                                            statusColor = 'amber';
                                            const remaining = Math.max(0, Math.floor((new Date(activeBreak.expiresAt) - Date.now()) / 1000));
                                            const mins = Math.floor(remaining / 60);
                                            const secs = remaining % 60;
                                            statusDetail = `${mins}m ${secs}s remaining`;
                                        } else if (classBreak && classBreak.classAttendance) {
                                            const classEnd = new Date(classBreak.classAttendance.endTime);
                                            if (classEnd > new Date()) {
                                                status = 'IN_CLASS';
                                                statusLabel = 'In Class';
                                                statusColor = 'blue';
                                                statusDetail = classBreak.classAttendance.className;
                                            }
                                        }

                                        const isExpanded = expandedTrackingId === req.studentId;

                                        return (
                                            <div
                                                key={`track_${req.studentId}`}
                                                onClick={() => setExpandedTrackingId(isExpanded ? null : req.studentId)}
                                                className={`p-5 rounded-3xl border cursor-pointer transition-all hover:scale-[1.01] bg-[#141417] ${
                                                    statusColor === 'emerald' ? 'border-emerald-500/20 shadow-emerald-900/5' :
                                                    statusColor === 'amber' ? 'border-amber-500/20 shadow-amber-900/10' :
                                                    'border-blue-500/20 shadow-blue-900/10'
                                                } shadow-lg`}
                                            >
                                                <div className="flex justify-between items-center">
                                                    <div>
                                                        <h4 className="text-sm font-black text-white">{req.studentName}</h4>
                                                        <p className="text-[10px] text-gray-500 font-mono">{req.studentId}</p>
                                                    </div>
                                                    <span className={`flex items-center space-x-1.5 text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full border ${
                                                        statusColor === 'emerald' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
                                                        statusColor === 'amber' ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' :
                                                        'text-blue-400 bg-blue-500/10 border-blue-500/20'
                                                    }`}>
                                                        <span className={`w-2 h-2 rounded-full ${
                                                            statusColor === 'emerald' ? 'bg-emerald-500' :
                                                            statusColor === 'amber' ? 'bg-amber-500 animate-pulse' :
                                                            'bg-blue-500'
                                                        }`}></span>
                                                        <span>{statusLabel}</span>
                                                    </span>
                                                </div>

                                                {isExpanded && (
                                                    <div className="mt-4 pt-4 border-t border-white/5 space-y-2">
                                                        <div className="flex justify-between text-[10px]">
                                                            <span className="text-gray-500 font-bold uppercase tracking-widest">Current Status</span>
                                                            <span className={`font-black ${
                                                                statusColor === 'emerald' ? 'text-emerald-400' :
                                                                statusColor === 'amber' ? 'text-amber-400' :
                                                                'text-blue-400'
                                                            }`}>
                                                                {req.studentName} is currently {statusLabel}
                                                            </span>
                                                        </div>
                                                        {statusDetail && (
                                                            <div className="flex justify-between text-[10px]">
                                                                <span className="text-gray-500 font-bold uppercase tracking-widest">
                                                                    {status === 'IN_BREAK' ? 'Timer' : 'Location'}
                                                                </span>
                                                                <span className="text-white font-bold">{statusDetail}</span>
                                                            </div>
                                                        )}
                                                        <div className="flex justify-between text-[10px]">
                                                            <span className="text-gray-500 font-bold uppercase tracking-widest">OD Slot</span>
                                                            <span className="text-white font-bold">{req.timeSlot || `${req.inTime} - ${req.outTime}`}</span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })()}
                    {Object.values(coeSessions).filter(s => s.labName === user.labName && s.isActive).length > 0 ? (
                        <div className="mb-12 animate-fade-in">
                            <h3 className="text-xl font-bold text-emerald-500 mb-6 flex items-center">
                                <Clock className="text-emerald-500 mr-2" />
                                Active Lab Sessions
                                <span className="ml-3 text-[10px] text-gray-500 font-medium normal-case tracking-normal">
                                    — Pause timer during breaks; GPS auto-stop will not fire while paused
                                </span>
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {Object.values(coeSessions).filter(s => s.labName === user.labName && s.isActive).map(session => (
                                    <div
                                        key={`session_${session.studentId}`}
                                        className={`p-6 rounded-3xl border shadow-2xl bg-[#141417] transition-all ${session.isPaused
                                            ? 'border-amber-500/30 shadow-amber-900/10'
                                            : 'border-emerald-500/20 shadow-emerald-900/5'
                                            }`}
                                    >
                                        <div className="flex justify-between items-start mb-4">
                                            <div>
                                                <h4 className="text-lg font-bold text-white">{session.studentName}</h4>
                                                <p className="text-xs text-gray-500 font-mono">{session.studentId}</p>
                                                {session.startedBy === 'QR_SCAN' && (
                                                    <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Started via QR Scan</span>
                                                )}
                                            </div>
                                            {/* Status badge */}
                                            {session.isPaused ? (
                                                <span className="flex items-center space-x-1 text-[10px] font-black text-amber-400 uppercase tracking-widest bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full">
                                                    <FiPause size={10} />
                                                    <span>Paused</span>
                                                </span>
                                            ) : (
                                                <span className="flex items-center space-x-1 text-[10px] font-black text-emerald-400 uppercase tracking-widest">
                                                    <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                                                    <span>Live</span>
                                                </span>
                                            )}
                                        </div>

                                        {/* Elapsed Time Display */}
                                        <div className={`text-center py-3 rounded-2xl mb-4 ${session.isPaused
                                            ? 'bg-amber-500/5 border border-amber-500/10'
                                            : 'bg-emerald-500/5 border border-emerald-500/10'
                                            }`}>
                                            <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1">Effective Working Time</p>
                                            <p className={`text-2xl font-black tabular-nums tracking-tight ${session.isPaused ? 'text-amber-400' : 'text-emerald-400'
                                                }`}>{getElapsedLabel(session)}</p>
                                        </div>

                                        {/* Action Buttons */}
                                        <div className="flex gap-3">
                                            {session.isPaused ? (
                                                <button
                                                    onClick={() => handleResumeTimer(session.studentId)}
                                                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-emerald-600/10 text-emerald-500 border border-emerald-600/20 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-600 hover:text-white transition-all active:scale-95"
                                                >
                                                    <FiPlay size={12} /> Resume
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => handlePauseTimer(session.studentId)}
                                                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-amber-500 hover:text-black transition-all active:scale-95"
                                                >
                                                    <FiPause size={12} /> Pause
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleStopTimer(session.studentId)}
                                                className="px-6 py-3 bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all active:scale-95"
                                            >
                                                <XCircle size={12} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="bg-white/5 border border-white/5 rounded-[2.5rem] p-12 text-center mb-12">
                            <Clock className="mx-auto text-gray-700 mb-4" size={48} />
                            <p className="text-gray-500 font-black text-xs uppercase tracking-widest">No active lab sessions</p>
                            <p className="text-gray-600 text-[10px] mt-2 font-medium">Sessions start automatically when students scan the lab QR code</p>
                        </div>
                    )}

                    {/* Manual Timer Start Search Box */}
                    <div className="bg-blue-500/5 border border-blue-500/20 rounded-[2.5rem] p-10 mb-12 animate-fade-in">
                        <div className="flex items-center space-x-4 mb-8">
                            <div className="bg-blue-600/20 p-3 rounded-2xl text-blue-500">
                                <Maximize size={24} />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-white tracking-tight">Manual Session Activation</h3>
                                <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">Search student to manually start working hours</p>
                            </div>
                        </div>

                        <div className="relative mb-6">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
                            <input
                                type="text"
                                placeholder="Enter Student Name or ID..."
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-black/20 border border-white/5 rounded-2xl pl-12 pr-4 py-4 text-white focus:border-blue-500/50 transition-all font-bold"
                            />
                        </div>

                        {searchTerm.length >= 2 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                                {data.filter(s =>
                                    (s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.id.toLowerCase().includes(searchTerm.toLowerCase())) &&
                                    !coeSessions[s.id]?.isActive
                                ).slice(0, 10).map(student => (
                                    <div key={`search_${student.id}`} className="p-5 bg-white/5 border border-white/5 rounded-[1.5rem] flex justify-between items-center group hover:bg-white/10 transition-all">
                                        <div>
                                            <h4 className="text-sm font-black text-white">{student.name}</h4>
                                            <p className="text-[10px] text-gray-500 font-mono">{student.id} • {student.className}</p>
                                        </div>
                                        <button
                                            onClick={() => handleStartTimer(student)}
                                            className="px-4 py-2 bg-blue-600 text-white font-black text-[9px] uppercase tracking-widest rounded-xl hover:bg-blue-500 transition-all shadow-lg shadow-blue-900/40"
                                        >
                                            Start Session
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            )}

            {user.role === 'LAB_INCHARGE' && activeTab === 'UPLOADS' && (
                <div className="bg-[#141417] rounded-3xl shadow-2xl border border-white/5 overflow-hidden mb-12 animate-fade-in">
                    <div className="p-8 border-b border-white/5 bg-white/[0.01]">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                            <div className="flex space-x-2 bg-black/20 p-1.5 rounded-2xl border border-white/5">
                                {['1st', '2nd', '3rd', '4th'].map(year => (
                                    <button
                                        key={year}
                                        onClick={() => { setSelectedYear(year); setSearchTerm(''); }}
                                        className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${selectedYear === year ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
                                    >
                                        {year} Year
                                    </button>
                                ))}
                            </div>
                            <div className="relative group max-w-sm w-full">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-400 transition-colors" size={18} />
                                <input
                                    type="text"
                                    placeholder="Search in selected year..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-4 py-3 text-xs text-white focus:outline-none focus:border-blue-500/50"
                                />
                            </div>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-white/5">
                            <thead className="bg-[#1c1c21]">
                                <tr>
                                    <th className="px-8 py-5 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Student</th>
                                    <th className="px-8 py-5 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">ID</th>
                                    <th className="px-8 py-5 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Class</th>
                                    <th className="px-8 py-5 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Status</th>
                                    <th className="px-8 py-5 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">COE Hours</th>
                                    <th className="px-8 py-5 text-right text-[10px] font-black text-gray-500 uppercase tracking-widest">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {data.filter(s =>
                                    s.yearOfStudy === selectedYear && (
                                        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                        s.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                        (s.className || '').toLowerCase().includes(searchTerm.toLowerCase())
                                    )
                                ).sort((a, b) => {
                                    const countA = uploadCounts[a.id] || 0;
                                    const countB = uploadCounts[b.id] || 0;
                                    
                                    // Primary sort: Students with uploads first
                                    if (countA > 0 && countB === 0) return -1;
                                    if (countA === 0 && countB > 0) return 1;
                                    
                                    // Secondary sort: Number of uploads descending
                                    if (countA !== countB) return countB - countA;
                                    
                                    // Tertiary sort: COE Hours descending
                                    return (b.coeHours || 0) - (a.coeHours || 0);
                                }).map((student) => {
                                    const portfolioKey = `${student.className}__${student.id}`;
                                    const uploadsList = studentPortfolios[portfolioKey] || [];
                                    const uploadCountFromSummary = uploadCounts[student.id] || 0;
                                    const hasUploads = uploadCountFromSummary > 0 || uploadsList.length > 0;
                                    const displayUploadCount = Math.max(uploadCountFromSummary, uploadsList.length);

                                    const handleOpenPortfolio = async () => {
                                        try {
                                            const works = await uploadApi.getUploads(student.id);
                                            setStudentPortfolios(prev => ({ ...prev, [portfolioKey]: works }));
                                            setSelectedStudentPortfolio({ student, works });
                                        } catch (err) {
                                            console.error("Failed to fetch portfolio:", err);
                                        }
                                    };

                                    return (
                                        <tr key={portfolioKey} className="hover:bg-white/[0.02] transition-colors group">
                                            <td className="px-8 py-6 whitespace-nowrap cursor-pointer hover:bg-white/5" onClick={handleOpenPortfolio}>
                                                <span className={`text-sm font-black uppercase tracking-tight group-hover:text-amber-400 transition-colors ${hasUploads ? 'text-blue-400' : 'text-red-500'}`}>
                                                    {student.name}
                                                </span>
                                            </td>
                                            <td className="px-8 py-6 whitespace-nowrap font-mono text-xs text-gray-500">{student.id}</td>
                                            <td className="px-8 py-6 whitespace-nowrap">
                                                <span className="text-[10px] font-black text-gray-400 bg-white/5 px-3 py-1 rounded-lg border border-white/10">{student.className}</span>
                                            </td>
                                            <td className="px-8 py-6 whitespace-nowrap">
                                                <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full border ${hasUploads ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>
                                                    {hasUploads ? `${displayUploadCount} Uploads` : 'Zero Research Work'}
                                                </span>
                                            </td>
                                            <td className="px-8 py-6 whitespace-nowrap">
                                                <span className="text-[12px] font-black text-blue-400">
                                                    {student.coeHours ? student.coeHours.toFixed(1) : '0.0'} hrs
                                                </span>
                                            </td>
                                            <td className="px-8 py-6 whitespace-nowrap text-right">
                                                <button
                                                    onClick={handleOpenPortfolio}
                                                    className="text-[10px] font-black uppercase text-blue-400 hover:text-white transition-colors"
                                                >
                                                    Open Records
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}


            {pendingRequests.length > 0 && (
                <div className="mb-12 animate-fade-in">
                    <h3 className="text-xl font-bold text-white mb-6 flex items-center">
                        <CheckCircle2 className="text-blue-500 mr-2" />
                        Pending Approvals Required
                    </h3>
                    <div className="grid grid-cols-1 gap-4">
                        {pendingRequests.map(req => (
                            <div key={req.id} className={`p-6 rounded-3xl border shadow-2xl transition-all bg-[#141417] ${(req.priorityScore || 0) >= 75 ? 'border-blue-500/20' : 'border-red-500/20'
                                }`}>
                                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                                    <div className="space-y-2">
                                        <div className="flex items-center space-x-3">
                                            <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest ${(req.priorityScore || 0) >= 75 ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'
                                                }`}>
                                                {(req.priorityScore || 0) >= 75 ? 'High Performer' : 'Low Performer'}
                                            </span>
                                            <span className="text-xs font-bold text-gray-600">Request #{(req.id?.toString() || '??').slice(-4)}</span>
                                        </div>
                                        <h4 className="text-xl font-bold text-white">{req.studentName} <span className="text-sm font-medium text-gray-500">({req.studentId})</span></h4>
                                        <div className="text-xs font-mono text-gray-400">Score: {typeof req.priorityScore === 'number' ? req.priorityScore.toFixed(1) : 'N/A'} | Dept: {req.department || 'Unknown'}</div>
                                        <div className="text-base text-gray-300 font-medium italic">"{req.purpose || 'No purpose provided'}"</div>
                                    </div>
                                    <div className="flex items-center space-x-4">
                                        <button onClick={() => handleDeny(req)} className="px-6 py-3 text-sm font-bold text-red-500 bg-red-500/5 border border-red-500/20 rounded-xl hover:bg-red-500/10 transition-colors">REJECT</button>
                                        <button onClick={() => handleApprove(req)} className="px-8 py-3 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-500 shadow-lg shadow-blue-900/20 transition-all active:scale-95">APPROVE & FORWARD</button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {user.role !== 'LAB_INCHARGE' && data.length > 0 && (
                <div className="bg-[#141417] rounded-3xl shadow-2xl border border-white/5 overflow-hidden">
                    <div className="px-8 py-6 border-b border-white/5 bg-white/5 flex items-center justify-between">
                        <div>
                            <h3 className="text-xl font-bold text-white">Student Academic Roster</h3>
                            {user?.role === 'HOD' && (
                                <div className="flex space-x-2 bg-black/40 p-1.5 rounded-2xl border border-white/5 mt-4">
                                    {['1st', '2nd', '3rd', '4th'].map(year => (
                                        <button
                                            key={year}
                                            onClick={() => { setSelectedYear(year); setSearchTerm(''); }}
                                            className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${selectedYear === year ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
                                        >
                                            {year} Year
                                        </button>
                                    ))}
                                </div>
                            )}
                            {(user.role === 'ADVISOR' || user.role === 'HOD' || user.role === 'LAB_INCHARGE') && (
                                <p className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] mt-1 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20 inline-block animate-pulse">
                                    ● {user.role.replace('_', ' ')} EDIT MODE ACTIVE
                                </p>
                            )}
                        </div>
                        <div className="flex items-center">
                            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{data.length} Total Students</span>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-white/5">
                            <thead className="bg-[#1c1c21]">
                                <tr>
                                    <th scope="col" className="px-8 py-5 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Rank</th>
                                    <th scope="col" className="px-8 py-5 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Student</th>
                                    <th scope="col" className="px-8 py-5 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Class</th>
                                    {(user.role === 'ADVISOR' || user.role === 'HOD' || user.role === 'LAB_INCHARGE') && (
                                        <th scope="col" className="px-8 py-5 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Action</th>
                                    )}
                                    <th scope="col" className="px-8 py-5 text-left text-xs font-black text-gray-500 uppercase tracking-widest">ID</th>
                                    <th scope="col" className="px-8 py-5 text-left text-xs font-black text-gray-500 uppercase tracking-widest">COE Hours</th>
                                    <th scope="col" className="px-8 py-5 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Progress</th>
                                    <th scope="col" className="px-8 py-5 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Achievements</th>
                                    <th scope="col" className="px-8 py-5 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Remarks</th>
                                    <th scope="col" className="px-8 py-5 text-left text-xs font-black text-gray-500 uppercase tracking-widest">CGPA</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {data.filter(s => {
                                    const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                                        s.id.toLowerCase().includes(searchTerm.toLowerCase());
                                    if (user?.role === 'HOD') {
                                        return s.yearOfStudy === selectedYear && matchesSearch;
                                    }
                                    return matchesSearch;
                                }).sort((a, b) => {
                                    if (user?.role === 'HOD') {
                                        // Sort by class first, then by CGPA descending
                                        if (a.className !== b.className) {
                                            return (a.className || '').localeCompare(b.className || '');
                                        }
                                        return (b.cgpa || 0) - (a.cgpa || 0);
                                    }
                                    return (b.cgpa || 0) - (a.cgpa || 0);
                                }).map((student, idx) => (
                                    <React.Fragment key={idx}>
                                        <tr
                                            className={`hover:bg-white/[0.04] transition-colors cursor-pointer ${expandedStudentId === student.id ? 'bg-white/[0.03]' : ''}`}
                                            onClick={() => setExpandedStudentId(expandedStudentId === student.id ? null : student.id)}
                                        >
                                            <td className="px-8 py-6 whitespace-nowrap text-sm font-bold text-gray-500">#{idx + 1}</td>
                                            <td className="px-8 py-6 whitespace-nowrap">
                                                <div className="flex flex-col">
                                                    <div className="flex items-center space-x-2">
                                                        <span className="text-base font-bold text-white">{student.name}</span>
                                                        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${student.approved
                                                            ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                                            : 'bg-red-500/10 text-red-400 border-red-500/20'
                                                            }`}>{student.approved ? 'OD Eligible' : 'Not Eligible'}</span>
                                                    </div>
                                                    {livePresence[student.id] ? (() => {
                                                        const presence = livePresence[student.id];
                                                        if (presence.type === 'LAB') {
                                                            return (
                                                                <span className="inline-flex items-center text-[10px] font-black uppercase px-2 py-1 rounded mt-2 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 animate-pulse">
                                                                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mr-2 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
                                                                    LIVE: {presence.name}
                                                                </span>
                                                            );
                                                        } else {
                                                            return (
                                                                <span className="inline-flex items-center text-[10px] font-black uppercase px-2 py-1 rounded mt-2 bg-amber-500/10 text-amber-500 border border-amber-500/20">
                                                                    <User size={10} className="mr-1" /> IN CLASS: {presence.name}
                                                                </span>
                                                            );
                                                        }
                                                    })() : (
                                                        <span className="text-[11px] text-gray-600 font-medium italic mt-2">Status Offline</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-8 py-6 whitespace-nowrap">
                                                <span className="text-[10px] font-black text-gray-400 bg-white/5 px-3 py-1 rounded-lg border border-white/10 uppercase tracking-widest font-mono italic">{student.className}</span>
                                            </td>
                                            {(user.role === 'ADVISOR' || user.role === 'HOD' || user.role === 'LAB_INCHARGE') && (
                                                <td className="px-8 py-6 whitespace-nowrap">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setEditingStudent(student.id);
                                                            setEditForm({
                                                                achievements: student.achievements === 'N/A' ? '' : student.achievements,
                                                                remarks: student.remarks === 'N/A' ? '' : student.remarks
                                                            });
                                                        }}
                                                        className="px-4 py-2 text-[10px] font-black text-blue-400 bg-blue-500/10 border border-blue-500/20 uppercase tracking-widest rounded-lg hover:bg-blue-500/20 transition-all active:scale-95 shadow-sm"
                                                    >
                                                        Edit Info
                                                    </button>
                                                </td>
                                            )}
                                            <td className="px-8 py-6 whitespace-nowrap text-sm text-gray-400 font-mono font-bold tracking-tighter">{student.id}</td>
                                            <td className="px-8 py-6 whitespace-nowrap text-sm text-gray-300 font-bold">
                                                <div className="flex items-center text-emerald-400">
                                                    <Clock size={12} className="mr-1.5" />
                                                    {student.coeHours} hrs
                                                </div>
                                            </td>
                                            <td className="px-8 py-6 whitespace-nowrap text-sm text-gray-300 font-bold">
                                                <div className="w-24 bg-white/5 rounded-full h-1.5 overflow-hidden border border-white/5">
                                                    <div
                                                        className="bg-blue-500 h-full rounded-full shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                                                        style={{ width: `${student.workProgress}%` }}
                                                    ></div>
                                                </div>
                                                <div className="text-[10px] mt-1 text-gray-500 font-black uppercase tracking-widest">{student.workProgress}% Done</div>
                                            </td>
                                            <td className="px-8 py-6 whitespace-nowrap text-sm text-gray-300 font-medium max-w-[150px] truncate">
                                                <div className="flex items-center">
                                                    {student.achievements}
                                                    {expandedStudentId === student.id ? <ChevronUp className="ml-2 text-gray-500" /> : <ChevronDown className="ml-2 text-gray-500" />}
                                                </div>
                                            </td>
                                            <td className="px-8 py-6 whitespace-nowrap text-sm text-gray-300 font-medium max-w-[150px] truncate">{student.remarks}</td>
                                            <td className="px-8 py-6 whitespace-nowrap text-base text-gray-300 font-bold">{student.cgpa.toFixed(2)}</td>
                                        </tr>
                                        {expandedStudentId === student.id && (
                                            <tr className="bg-white/[0.02]">
                                                <td colSpan={(user.role === 'ADVISOR' || user.role === 'HOD' || user.role === 'LAB_INCHARGE') ? 10 : 9} className="px-8 py-8">
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10 animate-fade-in">
                                                        <div className="space-y-4">
                                                            <div className="flex items-center space-x-2 text-[10px] font-black text-blue-400 uppercase tracking-widest">
                                                                <Maximize size={12} />
                                                                <span>Academic Achievements</span>
                                                            </div>
                                                            <p className="text-gray-200 text-sm leading-relaxed font-medium bg-white/5 p-6 rounded-2xl border border-white/5">
                                                                {student.achievements === 'N/A' ? 'No achievements recorded.' : student.achievements}
                                                            </p>
                                                        </div>
                                                        <div className="space-y-4">
                                                            <div className="flex items-center space-x-2 text-[10px] font-black text-amber-400 uppercase tracking-widest">
                                                                <Clock size={12} />
                                                                <span>Faculty Remarks</span>
                                                            </div>
                                                            <p className="text-gray-300 text-sm leading-relaxed font-medium italic bg-white/5 p-6 rounded-2xl border border-white/5">
                                                                "{student.remarks === 'N/A' ? 'Maintain positive momentum.' : student.remarks}"
                                                            </p>
                                                        </div>
                                                        {user.role === 'HOD' && (
                                                            <div className="space-y-4 md:col-span-2 lg:col-span-1">
                                                                <div className="flex items-center space-x-2 text-[10px] font-black text-emerald-400 uppercase tracking-widest">
                                                                    <Clock size={12} />
                                                                    <span>COE Working Hour Details</span>
                                                                </div>
                                                                <div className="bg-white/5 p-6 rounded-2xl border border-white/5 space-y-4">
                                                                    <div className="flex items-end justify-between">
                                                                        <div>
                                                                            <span className="text-3xl font-black text-emerald-400">{student.coeHours}</span>
                                                                            <span className="text-xs font-bold text-gray-500 ml-2">HOURS TOTAL</span>
                                                                        </div>
                                                                        <div className="text-right">
                                                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Target Progress</span>
                                                                            <span className="text-sm font-bold text-gray-300">{student.workProgress}%</span>
                                                                        </div>
                                                                    </div>
                                                                    <div className="w-full bg-white/5 rounded-full h-3 overflow-hidden border border-white/5 shadow-inner">
                                                                        <div
                                                                            className="bg-emerald-500 h-full rounded-full shadow-[0_0_15px_rgba(16,185,129,0.4)] transition-all duration-1000"
                                                                            style={{ width: `${student.workProgress}%` }}
                                                                        ></div>
                                                                    </div>
                                                                    <p className="text-[10px] text-gray-500 font-medium italic">* This data represents verified industry-standard working hours tracked through the portal.</p>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {showQR && (() => {
                const locationName = user.role === 'LAB_INCHARGE' ? user.labName : user.className;
                const locData = locationMap[locationName] || { floor: 'Unknown Floor', bssid: 'N/A' };
                const qrValue = JSON.stringify({
                    type: user.role === 'LAB_INCHARGE' ? 'LAB' : 'CLASS',
                    name: locationName,
                    id: user.id,
                    floor: locData.floor,
                    bssid: locData.bssid,
                    scanType: qrType
                });

                return (
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-xl z-[100] flex items-center justify-center p-6 animate-fade-in">
                        <div className="bg-[#141417] border border-white/10 rounded-[3rem] p-12 text-center shadow-[0_0_100px_rgba(59,130,246,0.15)] max-w-lg w-full relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-8">
                                <button onClick={() => setShowQR(false)} className="text-gray-500 hover:text-white transition-colors">
                                    <XCircle size={32} />
                                </button>
                            </div>

                            <div className="mb-10">
                                <p className="text-blue-500 font-black text-xs uppercase tracking-[0.3em] mb-4">Location QR Generator</p>
                                <h3 className="text-4xl font-extrabold text-white">{locationName}</h3>
                                <div className="flex justify-center items-center space-x-3 mt-3 text-gray-500 font-bold uppercase text-[10px] tracking-widest">
                                    <span className="flex items-center"><MapPin size={12} className="mr-1" /> {locData.floor}</span>
                                    <span>•</span>
                                    <span>BSSID: {locData.bssid}</span>
                                </div>
                            </div>

                            {user.role === 'LAB_INCHARGE' && (
                                <div className="flex justify-center mb-6 space-x-2 bg-white/5 p-1 rounded-2xl border border-white/5">
                                    <button 
                                        onClick={() => setQrType('ENTRY')} 
                                        className={`flex-1 py-3 px-6 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${qrType === 'ENTRY' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/40' : 'text-gray-500 hover:text-white hover:bg-white/10'}`}
                                    >
                                        ENTRY QR
                                    </button>
                                    <button 
                                        onClick={() => setQrType('EXIT')} 
                                        className={`flex-1 py-3 px-6 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${qrType === 'EXIT' ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/40' : 'text-gray-500 hover:text-white hover:bg-white/10'}`}
                                    >
                                        EXIT QR
                                    </button>
                                </div>
                            )}

                            <div className={`p-6 rounded-[2.5rem] inline-block mb-10 shadow-2xl transition-all duration-500 ${qrType === 'ENTRY' ? 'bg-white' : 'bg-amber-100 ring-4 ring-amber-500/50'}`}>
                                <QRCodeSVG value={qrValue} size={240} level="H" includeMargin={false} fgColor={qrType === 'ENTRY' ? '#000000' : '#d97706'} />
                            </div>

                            <p className="text-gray-500 text-sm font-medium mb-8 leading-relaxed max-w-xs mx-auto">
                                Students must scan this <span className={qrType === 'ENTRY' ? 'text-emerald-500 font-bold' : 'text-amber-500 font-bold'}>{qrType}</span> code using their SmartOD portal to verify real-time presence.
                            </p>

                            <button
                                onClick={() => setShowQR(false)}
                                className="w-full py-5 bg-white text-black hover:bg-gray-200 font-black uppercase tracking-widest text-xs rounded-2xl transition-all shadow-xl active:scale-95"
                            >
                                CLOSE DASHBOARD
                            </button>
                        </div>
                    </div>
                );
            })()}

            {/* Edit Metadata Modal */}
            {editingStudent && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-xl z-[110] flex items-center justify-center p-6 animate-fade-in">
                    <div className="bg-[#141417] border border-white/10 rounded-[3rem] p-12 shadow-[0_0_100px_rgba(59,130,246,0.15)] max-w-lg w-full relative">
                        <h3 className="text-3xl font-extrabold text-white mb-8">Update Student Info</h3>
                        <div className="space-y-6">
                            <div>
                                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">Academic Achievements</label>
                                <textarea
                                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white font-medium focus:border-blue-500 outline-none transition-all resize-none h-32"
                                    placeholder="e.g. Winner of Smart India Hackathon"
                                    value={editForm.achievements}
                                    onChange={e => setEditForm({ ...editForm, achievements: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">Faculty Remarks</label>
                                <textarea
                                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white font-medium focus:border-blue-500 outline-none transition-all resize-none h-32"
                                    placeholder="e.g. Highly disciplined and proactive"
                                    value={editForm.remarks}
                                    onChange={e => setEditForm({ ...editForm, remarks: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="flex gap-4 mt-10">
                            <button
                                onClick={() => setEditingStudent(null)}
                                className="flex-1 py-4 text-gray-400 font-black uppercase tracking-widest text-xs rounded-2xl hover:bg-white/5 transition-all"
                            >
                                CANCEL
                            </button>
                            <button
                                onClick={handleSaveMetadata}
                                className="flex-1 py-4 bg-blue-600 text-white font-black uppercase tracking-widest text-xs rounded-2xl hover:bg-blue-500 transition-all shadow-xl shadow-blue-900/20"
                            >
                                SAVE UPDATES
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {selectedStudentPortfolio && (
                <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-[#0a0a0b]/90 backdrop-blur-xl animate-fade-in">
                    <div className="bg-[#141417] rounded-[3rem] shadow-2xl w-full max-w-4xl border border-white/5 overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="p-8 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
                            <div>
                                <h3 className="text-2xl font-black text-white tracking-tight uppercase">{selectedStudentPortfolio.student.name}'s Portfolio</h3>
                                <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mt-1">Total {selectedStudentPortfolio.works.length} research entries found</p>
                            </div>
                            <button onClick={() => setSelectedStudentPortfolio(null)} className="p-3 hover:bg-white/5 rounded-2xl text-gray-400 transition-colors">
                                <XCircle size={24} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                            {selectedStudentPortfolio.works.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {selectedStudentPortfolio.works.map(work => (
                                        <div key={work.id} onClick={() => setViewingWork(work)} className="p-6 bg-white/5 border border-white/5 rounded-2xl hover:bg-white/[0.08] transition-all cursor-pointer group">
                                            <div className="flex items-center justify-between mb-4">
                                                <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">{work.uploadDate}</span>
                                                <Calendar size={14} className="text-gray-600" />
                                            </div>
                                            <h4 className="text-lg font-bold text-white group-hover:text-amber-400 transition-colors uppercase truncate">{work.topic}</h4>
                                            <p className="text-xs text-gray-500 mt-2 line-clamp-2 italic">"{work.description || 'No description provided'}"</p>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-20 bg-white/5 rounded-3xl border border-dashed border-white/10">
                                    <AlertCircle className="mx-auto text-red-500/50 mb-4" size={48} />
                                    <p className="text-gray-500 font-black text-xs uppercase tracking-widest">No work uploaded by this student yet</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {viewingWork && (
                <div className="fixed inset-0 z-[160] flex items-center justify-center p-6 bg-black/95 backdrop-blur-2xl animate-fade-in">
                    <div className="bg-[#141417] rounded-[3rem] shadow-2xl w-full max-w-2xl border border-white/5 overflow-hidden">
                        <div className="p-10 text-center">
                            <h3 className="text-3xl font-black text-white tracking-tight mb-2 uppercase">{viewingWork.topic}</h3>
                            <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-8">{viewingWork.uploadDate} • {viewingWork.size}</p>

                            <div className="bg-white/5 p-8 rounded-3xl border border-white/5 text-left mb-8 max-h-96 overflow-y-auto custom-scrollbar">
                                <p className="text-sm font-medium text-gray-300 leading-relaxed whitespace-pre-wrap">
                                    {viewingWork.isComposed ? viewingWork.content : viewingWork.description || 'No description available for this asset.'}
                                </p>
                            </div>

                            <button onClick={() => setViewingWork(null)} className="w-full py-5 bg-white/5 text-gray-400 font-black rounded-2xl text-xs uppercase tracking-widest hover:bg-white/10 transition-all border border-white/5">
                                Close Work Details
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style dangerouslySetInnerHTML={{
                __html: `
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.02); }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(37, 99, 235, 0.2); border-radius: 10px; }
            `}} />
        </div>
    );
};

export default AdminDashboard;
