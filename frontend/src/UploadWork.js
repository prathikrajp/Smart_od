import React, { useState, useEffect, useRef } from 'react';
import { FiUpload, FiSearch, FiFile, FiVideo, FiImage, FiFileText, FiCalendar, FiChevronLeft, FiChevronRight, FiCheckCircle, FiX, FiEdit3, FiClock, FiActivity } from 'react-icons/fi';
import { uploadApi, sessionApi } from './api';

const UploadWork = ({ user }) => {
    const [works, setWorks] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [viewWork, setViewWork] = useState(null);
    const [uploadData, setUploadData] = useState({ topic: '', description: '', file: null });
    const [composeData, setComposeData] = useState({ topic: '', content: '' });
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [showComposeModal, setShowComposeModal] = useState(false);
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(null); // 'YYYY-MM-DD'
    const [history, setHistory] = useState([]);

    // Timer States
    const [labSession, setLabSession] = useState(null);
    const [totalWorkingMs, setTotalWorkingMs] = useState(0);
    const [liveSessionTime, setLiveSessionTime] = useState("00:00:00");

    const fileInputRef = useRef(null);

    const formatTime = (ms) => {
        const totalSeconds = Math.floor(ms / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    };

    useEffect(() => {
        if (!user) return;

        const loadWorks = async () => {
            try {
                const savedWorks = await uploadApi.getUploads(user.id);
                setWorks(savedWorks);
            } catch (err) { console.error(err); }
        };
        loadWorks();
        
        const loadHistory = async () => {
            try {
                const logs = await sessionApi.getHistory(user.id);
                setHistory(logs);
            } catch (err) { console.error(err); }
        };
        loadHistory();

        // Load Total Working Hours from user object
        setTotalWorkingMs(user.totalWorkingMs || 0);

        // Initial Session Check
        const checkSessions = async () => {
            try {
                const sessions = await sessionApi.getActiveSessions();
                const mySession = sessions[user.id];
                if (mySession && mySession.isActive) {
                    setLabSession(mySession);
                    const diff = Date.now() - new Date(mySession.startTime).getTime();
                    setLiveSessionTime(formatTime(diff));
                } else {
                    setLabSession(null);
                }
            } catch (err) { console.error(err); }
        };

        checkSessions();
        const interval = setInterval(checkSessions, 5000);
        return () => clearInterval(interval);
    }, [user]);

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setUploadData({ ...uploadData, file: file, topic: file.name.split('.')[0] });
        setShowUploadModal(true);
    };

    const handlePublish = () => {
        const { file, topic, description } = uploadData;
        if (!file) return;

        setIsUploading(true);
        const reader = new FileReader();
        reader.onloadend = async () => {
            const newWork = {
                topic: topic || file.name.split('.')[0],
                description: description,
                fileName: file.name,
                fileType: file.type,
                size: (file.size / (1024 * 1024)).toFixed(2) + " MB",
                uploadDate: new Date().toISOString().split('T')[0],
                content: reader.result
            };

            try {
                await uploadApi.uploadWork(user.id, newWork);
                const updatedWorks = await uploadApi.getUploads(user.id);
                setWorks(updatedWorks);

                setIsUploading(false);
                setShowUploadModal(false);
                setUploadData({ topic: '', description: '', file: null });
            } catch (err) {
                console.error(err);
                setIsUploading(false);
            }
        };
        reader.readAsDataURL(file);
    };

    const handleComposePublish = async () => {
        if (!composeData.topic || !composeData.content) return;

        const newWork = {
            topic: composeData.topic,
            description: composeData.content.substring(0, 100) + "...",
            fileName: "Composed Work",
            fileType: "text/plain",
            size: "Composed",
            uploadDate: new Date().toISOString().split('T')[0],
            content: composeData.content,
            isComposed: true
        };

        try {
            await uploadApi.uploadWork(user.id, newWork);
            const updatedWorks = await uploadApi.getUploads(user.id);
            setWorks(updatedWorks);

            setShowComposeModal(false);
            setComposeData({ topic: '', content: '' });
        } catch (err) { console.error(err); }
    };

    const openFile = (work) => {
        if (work.isComposed) {
            setViewWork(work);
            return;
        }

        const win = window.open();
        if (!win) return alert("Please allow popups to view files");

        if (work.fileType.includes('image') || work.fileType.includes('pdf') || work.fileType.includes('video')) {
            win.document.write(`
                <html>
                    <head><title>${work.topic}</title><style>body{margin:0;background:#0a0a0b;display:flex;align-items:center;justify-content:center;height:100vh;overflow:hidden;}</style></head>
                    <body>
                        ${work.fileType.includes('image') ? `<img src="${work.content}" style="max-width:100%;max-height:100%;object-fit:contain;"/>` :
                    work.fileType.includes('pdf') ? `<embed src="${work.content}" type="application/pdf" width="100%" height="100%"/>` :
                        `<video src="${work.content}" controls style="max-width:100%;max-height:100%;"/>`}
                    </body>
                </html>
            `);
        } else {
            const link = document.createElement('a');
            link.href = work.content;
            link.download = work.fileName;
            link.click();
            win.close();
        }
    };

    const filteredWorks = works.filter(w => w.topic.toLowerCase().includes(searchQuery.toLowerCase()));

    // Calendar Utils
    const getDaysInMonth = (date) => new Array(new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()).fill(0).map((_, i) => i + 1);
    const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();
    const daysInMonth = getDaysInMonth(currentMonth);
    const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
    const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
    const hasUploadOnDate = (day) => works.some(w => w.uploadDate === `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);

    const handleDayClick = (day) => {
        const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        setSelectedDate(selectedDate === dateStr ? null : dateStr);
    };

    const getSelectedDayWorks = () => {
        if (!selectedDate) return [];
        return works.filter(w => w.uploadDate === selectedDate);
    };

    const getSelectedDayHours = () => {
        if (!selectedDate) return 0;
        const dayStart = new Date(selectedDate).getTime();
        const dayEnd = dayStart + 86400000;
        return history
            .filter(s => s.startTime >= dayStart && s.startTime < dayEnd)
            .reduce((total, s) => total + (s.durationMinutes * 60 * 1000), 0);
    };

    const getWeeklyStats = () => {
        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        
        const weeklyHours = history
            .filter(s => s.startTime >= sevenDaysAgo)
            .reduce((total, s) => total + (s.durationMinutes * 60 * 1000), 0);
            
        const weeklyUploadsCount = works.filter(w => {
            const uploadTime = new Date(w.uploadDate).getTime();
            return uploadTime >= sevenDaysAgo;
        }).length;

        return { weeklyHours, weeklyUploadsCount };
    };

    const selectedWorks = getSelectedDayWorks();
    const selectedHours = getSelectedDayHours();
    const { weeklyHours, weeklyUploadsCount } = getWeeklyStats();

    const getFileIcon = (work) => {
        if (work.isComposed) return <FiEdit3 className="text-amber-500" />;
        const type = work.fileType;
        if (type.includes('video')) return <FiVideo className="text-purple-500" />;
        if (type.includes('image')) return <FiImage className="text-blue-500" />;
        if (type.includes('pdf')) return <FiFileText className="text-red-500" />;
        return <FiFile className="text-gray-500" />;
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8 animate-fade-in pb-20 px-4 md:px-0">
            <div className="lg:col-span-2 space-y-6 md:space-y-8">
                <div className="bg-[#141417]/80 backdrop-blur-3xl rounded-[2rem] md:rounded-[2.5rem] p-6 md:p-8 border border-white/5 shadow-2xl">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                        <div>
                            <h3 className="text-xl md:text-2xl font-black text-white tracking-tight">Upload Portfolio</h3>
                            <p className="text-[10px] md:text-xs text-gray-500 font-black uppercase tracking-widest mt-1">Showcase your academic & creative work</p>
                        </div>
                        <div id="mobile-action-bar" className="flex flex-col sm:flex-row gap-3">
                            <button
                                onClick={() => setShowComposeModal(true)}
                                className="w-full sm:w-auto bg-white/5 hover:bg-white/10 text-white px-6 py-4 rounded-xl md:rounded-2xl font-black text-xs uppercase tracking-widest transition-all border border-white/10 flex items-center justify-center active:scale-95"
                            >
                                <FiEdit3 className="mr-3" size={18} />
                                Compose
                            </button>
                            <button
                                onClick={() => fileInputRef.current.click()}
                                disabled={isUploading}
                                className="w-full sm:w-auto bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-xl md:rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-[0_10px_30px_rgba(37,99,235,0.3)] flex items-center justify-center active:scale-95"
                            >
                                <FiUpload className="mr-3" size={18} />
                                {isUploading ? 'Preparing...' : 'New Upload'}
                            </button>
                        </div>
                        <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileSelect} accept="video/*,image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" />
                    </div>

                    <div className="relative mb-8">
                        <FiSearch className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
                        <input
                            type="text"
                            placeholder="Search by topic name..."
                            className="w-full bg-white/5 border border-white/5 rounded-2xl py-5 pl-16 pr-8 text-sm font-bold text-white focus:outline-none focus:border-blue-500/50 transition-all"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                        {filteredWorks.length > 0 ? filteredWorks.map((work) => (
                            <div key={work.id} onClick={() => setViewWork(work)} className="bg-white/5 hover:bg-white/[0.08] border border-white/5 p-6 rounded-[1.5rem] transition-all cursor-pointer group flex items-center justify-between">
                                <div className="flex items-center space-x-6">
                                    <div className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center border border-white/5 text-2xl group-hover:scale-110 transition-transform">
                                        {getFileIcon(work)}
                                    </div>
                                    <div>
                                        <h4 className="font-black text-white text-lg tracking-tight group-hover:text-amber-400 transition-colors uppercase">{work.topic}</h4>
                                        <div className="flex items-center space-x-4 mt-1">
                                            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center"><FiCalendar className="mr-1.5" /> {work.uploadDate}</span>
                                            <span className="text-[10px] font-black text-blue-500/60 uppercase tracking-widest">{work.size}</span>
                                        </div>
                                    </div>
                                </div>
                                <FiChevronRight className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                        )) : (
                            <div className="text-center py-20 bg-white/5 rounded-[2rem] border border-dashed border-white/10">
                                <FiFile className="mx-auto text-gray-700 mb-4" size={48} />
                                <p className="text-gray-500 font-black text-xs uppercase tracking-widest">No works found</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="space-y-8">
                {/* COE Working Hours */}
                <div className="bg-gradient-to-br from-blue-600/20 to-purple-600/20 backdrop-blur-3xl rounded-[2rem] md:rounded-[2.5rem] p-6 md:p-8 border border-blue-500/20 shadow-2xl relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 opacity-10 group-hover:scale-110 transition-transform hidden md:block">
                        <FiActivity size={120} />
                    </div>
                    <h3 className="text-base md:text-lg font-black text-white tracking-tight flex items-center mb-6">
                        <FiClock className="mr-3 text-blue-400" /> COE Working Hours
                    </h3>

                    <div className="space-y-6 relative z-10">
                        <div>
                            <span className="text-[10px] md:text-xs font-black text-blue-400 uppercase tracking-widest block mb-1 md:mb-2">
                                {selectedDate ? `Work on ${selectedDate}` : 'This Week\'s Progress'}
                            </span>
                            <div className="text-2xl md:text-3xl lg:text-4xl font-black text-white tracking-tight">
                                {formatTime(selectedDate ? selectedHours : weeklyHours)}
                            </div>
                        </div>

                        {labSession && (
                            <div className="bg-white/10 rounded-2xl p-4 md:p-5 border border-white/10 animate-pulse">
                                <div className="flex items-center justify-between mb-2 md:mb-3">
                                    <span className="text-[9px] md:text-[10px] font-black text-emerald-400 uppercase tracking-widest">Live Session</span>
                                    <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                                </div>
                                <div className="text-lg md:text-xl lg:text-2xl font-black text-white tabular-nums mb-1">{liveSessionTime}</div>
                                <div className="text-[9px] md:text-[10px] font-bold text-gray-400 uppercase tracking-tight">Venue: {labSession.labName}</div>
                            </div>
                        )}

                        {!labSession && !selectedDate && (
                            <div className="flex items-center space-x-3 text-[10px] md:text-xs font-medium text-gray-500 bg-white/5 p-3 md:p-4 rounded-xl border border-white/5">
                                <FiActivity className="text-blue-500 shrink-0" size={16} />
                                <span>{weeklyHours > 0 ? `${(weeklyHours / 3600000).toFixed(1)}h logged` : '0h logged'} & {weeklyUploadsCount} Uploads this week</span>
                            </div>
                        )}
                        
                        {!labSession && selectedDate && (
                            <div className="flex items-center space-x-3 text-[10px] md:text-xs font-medium text-amber-500/80 bg-white/5 p-3 md:p-4 rounded-xl border border-white/5">
                                <FiCalendar className="shrink-0" size={16} />
                                <span>Showing activity for {selectedDate}</span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="bg-[#141417]/80 backdrop-blur-3xl rounded-[2rem] md:rounded-[2.5rem] p-6 md:p-8 border border-white/5 shadow-2xl h-fit">
                    <div className="flex items-center justify-between mb-8">
                        <h3 className="text-base md:text-lg font-black text-white tracking-tight flex items-center"><FiCalendar className="mr-3 text-blue-500" /> Activity</h3>
                        <div className="flex space-x-2">
                            <button onClick={prevMonth} className="p-2 hover:bg-white/5 rounded-xl transition-all"><FiChevronLeft /></button>
                            <button onClick={nextMonth} className="p-2 hover:bg-white/5 rounded-xl transition-all"><FiChevronRight /></button>
                        </div>
                    </div>
                    <div className="text-center mb-6"><span className="text-xs font-black text-gray-500 uppercase tracking-[0.2em]">{currentMonth.toLocaleString('default', { month: 'long' })} {currentMonth.getFullYear()}</span></div>
                    <div className="grid grid-cols-7 gap-1 mb-2">
                        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => <div key={d} className="text-[10px] font-black text-gray-700 text-center py-2">{d}</div>)}
                    </div>
                    <div className="grid grid-cols-7 gap-2">
                        {Array(firstDayOfMonth).fill(null).map((_, i) => <div key={`empty-${i}`} className="aspect-square"></div>)}
                        {daysInMonth.map(day => {
                            const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                            const isSelected = selectedDate === dateStr;
                            const hasUpload = hasUploadOnDate(day);
                            const isToday = day === new Date().getDate() && currentMonth.getMonth() === new Date().getMonth() && currentMonth.getFullYear() === new Date().getFullYear();
                            return (
                                <div 
                                    key={day} 
                                    onClick={() => handleDayClick(day)}
                                    className={`aspect-square rounded-xl flex items-center justify-center text-xs font-bold relative transition-all cursor-pointer hover:scale-110 active:scale-95 ${isSelected ? 'ring-2 ring-amber-500 bg-amber-500/10 text-white' : isToday ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'bg-white/5 text-gray-400'} ${hasUpload ? 'bg-emerald-500/10 border border-emerald-500/30' : ''}`}
                                >
                                    {day}
                                    {hasUpload && <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center border-2 border-[#141417] shadow-sm animate-bounce-subtle"><FiCheckCircle size={8} className="text-white" /></div>}
                                </div>
                            );
                        })}
                    </div>

                    {selectedDate ? (
                        <div className="mt-8 pt-8 border-t border-white/5 animate-in slide-in-from-top-4 duration-300">
                            <div className="flex items-center justify-between mb-4">
                                <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">{selectedDate}</span>
                                <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">{formatTime(selectedHours)} Worked</span>
                            </div>
                            <div className="space-y-3">
                                {selectedWorks.length > 0 ? selectedWorks.map(w => (
                                    <div key={w.id} onClick={() => setViewWork(w)} className="bg-white/5 p-4 rounded-xl border border-white/5 flex items-center justify-between cursor-pointer hover:bg-white/10 transition-all group">
                                        <div className="flex items-center space-x-3 overflow-hidden">
                                            <div className="text-lg">{getFileIcon(w)}</div>
                                            <span className="text-xs font-bold text-gray-300 truncate uppercase">{w.topic}</span>
                                        </div>
                                        <FiChevronRight className="text-gray-500 opacity-0 group-hover:opacity-100 transition-all" size={14} />
                                    </div>
                                )) : (
                                    <p className="text-[10px] text-gray-600 font-medium italic text-center py-4 bg-white/[0.02] rounded-xl border border-dashed border-white/5">No works recorded on this date.</p>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="mt-8 pt-8 border-t border-white/5">
                            <div className="flex items-center justify-between mb-4">
                                <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Recent Weekly Activity</span>
                                <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Last 7 Days</span>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                                    <span className="block text-[8px] font-black text-gray-600 uppercase mb-1">Weekly Hours</span>
                                    <span className="text-sm font-black text-white">{formatTime(weeklyHours).split(':')[0]}h {formatTime(weeklyHours).split(':')[1]}m</span>
                                </div>
                                <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                                    <span className="block text-[8px] font-black text-gray-600 uppercase mb-1">Portfolio</span>
                                    <span className="text-sm font-black text-white">{weeklyUploadsCount} Uploads</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* View Modal */}
            {viewWork && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 md:p-6 bg-[#0a0a0b]/90 backdrop-blur-xl animate-fade-in">
                    <div className="bg-[#141417] rounded-[2rem] md:rounded-[3rem] shadow-[0_20px_80px_rgba(0,0,0,0.8)] w-full max-w-lg border border-white/5 overflow-hidden">
                        <div className="p-6 md:p-10 text-center">
                            <div className="w-16 h-16 md:w-24 md:h-24 bg-white/5 rounded-2xl md:rounded-[2rem] flex items-center justify-center mx-auto mb-6 md:mb-8 border border-white/5 text-3xl md:text-5xl">{getFileIcon(viewWork)}</div>
                            <h3 className="text-2xl md:text-3xl font-black text-white tracking-tight mb-2 uppercase">{viewWork.topic}</h3>
                            <div className="bg-white/5 p-4 md:p-6 rounded-2xl border border-white/5 text-left mb-6 md:mb-8 max-h-60 overflow-y-auto custom-scrollbar">
                                <span className="block text-[8px] font-black text-amber-500 uppercase tracking-widest mb-2">Work Material</span>
                                <p className="text-xs md:text-sm font-medium text-gray-400 leading-relaxed italic whitespace-pre-wrap">"{viewWork.content.length > 500 && !viewWork.isComposed ? viewWork.description : viewWork.content}"</p>
                            </div>
                            <div className="flex flex-col space-y-3 md:space-y-4">
                                {!viewWork.isComposed && (
                                    <button onClick={() => openFile(viewWork)} className="w-full py-5 bg-white text-black font-black rounded-2xl text-xs uppercase tracking-widest hover:bg-blue-500 hover:text-white transition-all transform active:scale-95 shadow-xl shadow-black/20">Open Asset</button>
                                )}
                                <button onClick={() => setViewWork(null)} className="w-full py-5 bg-white/5 text-gray-400 font-black rounded-2xl text-xs uppercase tracking-widest hover:bg-red-500/10 hover:text-red-500 transition-all border border-white/5">Close Preview</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Compose Modal */}
            {showComposeModal && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 md:p-6 bg-[#0a0a0b]/95 backdrop-blur-2xl animate-fade-in">
                    <div className="bg-[#141417] rounded-[2rem] md:rounded-[3rem] shadow-[0_20px_80px_rgba(0,0,0,0.8)] w-full max-w-2xl border border-white/5 relative overflow-hidden">
                        <div className="p-6 md:p-10 text-center">
                            <h3 className="text-2xl md:text-3xl font-black text-white tracking-tight mb-2">Compose Work</h3>
                            <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-6 md:mb-8">Draft your findings or activity report</p>
                            <div className="space-y-4 md:space-y-6 text-left">
                                <div>
                                    <label className="block text-[10px] font-black text-gray-600 uppercase tracking-widest mb-2 md:mb-3 ml-1">Work Topic</label>
                                    <input type="text" className="w-full bg-white/5 border border-white/5 rounded-xl md:rounded-2xl py-4 md:py-5 px-6 text-sm font-bold text-white outline-none focus:border-amber-500 transition-all shadow-inner" value={composeData.topic} onChange={e => setComposeData({ ...composeData, topic: e.target.value })} placeholder="e.g. Algorithm Analysis: B-Trees" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-gray-600 uppercase tracking-widest mb-2 md:mb-3 ml-1">The Work Execution Details</label>
                                    <textarea className="w-full bg-white/5 border border-white/5 rounded-xl md:rounded-2xl py-4 md:py-6 px-6 text-sm font-bold text-white outline-none focus:border-amber-500 transition-all shadow-inner h-48 md:h-64 resize-none" value={composeData.content} onChange={e => setComposeData({ ...composeData, content: e.target.value })} placeholder="Describe the work you've performed in detail..." />
                                </div>
                                <div className="pt-4 flex flex-col sm:flex-row gap-3 md:gap-4">
                                    <button onClick={handleComposePublish} className="flex-1 py-4 md:py-5 bg-white text-black font-black rounded-xl md:rounded-2xl text-xs uppercase tracking-widest hover:bg-amber-500 hover:text-white transition-all transform active:scale-95 shadow-xl shadow-amber-900/20">Publish Insight</button>
                                    <button onClick={() => setShowComposeModal(false)} className="px-8 py-4 md:py-5 bg-white/5 text-gray-500 font-black rounded-xl md:rounded-2xl text-xs uppercase tracking-widest hover:bg-red-500/10 hover:text-red-500 transition-all border border-white/5">Discard</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Upload Modal (Existing) */}
            {showUploadModal && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 md:p-6 bg-[#0a0a0b]/95 backdrop-blur-2xl animate-fade-in">
                    <div className="bg-[#141417] rounded-[2rem] md:rounded-[3rem] shadow-[0_20px_80px_rgba(0,0,0,0.8)] w-full max-w-xl border border-white/5 relative overflow-hidden">
                        <div className="p-6 md:p-10 text-center">
                            <h3 className="text-2xl md:text-3xl font-black text-white tracking-tight mb-2">Publish Lab Work</h3>
                            <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-6 md:mb-8">Finalize your work session data</p>
                            <div className="space-y-4 md:space-y-6 text-left">
                                <div>
                                    <label className="block text-[10px] font-black text-gray-600 uppercase tracking-widest mb-2 md:mb-3 ml-1">Topic Name</label>
                                    <input type="text" className="w-full bg-white/5 border border-white/5 rounded-xl md:rounded-2xl py-4 md:py-5 px-6 text-sm font-bold text-white outline-none focus:border-blue-500 transition-all shadow-inner" value={uploadData.topic} onChange={e => setUploadData({ ...uploadData, topic: e.target.value })} placeholder="e.g. Micro microprocessor Interfacing" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-gray-600 uppercase tracking-widest mb-2 md:mb-3 ml-1">What did you do in the lab?</label>
                                    <textarea className="w-full bg-white/5 border border-white/5 rounded-xl md:rounded-2xl py-4 md:py-5 px-6 text-sm font-bold text-white outline-none focus:border-blue-500 transition-all shadow-inner h-24 md:h-32 resize-none" value={uploadData.description} onChange={e => setUploadData({ ...uploadData, description: e.target.value })} placeholder="Describe your experiments or accomplishments..." />
                                </div>
                                <div className="flex items-center space-x-4 p-4 md:p-5 bg-blue-500/5 rounded-xl md:rounded-2xl border border-blue-500/10 overflow-hidden">
                                    <FiFile className="text-blue-500 shrink-0" size={24} />
                                    <div className="overflow-hidden"><span className="block text-[8px] font-black text-blue-500 uppercase tracking-widest">Ready to publish</span><span className="block text-xs font-bold text-white truncate">{uploadData.file?.name}</span></div>
                                </div>
                                <div className="pt-4 flex flex-col sm:flex-row gap-3 md:gap-4">
                                    <button onClick={handlePublish} disabled={isUploading} className="flex-1 py-4 md:py-5 bg-white text-black font-black rounded-xl md:rounded-2xl text-xs uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all transform active:scale-95 disabled:opacity-50">{isUploading ? 'Publishing...' : 'Publish Work'}</button>
                                    <button onClick={() => setShowUploadModal(false)} className="px-8 py-4 md:py-5 bg-white/5 text-gray-500 font-black rounded-xl md:rounded-2xl text-xs uppercase tracking-widest hover:bg-red-500/10 hover:text-red-500 transition-all border border-white/5">Cancel</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <style dangerouslySetInnerHTML={{
                __html: `
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.02); }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(251, 191, 36, 0.2); border-radius: 10px; }

                @keyframes bounce-subtle {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-3px); }
                }
                .animate-bounce-subtle {
                    animation: bounce-subtle 2s infinite ease-in-out;
                }

                /* Mobile Specific Alignment & Neatness */
                @media (max-width: 640px) {
                    .grid-cols-7 {
                        gap: 1.5px !important;
                    }
                    .aspect-square {
                        border-radius: 12px !important;
                        font-size: 10px !important;
                    }
                    h3 {
                        font-size: 1.1rem !important;
                    }
                    .p-6, .p-8 {
                        padding: 1.25rem !important;
                    }
                    .rounded-[2rem], .rounded-[2.5rem] {
                        border-radius: 1.5rem !important;
                    }
                    .text-3xl {
                        font-size: 1.5rem !important;
                    }
                    #mobile-action-bar {
                        flex-direction: column !important;
                        gap: 12px !important;
                    }
                    .md\\:rounded-2xl {
                        border-radius: 1rem !important;
                    }
                }
            `}} />
        </div>
    );
};

export default UploadWork;
