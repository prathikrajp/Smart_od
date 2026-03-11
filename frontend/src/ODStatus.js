import React, { useState, useEffect } from 'react';
import { FiFileText, FiCheckCircle, FiXCircle, FiTrendingUp, FiBarChart2, FiSend, FiClock, FiCalendar, FiMapPin, FiUser, FiArrowRight, FiDownload, FiInfo, FiX } from 'react-icons/fi';
import ODLetter from './ODLetter';
import UploadWork from './UploadWork';
import Papa from 'papaparse';
import { odApi, dataApi, miscApi } from './api';

const ODStatus = ({ user }) => {
    const [showForm, setShowForm] = useState(false);
    const [showLetter, setShowLetter] = useState(false);
    const [selectedRequest, setSelectedRequest] = useState(null); // To replace undefined currentRequest
    const [loading, setLoading] = useState(false);
    const [requestHistory, setRequestHistory] = useState([]);
    const [studentMetadata, setStudentMetadata] = useState({ achievements: 'N/A', remarks: 'N/A' });
    const [activeTab, setActiveTab] = useState('ACADEMIC'); // ACADEMIC or PORTFOLIO

    // Faculty Data lists
    const [hodList, setHodList] = useState([]);
    const [advisorList, setAdvisorList] = useState([]);
    const [labInchargeList, setLabInchargeList] = useState([]);

    // Form State
    const [formData, setFormData] = useState({
        department: '',
        yearOfStudy: '1st',
        className: '',
        labName: '',
        labInchargeName: '',
        purpose: '',
        timeSlot: 'Slot-1', // Default slot
        startDate: '',
        endDate: '',
        advisorName: '',
        hodName: ''
    });

    // Verification State
    const [verifyData, setVerifyData] = useState({
        yearOfStudy: '',
        className: ''
    });

    useEffect(() => {
        if (!user) return;

        // Load student's request history from API
        const loadRequests = async () => {
            try {
                const reqs = await odApi.getAllRequests();
                setRequestHistory(reqs.filter(r => r.studentId === user.id));
            } catch (err) { console.error(err); }
        };
        loadRequests();

        // Load Faculty Data from CSVs for now
        fetch('/advisors.csv')
            .then(r => r.text())
            .then(csv => {
                Papa.parse(csv, { header: true, skipEmptyLines: true, complete: res => setAdvisorList(res.data) });
            });
            
        fetch('/hod.csv')
            .then(r => r.text())
            .then(csv => {
                Papa.parse(csv, { header: true, skipEmptyLines: true, complete: res => setHodList(res.data) });
            });
            
        fetch('/lab_incharge.csv')
            .then(r => r.text())
            .then(csv => {
                Papa.parse(csv, { header: true, skipEmptyLines: true, complete: res => setLabInchargeList(res.data) });
            });

        // Re-using dataApi where possible
        dataApi.getStudents().then(() => { }); // Just a ping to ensure API works

        // Load metadata from API
        miscApi.getMetadata().then(meta => {
            if (meta[user.id]) setStudentMetadata(meta[user.id]);
        });
    }, [user]);

    // Background polling for status updates
    useEffect(() => {
        if (!user) return;
        const interval = setInterval(async () => {
            try {
                const reqs = await odApi.getAllRequests();
                setRequestHistory(reqs.filter(r => r.studentId === user.id));
            } catch (err) { console.error(err); }
        }, 10000);
        return () => clearInterval(interval);
    }, [user]);

    if (!user) return null;

    const cgpa = parseFloat(user.cgpa) || 0;
    const marks = parseFloat(user.marks) || 0;
    const priorityScore = (cgpa * 10 * 0.6) + (marks * 0.4);
    const isApprovedInitial = priorityScore > 60;

    // Credential validation for request initialization
    const verifyMismatch = (verifyData.yearOfStudy && verifyData.yearOfStudy !== user.yearOfStudy) || 
                          (verifyData.className && verifyData.className !== user.className);
    
    const isVerified = verifyData.yearOfStudy === user.yearOfStudy && 
                      verifyData.className === user.className;

    // Credential validation for form internal (double check)
    const credentialMismatch = (formData.department && formData.department !== user.department) || 
                             (formData.yearOfStudy && formData.yearOfStudy !== user.yearOfStudy);

    // Derive HOD and Class list when Dept or Year changes
    const departments = [...new Set(hodList.map(h => h.department))].sort();
    const availableClasses = advisorList.filter(a =>
        a.department === formData.department &&
        a.yearOfStudy === formData.yearOfStudy
    ).sort((a, b) => a.className.localeCompare(b.className, undefined, { numeric: true }));

    const handleDeptChange = (dept) => {
        const hod = hodList.find(h => h.department === dept);
        const filteredClasses = advisorList.filter(a => a.department === dept && a.yearOfStudy === formData.yearOfStudy);
        const firstClass = filteredClasses.length > 0 ? filteredClasses[0] : null;

        setFormData({
            ...formData,
            department: dept,
            hodName: hod ? hod.name : '',
            className: firstClass ? firstClass.className : '',
            advisorName: firstClass ? firstClass.name : ''
        });
    };

    const handleYearChange = (year) => {
        const filteredClasses = advisorList.filter(a => a.department === formData.department && a.yearOfStudy === year);
        const firstClass = filteredClasses.length > 0 ? filteredClasses[0] : null;

        setFormData({
            ...formData,
            yearOfStudy: year,
            className: firstClass ? firstClass.className : '',
            advisorName: firstClass ? firstClass.name : ''
        });
    };

    const handleClassChange = (clsName) => {
        const advisor = advisorList.find(a => a.className === clsName);
        setFormData({
            ...formData,
            className: clsName,
            advisorName: advisor ? advisor.name : ''
        });
    };

    const handleLabChange = (labName) => {
        const incharge = labInchargeList.find(l => l.labName === labName);
        setFormData({
            ...formData,
            labName: labName,
            labInchargeName: incharge ? incharge.name : ''
        });
    };

    const handleRequestSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        // Map slots to times
        const slotMap = {
            'Slot-1': { inTime: '09:30', outTime: '12:30' },
            'Slot-2': { inTime: '12:30', outTime: '15:30' },
            'Slot-3': { inTime: '09:30', outTime: '15:30' }
        };
        const { inTime, outTime } = slotMap[formData.timeSlot];

        const newRequest = {
            ...formData,
            inTime,
            outTime,
            id: `OD-${Date.now()}-${Math.floor(Math.random() * 1000)}`, // Required for AdminDashboard action mapping
            studentId: user.id,
            studentName: user.name,
            cgpa: cgpa,
            marks: marks,
            priorityScore: priorityScore,
            status: 'PENDING_LAB',
            requestedAt: new Date().toISOString()
        };

        try {
            await odApi.createRequest(newRequest);
            const reqs = await odApi.getAllRequests();
            setRequestHistory(reqs.filter(r => r.studentId === user.id));
            setLoading(false);
            setShowForm(false);
        } catch (err) {
            console.error(err);
            setLoading(false);
        }
    };

    const isLetterValid = (req) => {
        if (!req) return false;
        // The letter is valid as soon as it's approved or forwarded to HOD (after Advisor approval)
        const allowedStatuses = ['APPROVED', 'FORWARDED_TO_HOD', 'HOD_APPROVED'];
        return allowedStatuses.includes(req.status);
    };

    const simulateHODApproval = () => {
        const updated = [...requestHistory];
        updated[0].status = 'APPROVED';
        updated[0].statusUpdateTime = Date.now();
        setRequestHistory(updated);
        localStorage.setItem(`od_requests_${user.id}`, JSON.stringify(updated));
    };

    if (showLetter && selectedRequest) {
        return <ODLetter student={user} request={selectedRequest} onBack={() => { setShowLetter(false); setSelectedRequest(null); }} />;
    }

    return (
        <div className="max-w-4xl mx-auto px-4 py-12">
            <div className="bg-[#141417]/80 backdrop-blur-3xl rounded-[3rem] shadow-[0_20px_80px_rgba(0,0,0,0.5)] border border-white/5 overflow-hidden animate-fade-in">
                <div className="bg-gradient-to-br from-[#1a1a1e] to-[#141417] px-10 py-12 text-white border-b border-white/5">
                    <div className="flex flex-col md:flex-row md:items-center justify-between">
                        <div className="flex items-center space-x-8">
                            <div className="w-24 h-24 bg-blue-600/10 text-blue-500 rounded-3xl flex items-center justify-center border border-blue-500/20 text-4xl font-black shadow-inner">
                                {user.name.charAt(0)}
                            </div>
                            <div>
                                <h2 className="text-4xl font-black text-white tracking-tight">{user.name}</h2>
                                <p className="text-gray-500 flex items-center mt-2 font-medium tracking-wide">
                                    <span className="font-mono bg-white/5 px-2 py-0.5 rounded text-sm mr-3 border border-white/5">{user.id}</span>
                                    Terminal Authority: Student
                                </p>
                                <div className="flex flex-wrap gap-2 mt-4">
                                    {user.yearOfStudy && (
                                        <span className="bg-white/5 text-gray-400 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border border-white/5">
                                            Year {user.yearOfStudy}
                                        </span>
                                    )}
                                    {user.className && (
                                        <span className="bg-white/5 text-gray-400 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border border-white/5">
                                            Grid {user.className}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="mt-8 md:mt-0 text-right">
                            <div className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-2">Service Status</div>
                            <div className={`inline-flex items-center px-5 py-2 rounded-xl text-xs font-black tracking-widest uppercase shadow-lg ${isApprovedInitial ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'
                                }`}>
                                {isApprovedInitial ? <><FiCheckCircle size={14} className="mr-2" /> Clearance Granted</> : <><FiXCircle size={14} className="mr-2" /> Denied Access</>}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex border-b border-white/5 bg-white/[0.02]">
                    <button
                        onClick={() => setActiveTab('ACADEMIC')}
                        className={`flex-1 py-6 text-xs font-black uppercase tracking-[0.2em] transition-all ${activeTab === 'ACADEMIC' ? 'text-blue-500 border-b-2 border-blue-500 bg-blue-500/5' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
                    >
                        Academic Status
                    </button>
                    <button
                        onClick={() => setActiveTab('PORTFOLIO')}
                        className={`flex-1 py-6 text-xs font-black uppercase tracking-[0.2em] transition-all ${activeTab === 'PORTFOLIO' ? 'text-blue-500 border-b-2 border-blue-500 bg-blue-500/5' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
                    >
                        Upload Work
                    </button>
                </div>

                <div className="p-10">
                    {activeTab === 'ACADEMIC' ? (
                        <>
                            <h3 className="text-xl font-black text-white mb-8 flex items-center tracking-tight">
                                <div className="w-8 h-8 bg-blue-500/10 text-blue-500 rounded-lg flex items-center justify-center mr-4 border border-blue-500/20">
                                    <FiFileText size={16} />
                                </div>
                                Academic Baseline Verification
                            </h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
                                <div className="bg-white/5 rounded-[2rem] p-8 border border-white/5 group hover:border-blue-500/30 transition-all hover:bg-white/[0.07]">
                                    <div className="flex items-center justify-between mb-4">
                                        <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Historical CGPA</span>
                                        <FiTrendingUp className="text-blue-500" />
                                    </div>
                                    <div className="text-5xl font-black text-white leading-none mb-6">
                                        {cgpa} <span className="text-lg font-bold text-gray-600 tracking-normal ml-1">/ 10</span>
                                    </div>
                                    <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                                        <div className="bg-blue-600 h-full rounded-full transition-all duration-1000 shadow-[0_0_15px_rgba(37,99,235,0.4)]" style={{ width: `${cgpa * 10}%` }}></div>
                                    </div>
                                </div>

                                <div className="bg-white/5 rounded-[2rem] p-8 border border-white/5 group hover:border-emerald-500/30 transition-all hover:bg-white/[0.07]">
                                    <div className="flex items-center justify-between mb-4">
                                        <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Achievements & Remarks</span>
                                        <FiBarChart2 className="text-emerald-500" />
                                    </div>
                                    <div className="space-y-4">
                                        <div>
                                            <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest block mb-1">Latest Achievement</span>
                                            <p className="text-sm font-bold text-white leading-relaxed">{studentMetadata.achievements || 'No achievements recorded yet.'}</p>
                                        </div>
                                        <div className="pt-2 border-t border-white/5">
                                            <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest block mb-1">Faculty Remarks</span>
                                            <p className="text-sm font-medium text-gray-400 italic">"{studentMetadata.remarks || 'Maintain positive momentum.'}"</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className={`p-8 rounded-[2rem] border ${isApprovedInitial ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400' : 'bg-red-500/5 border-red-500/20 text-red-400'}`}>
                                <h4 className="font-black text-lg mb-3 tracking-tight">{isApprovedInitial ? 'Request Protocol Enabled' : 'Threshold Mismatch'}</h4>
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                    <div className="flex-1 space-y-4">
                                        <p className="text-sm font-medium leading-relaxed opacity-80">
                                            {isApprovedInitial ? "Your academic markers meet the primary clear-path threshold. Please verify your credentials to initialize an On-Duty request." : "Academic verification failed. Current metrics do not support automatic OD authorization."}
                                        </p>
                                        
                                        {isApprovedInitial && (
                                            <div className="flex flex-col sm:flex-row gap-4 items-end">
                                                <div className="flex-1">
                                                    <label className="block text-[9px] font-black text-gray-500 uppercase tracking-widest mb-2 ml-1">Verify Year</label>
                                                    <select 
                                                        className="form-input !h-12 !bg-white/5 !border-white/10" 
                                                        value={verifyData.yearOfStudy} 
                                                        onChange={e => setVerifyData({...verifyData, yearOfStudy: e.target.value})}
                                                    >
                                                        <option value="">Select Year</option>
                                                        <option>1st</option><option>2nd</option><option>3rd</option><option>4th</option>
                                                    </select>
                                                </div>
                                                <div className="flex-1">
                                                    <label className="block text-[9px] font-black text-gray-500 uppercase tracking-widest mb-2 ml-1">Verify Classroom</label>
                                                    <input 
                                                        type="text" 
                                                        placeholder="e.g. ACT-1" 
                                                        className="form-input !h-12 !bg-white/5 !border-white/10" 
                                                        value={verifyData.className} 
                                                        onChange={e => setVerifyData({...verifyData, className: e.target.value.toUpperCase()})}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                        
                                        {verifyMismatch && (
                                            <p className="text-red-500 text-[10px] font-black uppercase tracking-widest animate-pulse mt-2">
                                                Check Your Credentials Details for login
                                            </p>
                                        )}
                                    </div>

                                    {isApprovedInitial && isVerified && (
                                        <button onClick={() => setShowForm(true)} className="px-8 py-4 bg-white text-black rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-blue-500 hover:text-white active:scale-95 transition-all shadow-xl shadow-black/20 flex items-center shrink-0">
                                            <FiSend className="mr-2" /> Initial Request
                                        </button>
                                    )}
                                </div>
                            </div>

                            {requestHistory.length > 0 && (
                                <div className="mt-12 border-t border-white/5 pt-12">
                                    <h3 className="text-xl font-black text-white mb-8 flex items-center tracking-tight">
                                        <div className="w-8 h-8 bg-blue-500/10 text-blue-500 rounded-lg flex items-center justify-center mr-4 border border-blue-500/20">
                                            <FiClock size={16} />
                                        </div>
                                        Active & Recent Requests
                                    </h3>
                                    <div className="space-y-6">
                                        {requestHistory.map((req, idx) => (
                                            <div key={req.id || idx} className="bg-white/5 rounded-[2rem] md:rounded-[2.5rem] p-6 md:p-10 border border-white/5 animate-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: `${idx * 100}ms` }}>
                                                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-10">
                                                    <div className="space-y-5 flex-1">
                                                        <div className="flex items-center space-x-3">
                                                            <span className={`px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest uppercase border ${req.status.includes('APPROVED') ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                                                                (req.status.includes('PENDING') || req.status === 'FORWARDED_TO_HOD') ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                                                                    req.status === 'DENIED' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                                                                        'bg-gray-500/10 text-gray-500 border-white/10'
                                                                }`}>
                                                                {req.status === 'PENDING_LAB' ? 'Waiting for Lab Incharge Approval' :
                                                                    req.status === 'PENDING_ADVISOR' ? 'Waiting for Class Advisor Approval' :
                                                                        req.status === 'FORWARDED_TO_HOD' ? 'Waiting for HOD Approval' :
                                                                            req.status.replace(/_/g, ' ')}
                                                            </span>
                                                            {req.status === 'PENDING_LAB' && (
                                                                <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest animate-pulse">L-1 Lab Verification</span>
                                                            )}
                                                        </div>
                                                        <h4 className="text-2xl md:text-3xl font-black text-white leading-tight tracking-tight uppercase">{req.purpose}</h4>
                                                        <div className="flex flex-wrap gap-4 md:gap-6 text-[11px] font-black text-gray-500 uppercase tracking-widest">
                                                            <div className="flex items-center"><FiMapPin className="mr-2 text-blue-500" /> {req.labName}</div>
                                                            <div className="flex items-center"><FiCalendar className="mr-2 text-blue-500" /> {req.startDate} - {req.endDate}</div>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col md:items-end gap-3 w-full md:w-auto">
                                                        {isLetterValid(req) && (
                                                            <button 
                                                                onClick={() => { 
                                                                    setSelectedRequest(req);
                                                                    setShowLetter(true);
                                                                }} 
                                                                className="flex items-center px-8 py-4 bg-white text-black rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-blue-500 hover:text-white transition-all active:scale-95 shadow-2xl shadow-black/40 w-full md:w-auto"
                                                            >
                                                                <FiDownload className="mr-3" size={18} /> Credentials
                                                            </button>
                                                        )}
                                                        {(!isLetterValid(req) && req.status.includes('APPROVED')) && (
                                                            <span className="text-[10px] font-black text-red-500 bg-red-500/10 px-6 py-3 rounded-xl border border-red-500/20 uppercase tracking-widest text-center">Security Expired</span>
                                                        )}
                                                        {req.status === 'DENIED' && (
                                                            <span className="text-[10px] font-black text-red-500 bg-red-500/10 px-8 py-4 rounded-2xl border border-red-500/20 uppercase tracking-widest text-center">Request Denied</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <UploadWork user={user} />
                    )}
                </div>
            </div>

            {showForm && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-[#0a0a0b]/80 backdrop-blur-xl animate-fade-in">
                    <div className="bg-[#141417] rounded-[3rem] shadow-[0_20px_80px_rgba(0,0,0,0.8)] w-full max-w-3xl max-h-[90vh] overflow-y-auto border border-white/5 relative">
                        <div className="sticky top-0 bg-[#141417] z-10 px-10 py-8 border-b border-white/5 flex justify-between items-center">
                            <div>
                                <h3 className="text-3xl font-black text-white tracking-tight">Deployment Request</h3>
                                <p className="text-xs text-gray-500 font-black uppercase tracking-[0.2em] mt-1">L-0 Application Protocol</p>
                            </div>
                            <button onClick={() => setShowForm(false)} className="w-12 h-12 bg-white/5 text-gray-500 rounded-2xl flex items-center justify-center hover:bg-red-500/10 hover:text-red-500 transition-all border border-white/5"><FiX size={24} /></button>
                        </div>

                        <div className="p-10">
                            <form onSubmit={handleRequestSubmit} className="space-y-10">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                    <div>
                                        <label className="block text-[10px] font-black text-gray-600 uppercase tracking-widest mb-3 ml-1">Grid Department</label>
                                        <select required className="form-input" value={formData.department} onChange={e => handleDeptChange(e.target.value)}>
                                            <option value="">Select Dept</option>
                                            {departments.map(d => <option key={d} value={d}>{d}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-gray-600 uppercase tracking-widest mb-3 ml-1">Study Cycle</label>
                                        <select className="form-input" value={formData.yearOfStudy} onChange={e => handleYearChange(e.target.value)}>
                                            <option>1st</option><option>2nd</option><option>3rd</option><option>4th</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-gray-600 uppercase tracking-widest mb-3 ml-1">Class Designation</label>
                                        <select required className="form-input" disabled={!formData.department || !formData.yearOfStudy} value={formData.className} onChange={e => handleClassChange(e.target.value)}>
                                            <option value="">Select Class</option>
                                            {availableClasses.map(c => <option key={c.className} value={c.className}>{c.className}</option>)}
                                        </select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-blue-500/5 p-8 rounded-[2rem] border border-blue-500/10">
                                    <div className="flex items-center space-x-5">
                                        <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center border border-blue-500/20 text-blue-500"><FiUser size={20} /></div>
                                        <div>
                                            <label className="block text-[9px] font-black text-blue-500/60 uppercase tracking-widest mb-1">Class Advisor</label>
                                            <div className="text-sm font-bold text-white leading-none">{formData.advisorName || 'Pending select...'}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center space-x-5">
                                        <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center border border-blue-500/20 text-blue-500"><FiUser size={20} /></div>
                                        <div>
                                            <label className="block text-[9px] font-black text-blue-500/60 uppercase tracking-widest mb-1">HOD Master</label>
                                            <div className="text-sm font-bold text-white leading-none">{formData.hodName || 'Pending select...'}</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-end">
                                    <div className="md:col-span-1">
                                        <label className="block text-[10px] font-black text-gray-600 uppercase tracking-widest mb-3 ml-1">Target Lab</label>
                                        <select required className="form-input" value={formData.labName} onChange={e => handleLabChange(e.target.value)}>
                                            <option value="">Select Lab</option>
                                            {labInchargeList.map(l => <option key={l.labName} value={l.labName}>{l.labName}</option>)}
                                        </select>
                                    </div>
                                    <div className="md:col-span-1">
                                        <label className="block text-[10px] font-black text-gray-600 uppercase tracking-widest mb-3 ml-1">Incharge Contact</label>
                                        <div className="form-input bg-white/5 border-white/5 text-gray-400 font-bold flex items-center h-[50px]">
                                            {formData.labInchargeName || 'Auto-mapping...'}
                                        </div>
                                    </div>
                                    <div className="md:col-span-1">
                                        <label className="block text-[10px] font-black text-gray-600 uppercase tracking-widest mb-3 ml-1">Deployment Purpose</label>
                                        <input required type="text" placeholder="e.g. Core Research" className="form-input" value={formData.purpose} onChange={e => setFormData({ ...formData, purpose: e.target.value })} />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div>
                                        <label className="block text-[10px] font-black text-gray-600 uppercase tracking-widest mb-3 ml-1">Allocation Time Slot</label>
                                        <select 
                                            required 
                                            className="form-input" 
                                            value={formData.timeSlot} 
                                            onChange={e => setFormData({ ...formData, timeSlot: e.target.value })}
                                        >
                                            <option value="Slot-1">Slot-1 09:30 am to 12:30 pm</option>
                                            <option value="Slot-2">Slot-2 12:30 pm to 03:30 pm</option>
                                            <option value="Slot-3">Slot-3 09:30 am to 03:30 pm</option>
                                        </select>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-[10px] font-black text-blue-500 uppercase tracking-widest mb-3 ml-1">Launch Date</label>
                                            <input required type="date" className="form-input border-blue-500/20" value={formData.startDate} onChange={e => setFormData({ ...formData, startDate: e.target.value })} />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-blue-500 uppercase tracking-widest mb-3 ml-1">End Cycle</label>
                                            <input required type="date" className="form-input border-blue-500/20" value={formData.endDate} onChange={e => setFormData({ ...formData, endDate: e.target.value })} />
                                        </div>
                                    </div>
                                </div>

                                {credentialMismatch && (
                                    <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-start space-x-3 animate-bounce">
                                        <FiAlertCircle className="text-red-500 mt-0.5" size={18} />
                                        <div>
                                            <p className="text-red-500 text-xs font-black uppercase tracking-widest">Profiling Conflict Detected</p>
                                            <p className="text-red-400/80 text-[11px] font-medium leading-relaxed mt-1">
                                                The selected {formData.department !== user.department ? 'Department' : 'Year of Study'} does not match your official terminal encryption. Please verify your academic grid coordinates.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={loading || !formData.advisorName || credentialMismatch}
                                    className={`w-full py-5 rounded-2xl text-xs font-black uppercase tracking-[0.3em] transition-all shadow-2xl active:scale-95 flex items-center justify-center ${loading || !formData.advisorName || credentialMismatch
                                        ? 'bg-white/5 text-gray-600 cursor-not-allowed border border-white/5'
                                        : 'bg-white text-black hover:bg-gray-200 shadow-white/10'
                                        }`}
                                >
                                    {loading ? 'Processing Request...' : 'Initialize On-Duty Sequence'}
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            <style dangerouslySetInnerHTML={{
                __html: `
                .form-input { width: 100%; height: 50px; padding: 0 16px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); border-radius: 12px; color: white; font-weight: 700; font-size: 14px; outline: none; transition: all 0.2s; }
                .form-input:focus { border-color: #3b82f6; background: rgba(255,255,255,0.08); box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1); }
                .form-input option { background: #141417; color: white; }
                .form-input:disabled { opacity: 0.3; cursor: not-allowed; }
            `}} />
        </div>
    );
};

export default ODStatus;

