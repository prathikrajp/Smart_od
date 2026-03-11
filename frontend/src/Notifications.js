import React, { useState, useEffect, useRef } from 'react';
import { FiBell, FiCheckCircle, FiXCircle, FiClock, FiInfo } from 'react-icons/fi';
import { odApi, miscApi, presenceApi } from './api';

const Notifications = ({ user }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [readIds, setReadIds] = useState(JSON.parse(localStorage.getItem(`read_notifications_${user.id}`) || '[]'));
    const dropdownRef = useRef(null);

    useEffect(() => {
        const fetchNotifications = async () => {
            try {
                // Fetch from Backend instead of localStorage
                const [allRequests, allViolations, allPresence] = await Promise.all([
                    odApi.getAllRequests(),
                    miscApi.getViolations(),
                    presenceApi.getPresenceLogs ? presenceApi.getPresenceLogs() : Promise.resolve([])
                ]);

                const safeRequests = Array.isArray(allRequests) ? allRequests : [];
                const safeViolations = Array.isArray(allViolations) ? allViolations : [];
                const safePresence = Array.isArray(allPresence) ? allPresence : [];

                let filtered = [];

                if (user.role === 'STUDENT') {
                    filtered = safeRequests
                        .filter(r => r.studentId === user.id)
                        .map(r => ({
                            id: `${r.id}_${r.status}`,
                            title: r.status === 'APPROVED' ? 'OD Approved' : r.status === 'DENIED' ? 'OD Denied' : 'OD Status Updated',
                            message: `Your request for "${r.purpose}" is now ${r.status?.replace(/_/g, ' ')}.`,
                            status: r.status,
                            time: r.requestedAt
                        }));
                } else if (user.role === 'LAB_INCHARGE') {
                    // 1. Pending OD Requests
                    const odNotifs = safeRequests
                        .filter(r => r.labName === user.labName && r.status === 'PENDING_LAB')
                        .map(r => ({
                            id: `${r.id}_pending_lab`,
                            title: 'New OD Request',
                            message: `${r.studentName} has requested access for ${r.labName}.`,
                            status: 'PENDING',
                            time: r.requestedAt
                        }));

                    // 2. Digital Sign-ins (from Presence logs)
                    const signInNotifs = safePresence
                        .filter(p => p.name === user.labName && p.type === 'LAB')
                        .map(p => ({
                            id: `signin_${p.studentId}_${p.timestamp}`,
                            title: 'Digital Sign-in',
                            message: `${p.studentName || p.studentId} digitally signed in into ${p.name} at ${new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`,
                            status: 'APPROVED',
                            time: p.timestamp
                        }));
                    
                    filtered = [...odNotifs, ...signInNotifs];
                } else if (user.role === 'ADVISOR') {
                    // 1. Pending OD Requests
                    const odNotifs = safeRequests
                        .filter(r => r.className === user.className && r.status === 'PENDING_ADVISOR')
                        .map(r => ({
                            id: `${r.id}_pending_advisor`,
                            title: 'OD Request Forwarded',
                            message: `New OD request from ${r.studentName} forwarded by Lab Incharge.`,
                            status: 'PENDING',
                            time: r.requestedAt
                        }));

                    // 2. Digital Sign-ins (for students in this advisor's class)
                    const signInNotifs = safePresence
                        .filter(p => p.advisorName === user.name && p.type === 'LAB')
                        .map(p => ({
                            id: `advisor_signin_${p.studentId}_${p.timestamp}`,
                            title: 'Student Lab Entry',
                            message: `${p.studentName || p.studentId} digitally signed in into ${p.name} at ${new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`,
                            status: 'APPROVED',
                            time: p.timestamp
                        }));

                    filtered = [...odNotifs, ...signInNotifs];
                } else if (user.role === 'HOD') {
                    // Include both pending validation AND auto-approvals for High CGPA
                    filtered = safeRequests
                        .filter(r => r.department === user.department && (r.status === 'FORWARDED_TO_HOD' || (r.status === 'APPROVED' && (r.cgpa || 0) >= 8)))
                        .map(r => {
                            const isHighCGPA = (r.cgpa || 0) >= 8;
                            const isAutoApproved = r.status === 'APPROVED' && isHighCGPA;
                            
                            return {
                                id: `${r.id}_${r.status}_hod`,
                                title: isAutoApproved ? 'OD Auto-Approved' : 'OD Approval Required',
                                message: isAutoApproved 
                                    ? `Advisor ${r.advisorName} of ${r.className} approved OD for ${r.studentName} on working in ${r.labName} for ${r.purpose} from ${r.startDate} to ${r.endDate}.`
                                    : isHighCGPA
                                        ? `${r.studentName} has requested OD for ${r.labName} for ${r.purpose} which is verified by ${r.labInchargeName} and forwarded by ${r.advisorName}.`
                                        : `OD request by ${r.advisorName} for student ${r.studentName}.`,
                                status: isAutoApproved ? 'APPROVED' : 'PENDING',
                                time: r.requestedAt
                            };
                        });
                }

                // Append Violations
                if (user.role !== 'STUDENT') {
                    const violationNotifs = safeViolations.map(v => ({
                        id: `violation_${v.id}`,
                        title: '🚨 Check-in Violation',
                        message: v.message,
                        status: 'VIOLATION',
                        time: v.time
                    }));
                    filtered = [...filtered, ...violationNotifs];
                }

                setNotifications(filtered.sort((a, b) => new Date(b.time) - new Date(a.time)));
            } catch (err) {
                console.error("Failed to fetch notifications:", err);
            }
        };

        fetchNotifications();
        const interval = setInterval(fetchNotifications, 5000); 

        return () => clearInterval(interval);
    }, [user]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const markAllRead = () => {
        const allIds = notifications.map(n => n.id);
        setReadIds(allIds);
        localStorage.setItem(`read_notifications_${user.id}`, JSON.stringify(allIds));
    };

    const unreadCount = notifications.filter(n => !readIds.includes(n.id)).length;

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="p-3 text-gray-400 hover:text-white transition-all hover:bg-white/5 rounded-2xl border border-transparent hover:border-white/10 relative group"
            >
                <FiBell size={22} className={unreadCount > 0 ? "animate-swing" : ""} />
                {unreadCount > 0 && (
                    <span className="absolute top-2 right-2 w-5 h-5 bg-blue-600 text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-[#141417] shadow-lg">
                        {unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-5 w-96 bg-[#141417]/95 backdrop-blur-2xl rounded-[2.5rem] shadow-[0_20px_80px_rgba(0,0,0,0.8)] border border-white/5 overflow-hidden z-[100] animate-fade-in">
                    <div className="px-8 py-6 border-b border-white/5 flex justify-between items-center bg-white/5">
                        <h3 className="text-sm font-black text-white uppercase tracking-widest">Intelligence Feed</h3>
                        {unreadCount > 0 && (
                            <button onClick={markAllRead} className="text-[10px] font-black text-blue-500 hover:text-blue-400 uppercase tracking-widest transition-colors">Mark All Clear</button>
                        )}
                    </div>

                    <div className="max-h-[30rem] overflow-y-auto">
                        {notifications.length > 0 ? (
                            notifications.map((n) => (
                                <div key={n.id} className={`px-8 py-6 border-b border-white/5 hover:bg-white/[0.03] transition-colors relative group ${!readIds.includes(n.id) ? 'bg-blue-500/[0.02]' : ''}`}>
                                    <div className="flex items-start space-x-4">
                                        <div className={`mt-1 p-2 rounded-xl border ${n.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                                            n.status === 'DENIED' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                                                'bg-blue-500/10 text-blue-500 border-blue-500/20'
                                            }`}>
                                            {n.status === 'APPROVED' ? <FiCheckCircle size={14} /> : n.status === 'DENIED' ? <FiXCircle size={14} /> : <FiClock size={14} />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-start">
                                                <h4 className="text-xs font-black text-white uppercase tracking-tight mb-1 truncate">{n.title}</h4>
                                                {!readIds.includes(n.id) && (
                                                    <span className="w-2 h-2 bg-blue-500 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.6)]"></span>
                                                )}
                                            </div>
                                            <p className="text-[11px] text-gray-500 font-medium leading-relaxed">{n.message}</p>
                                            <span className="text-[9px] font-black text-gray-700 uppercase tracking-widest mt-3 block">{new Date(n.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="py-20 text-center">
                                <FiInfo size={40} className="mx-auto text-gray-800 mb-4" />
                                <p className="text-xs font-black text-gray-600 uppercase tracking-widest">No active alerts</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes swing {
                    0%, 100% { transform: rotate(0deg); }
                    20% { transform: rotate(15deg); }
                    40% { transform: rotate(-10deg); }
                    60% { transform: rotate(5deg); }
                    80% { transform: rotate(-5deg); }
                }
                .animate-swing { animation: swing 2s infinite ease-in-out; }
            `}} />
        </div>
    );
};

export default Notifications;
