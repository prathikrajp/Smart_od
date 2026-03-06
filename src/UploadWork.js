import React, { useState, useEffect, useRef } from 'react';
import { FiUpload, FiSearch, FiFile, FiVideo, FiImage, FiFileText, FiCalendar, FiChevronLeft, FiChevronRight, FiCheckCircle, FiX, FiEdit3, FiClock, FiActivity } from 'react-icons/fi';

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
        const savedWorks = localStorage.getItem(`uploaded_works_${user?.id}`);
        if (savedWorks) setWorks(JSON.parse(savedWorks));

        // Load Total Working Hours
        const savedMs = localStorage.getItem(`total_working_ms_${user?.id}`);
        if (savedMs) {
            setTotalWorkingMs(parseInt(savedMs));
        } else {
            // Migration: check if old minutes exist
            const oldMinutes = localStorage.getItem(`total_working_minutes_${user?.id}`);
            if (oldMinutes) {
                const ms = parseInt(oldMinutes) * 60 * 1000;
                setTotalWorkingMs(ms);
                localStorage.setItem(`total_working_ms_${user?.id}`, ms.toString());
            }
        }

        // Initial Session Check
        const checkSessions = () => {
            const sessions = JSON.parse(localStorage.getItem('coe_lab_sessions') || '{}');
            const mySession = sessions[user?.id];
            if (mySession && mySession.isActive) {
                setLabSession(mySession);

                const diff = Date.now() - mySession.startTime;
                setLiveSessionTime(formatTime(diff));
            } else {
                setLabSession(null);
            }
        };

        checkSessions();
        const interval = setInterval(checkSessions, 1000);
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
        reader.onloadend = () => {
            const newWork = {
                id: Date.now(),
                topic: topic || file.name.split('.')[0],
                description: description,
                fileName: file.name,
                fileType: file.type,
                size: (file.size / (1024 * 1024)).toFixed(2) + " MB",
                uploadDate: new Date().toISOString().split('T')[0],
                timestamp: new Date().toLocaleTimeString(),
                content: reader.result
            };

            const updatedWorks = [newWork, ...works];
            setWorks(updatedWorks);
            localStorage.setItem(`uploaded_works_${user?.id}`, JSON.stringify(updatedWorks));

            setIsUploading(false);
            setShowUploadModal(false);
            setUploadData({ topic: '', description: '', file: null });
        };
        reader.readAsDataURL(file);
    };

    const handleComposePublish = () => {
        if (!composeData.topic || !composeData.content) return;

        const newWork = {
            id: Date.now(),
            topic: composeData.topic,
            description: composeData.content.substring(0, 100) + "...",
            fileName: "Composed Work",
            fileType: "text/plain",
            size: "Composed",
            uploadDate: new Date().toISOString().split('T')[0],
            timestamp: new Date().toLocaleTimeString(),
            content: composeData.content,
            isComposed: true
        };

        const updatedWorks = [newWork, ...works];
        setWorks(updatedWorks);
        localStorage.setItem(`uploaded_works_${user?.id}`, JSON.stringify(updatedWorks));

        setShowComposeModal(false);
        setComposeData({ topic: '', content: '' });
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

    const getFileIcon = (work) => {
        if (work.isComposed) return <FiEdit3 className="text-amber-500" />;
        const type = work.fileType;
        if (type.includes('video')) return <FiVideo className="text-purple-500" />;
        if (type.includes('image')) return <FiImage className="text-blue-500" />;
        if (type.includes('pdf')) return <FiFileText className="text-red-500" />;
        return <FiFile className="text-gray-500" />;
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fade-in pb-20">
            <div className="lg:col-span-2 space-y-8">
                <div className="bg-[#141417]/80 backdrop-blur-3xl rounded-[2.5rem] p-8 border border-white/5 shadow-2xl">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                        <div>
                            <h3 className="text-2xl font-black text-white tracking-tight">Upload Portfolio</h3>
                            <p className="text-xs text-gray-500 font-black uppercase tracking-widest mt-1">Showcase your academic & creative work</p>
                        </div>
                        <div className="flex space-x-3">
                            <button
                                onClick={() => setShowComposeModal(true)}
                                className="bg-white/5 hover:bg-white/10 text-white px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all border border-white/10 flex items-center active:scale-95"
                            >
                                <FiEdit3 className="mr-3" size={18} />
                                Compose
                            </button>
                            <button
                                onClick={() => fileInputRef.current.click()}
                                disabled={isUploading}
                                className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-[0_10px_30px_rgba(37,99,235,0.3)] flex items-center justify-center active:scale-95"
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
                <div className="bg-gradient-to-br from-blue-600/20 to-purple-600/20 backdrop-blur-3xl rounded-[2.5rem] p-8 border border-blue-500/20 shadow-2xl relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 opacity-10 group-hover:scale-110 transition-transform">
                        <FiActivity size={120} />
                    </div>
                    <h3 className="text-lg font-black text-white tracking-tight flex items-center mb-6">
                        <FiClock className="mr-3 text-blue-400" /> COE Working Hours
                    </h3>

                    <div className="space-y-6 relative z-10">
                        <div>
                            <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest block mb-2">Total Accumulated Time</span>
                            <div className="text-4xl font-black text-white tracking-tight">
                                {formatTime(totalWorkingMs)}
                            </div>
                        </div>

                        {labSession && (
                            <div className="bg-white/10 rounded-2xl p-5 border border-white/10 animate-pulse">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Live Session</span>
                                    <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                                </div>
                                <div className="text-2xl font-black text-white tabular-nums mb-1">{liveSessionTime}</div>
                                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">Venue: {labSession.labName}</div>
                            </div>
                        )}

                        {!labSession && (
                            <p className="text-xs font-medium text-gray-500 italic leading-relaxed">
                                Scan the lab QR code to begin tracking your working hours. Timer stops upon session closure by Lab Incharge.
                            </p>
                        )}
                    </div>
                </div>

                <div className="bg-[#141417]/80 backdrop-blur-3xl rounded-[2.5rem] p-8 border border-white/5 shadow-2xl h-fit">
                    <div className="flex items-center justify-between mb-8">
                        <h3 className="text-lg font-black text-white tracking-tight flex items-center"><FiCalendar className="mr-3 text-blue-500" /> Activity</h3>
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
                            const hasUpload = hasUploadOnDate(day);
                            const isToday = day === new Date().getDate() && currentMonth.getMonth() === new Date().getMonth() && currentMonth.getFullYear() === new Date().getFullYear();
                            return (
                                <div key={day} className={`aspect-square rounded-xl flex items-center justify-center text-xs font-bold relative transition-all ${isToday ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'bg-white/5 text-gray-400'} ${hasUpload ? 'border border-emerald-500/30 bg-emerald-500/5' : ''}`}>
                                    {day}
                                    {hasUpload && <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center border-2 border-[#141417]"><FiCheckCircle size={8} className="text-white" /></div>}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* View Modal */}
            {viewWork && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-[#0a0a0b]/90 backdrop-blur-xl animate-fade-in">
                    <div className="bg-[#141417] rounded-[3rem] shadow-[0_20px_80px_rgba(0,0,0,0.8)] w-full max-w-lg border border-white/5 overflow-hidden">
                        <div className="p-10 text-center">
                            <div className="w-24 h-24 bg-white/5 rounded-[2rem] flex items-center justify-center mx-auto mb-8 border border-white/5 text-5xl">{getFileIcon(viewWork)}</div>
                            <h3 className="text-3xl font-black text-white tracking-tight mb-2 uppercase">{viewWork.topic}</h3>
                            <div className="bg-white/5 p-6 rounded-2xl border border-white/5 text-left mb-8 max-h-60 overflow-y-auto custom-scrollbar">
                                <span className="block text-[8px] font-black text-amber-500 uppercase tracking-widest mb-2">Work Material</span>
                                <p className="text-sm font-medium text-gray-400 leading-relaxed italic whitespace-pre-wrap">"{viewWork.content.length > 500 && !viewWork.isComposed ? viewWork.description : viewWork.content}"</p>
                            </div>
                            <div className="flex flex-col space-y-4">
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
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-[#0a0a0b]/95 backdrop-blur-2xl animate-fade-in">
                    <div className="bg-[#141417] rounded-[3rem] shadow-[0_20px_80px_rgba(0,0,0,0.8)] w-full max-w-2xl border border-white/5 relative overflow-hidden">
                        <div className="p-10 text-center">
                            <h3 className="text-3xl font-black text-white tracking-tight mb-2">Compose Work</h3>
                            <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-8">Draft your findings or activity report</p>
                            <div className="space-y-6 text-left">
                                <div>
                                    <label className="block text-[10px] font-black text-gray-600 uppercase tracking-widest mb-3 ml-1">Work Topic</label>
                                    <input type="text" className="w-full bg-white/5 border border-white/5 rounded-2xl py-5 px-6 text-sm font-bold text-white outline-none focus:border-amber-500 transition-all shadow-inner" value={composeData.topic} onChange={e => setComposeData({ ...composeData, topic: e.target.value })} placeholder="e.g. Algorithm Analysis: B-Trees" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-gray-600 uppercase tracking-widest mb-3 ml-1">The Work Execution Details</label>
                                    <textarea className="w-full bg-white/5 border border-white/5 rounded-2xl py-6 px-6 text-sm font-bold text-white outline-none focus:border-amber-500 transition-all shadow-inner h-64 resize-none" value={composeData.content} onChange={e => setComposeData({ ...composeData, content: e.target.value })} placeholder="Describe the work you've performed in detail..." />
                                </div>
                                <div className="pt-4 flex space-x-4">
                                    <button onClick={handleComposePublish} className="flex-1 py-5 bg-white text-black font-black rounded-2xl text-xs uppercase tracking-widest hover:bg-amber-500 hover:text-white transition-all transform active:scale-95 shadow-xl shadow-amber-900/20">Publish Insight</button>
                                    <button onClick={() => setShowComposeModal(false)} className="px-8 py-5 bg-white/5 text-gray-500 font-black rounded-2xl text-xs uppercase tracking-widest hover:bg-red-500/10 hover:text-red-500 transition-all border border-white/5">Discard</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Upload Modal (Existing) */}
            {showUploadModal && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-[#0a0a0b]/95 backdrop-blur-2xl animate-fade-in">
                    <div className="bg-[#141417] rounded-[3rem] shadow-[0_20px_80px_rgba(0,0,0,0.8)] w-full max-w-xl border border-white/5 relative overflow-hidden">
                        <div className="p-10 text-center">
                            <h3 className="text-3xl font-black text-white tracking-tight mb-2">Publish Lab Work</h3>
                            <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-8">Finalize your work session data</p>
                            <div className="space-y-6 text-left">
                                <div>
                                    <label className="block text-[10px] font-black text-gray-600 uppercase tracking-widest mb-3 ml-1">Topic Name</label>
                                    <input type="text" className="w-full bg-white/5 border border-white/5 rounded-2xl py-5 px-6 text-sm font-bold text-white outline-none focus:border-blue-500 transition-all shadow-inner" value={uploadData.topic} onChange={e => setUploadData({ ...uploadData, topic: e.target.value })} placeholder="e.g. Micro microprocessor Interfacing" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-gray-600 uppercase tracking-widest mb-3 ml-1">What did you do in the lab?</label>
                                    <textarea className="w-full bg-white/5 border border-white/5 rounded-2xl py-5 px-6 text-sm font-bold text-white outline-none focus:border-blue-500 transition-all shadow-inner h-32 resize-none" value={uploadData.description} onChange={e => setUploadData({ ...uploadData, description: e.target.value })} placeholder="Describe your experiments or accomplishments..." />
                                </div>
                                <div className="flex items-center space-x-4 p-5 bg-blue-500/5 rounded-2xl border border-blue-500/10 overflow-hidden">
                                    <FiFile className="text-blue-500 shrink-0" size={24} />
                                    <div className="overflow-hidden"><span className="block text-[8px] font-black text-blue-500 uppercase tracking-widest">Ready to publish</span><span className="block text-xs font-bold text-white truncate">{uploadData.file?.name}</span></div>
                                </div>
                                <div className="pt-4 flex space-x-4">
                                    <button onClick={handlePublish} disabled={isUploading} className="flex-1 py-5 bg-white text-black font-black rounded-2xl text-xs uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all transform active:scale-95 disabled:opacity-50">{isUploading ? 'Publishing...' : 'Publish Work'}</button>
                                    <button onClick={() => setShowUploadModal(false)} className="px-8 py-5 bg-white/5 text-gray-500 font-black rounded-2xl text-xs uppercase tracking-widest hover:bg-red-500/10 hover:text-red-500 transition-all border border-white/5">Cancel</button>
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
            `}} />
        </div>
    );
};

export default UploadWork;
