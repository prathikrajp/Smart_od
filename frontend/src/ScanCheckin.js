import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FiCamera as Camera, FiCheckCircle as CheckCircle2, FiXCircle as XCircle, FiInfo, FiClock, FiMapPin, FiWifi } from 'react-icons/fi';
import { MdFingerprint as Fingerprint } from 'react-icons/md';
import { presenceApi, sessionApi, odApi, dataApi } from './api';
import { Html5Qrcode } from 'html5-qrcode';

// ─── GPS Geofencing Configuration ─────────────────────────────────────────────
const GPS_RADIUS_METERS = 100; // Default radius if not specified per-lab

/**
 * Computes distance between two GPS coordinates in metres (Haversine formula).
 */
const haversineDistance = (lat1, lng1, lat2, lng2) => {
    const R = 6371000;
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// ─── Timer Configuration ───────────────────────────────────────────────────────
const IS_MOCK_MODE = false;          // true = mock (10-min cycle), false = real (daily window)
const MOCK_WINDOW_SECONDS = 60;      // Mock: how long the window stays open (seconds)
const MOCK_CYCLE_SECONDS = 10 * 60; // Mock: repeat every 10 minutes
const REAL_WINDOW_MINUTES = 30;      // Real: window duration after OD inTime
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Computes whether the scan window is currently open.
 * Returns { open: boolean, label: string, secondsRemaining: number }
 */
const computeScanWindow = (activeOD) => {
    const now = new Date();

    if (IS_MOCK_MODE) {
        const totalSeconds = now.getMinutes() * 60 + now.getSeconds();
        const posInCycle = totalSeconds % MOCK_CYCLE_SECONDS;

        if (posInCycle < MOCK_WINDOW_SECONDS) {
            const remaining = MOCK_WINDOW_SECONDS - posInCycle;
            return {
                open: true,
                label: `Scan window closes in ${remaining}s`,
                secondsRemaining: remaining,
            };
        } else {
            const nextOpen = MOCK_CYCLE_SECONDS - posInCycle;
            const mins = Math.floor(nextOpen / 60);
            const secs = nextOpen % 60;
            return {
                open: false,
                label: mins > 0 ? `Next window in ${mins}m ${secs}s` : `Next window in ${secs}s`,
                secondsRemaining: 0,
            };
        }
    } else {
        // Real mode: daily window from inTime for REAL_WINDOW_MINUTES
        if (!activeOD?.inTime) {
            return { open: false, label: 'No active OD', secondsRemaining: 0 };
        }

        const today = now.toISOString().split('T')[0];
        if (today < activeOD.startDate || today > activeOD.endDate) {
            return { open: false, label: 'OD not active today', secondsRemaining: 0 };
        }

        const [h, m] = activeOD.inTime.split(':').map(Number);
        const windowStart = new Date(now);
        windowStart.setHours(h, m, 0, 0);
        const windowEnd = new Date(windowStart);
        windowEnd.setMinutes(windowEnd.getMinutes() + REAL_WINDOW_MINUTES);

        if (now >= windowStart && now < windowEnd) {
            const remaining = Math.ceil((windowEnd - now) / 1000);
            const mins = Math.floor(remaining / 60);
            const secs = remaining % 60;
            return {
                open: true,
                label: `Window closes in ${mins}m ${secs}s`,
                secondsRemaining: remaining,
            };
        } else if (now < windowStart) {
            const secsUntil = Math.ceil((windowStart - now) / 1000);
            const mins = Math.floor(secsUntil / 60);
            const secs = secsUntil % 60;
            return {
                open: false,
                label: `Opens at ${activeOD.inTime} (in ${mins}m ${secs}s)`,
                secondsRemaining: 0,
            };
        } else {
            return { open: false, label: 'Scan window closed for today', secondsRemaining: 0 };
        }
    }
};

const ScanCheckin = ({ user }) => {
    const [scanning, setScanning] = useState(false);
    const [result, setResult] = useState(null);
    const [locationInfo, setLocationInfo] = useState(null);
    const [activeOD, setActiveOD] = useState(null);
    const [labMetadata, setLabMetadata] = useState(null);
    const [classMetadata, setClassMetadata] = useState(null);
    const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());
    const [scanWindow, setScanWindow] = useState({ open: false, label: 'Initializing...', secondsRemaining: 0 });

    // GPS auto-stop state
    const [gpsStatus, setGpsStatus] = useState(null); // 'inside' | 'outside' | 'unavailable' | null
    const gpsWatchRef = useRef(null);
    const labMetadataRef = useRef(null);
    const activeSessionRef = useRef(null); // tracks if a session is active

    // QR Scanner States
    const [isQrScanning, setIsQrScanning] = useState(false);
    const qrScannerRef = useRef(null);
    const qrRegionId = "qr-reader";

    // Face Recognition States
    const [faceVerified, setFaceVerified] = useState(IS_MOCK_MODE); // Auto-verify in mock mode
    const [isFaceScanning, setIsFaceScanning] = useState(false);
    const [faceStatus, setFaceStatus] = useState("Face Verification Required");
    const [modelsLoaded, setModelsLoaded] = useState(false);
    const [faceAttempts, setFaceAttempts] = useState(0); // Added for 3-attempt limit
    const referenceDescriptor = useRef(null);
    const videoRef = React.useRef(null);

    // Keep activeOD in a ref so the clock callback can read the latest value
    const activeODRef = React.useRef(activeOD);
    useEffect(() => { activeODRef.current = activeOD; }, [activeOD]);

    // ─── GPS Auto-Stop Logic ────────────────────────────────────────────────────
    const stopSessionOnGPSExit = useCallback(async (studentId) => {
        try {
            const sessions = await sessionApi.getActiveSessions();
            const session = sessions[studentId];
            if (!session || !session.isActive) return;

            if (session.isPaused) return;

            const now = Date.now();
            await sessionApi.updateSession(studentId, {
                isActive: false,
                endTime: now,
                stoppedBy: 'GPS_EXIT'
            });
            console.log('[GPS] Timer auto-stopped via API: student left GPS region.');
        } catch (err) { console.error(err); }
    }, []);

    const startGPSWatch = useCallback((labMeta, studentId) => {
        if (!navigator.geolocation) {
            setGpsStatus('unavailable');
            return;
        }

        const labLat = parseFloat(labMeta?.lat);
        const labLng = parseFloat(labMeta?.lng);
        const radius = parseFloat(labMeta?.radius) || GPS_RADIUS_METERS;

        // If the lab has no GPS coords, skip GPS monitoring
        if (!labLat || !labLng || isNaN(labLat) || isNaN(labLng)) {
            setGpsStatus('unavailable');
            return;
        }

        if (gpsWatchRef.current !== null) {
            navigator.geolocation.clearWatch(gpsWatchRef.current);
        }

        gpsWatchRef.current = navigator.geolocation.watchPosition(
            (pos) => {
                const dist = haversineDistance(pos.coords.latitude, pos.coords.longitude, labLat, labLng);
                const inside = dist <= radius;
                setGpsStatus(inside ? 'inside' : 'outside');

                if (!inside) {
                    stopSessionOnGPSExit(studentId);
                }
            },
            () => setGpsStatus('unavailable'),
            { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
        );
    }, [stopSessionOnGPSExit]);

    useEffect(() => {
        labMetadataRef.current = labMetadata;
    }, [labMetadata]);

    // ─── Main Setup Effect ──────────────────────────────────────────────────────
    useEffect(() => {
        // 1. Live Clock + Scan Window Timer
        const clockInterval = setInterval(() => {
            setCurrentTime(new Date().toLocaleTimeString());
            setScanWindow(computeScanWindow(activeODRef.current));
        }, 1000);

        // 2. Load face-api.js from CDN
        const script = document.createElement('script');
        script.src = "https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js";
        script.async = true;
        script.onload = () => {
            const loadModels = async () => {
                const MODEL_URL = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights';
                await window.faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
                await window.faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
                await window.faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
                setModelsLoaded(true);
            };
            loadModels();
        };
        document.body.appendChild(script);

        // 3. Find the latest APPROVED OD for this student from API
        const loadODData = async () => {
            try {
                const allRequests = await odApi.getAllRequests();
                const myActiveOD = allRequests
                    .filter(r => r.studentId === user.id && r.status === 'APPROVED')
                    .sort((a, b) => b.id - a.id)[0];

                if (myActiveOD) {
                    setActiveOD(myActiveOD);
                    setScanWindow(computeScanWindow(myActiveOD));
                } else {
                    setScanWindow(computeScanWindow(null));
                }

                // 4. Fetch All Location Metadata from API
                const locations = await dataApi.getLocations();
                if (myActiveOD) {
                    const labMeta = locations.find(loc => loc.className === myActiveOD.labName);
                    setLabMetadata(labMeta);
                    labMetadataRef.current = labMeta;
                }
                const classMeta = locations.find(loc => loc.className === user.className);
                setClassMetadata(classMeta);
            } catch (err) { console.error(err); }
        };

        loadODData();

        return () => {
            clearInterval(clockInterval);
            if (script.parentNode) document.body.removeChild(script);
            if (gpsWatchRef.current !== null) {
                navigator.geolocation.clearWatch(gpsWatchRef.current);
            }
        };
    }, [user.id, user.className]);

    const startFaceVerification = async () => {
        if (faceAttempts >= 3) {
            setFaceStatus("Access Blocked: Max Attempts Reached");
            return;
        }

        setIsFaceScanning(true);
        setFaceStatus("Starting Camera...");

        try {
            // ─── 1. Start Camera Feed First (Ensures UI feedback is fast) ────────
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } 
            });
            
            // Give React a moment to render the <video> element
            await new Promise(resolve => setTimeout(resolve, 300));

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            } else {
                // Retry once if ref isn't ready
                await new Promise(resolve => setTimeout(resolve, 500));
                if (videoRef.current) videoRef.current.srcObject = stream;
                else throw new Error("Video element mounting failed");
            }

            // ─── 2. Search and Load Reference Face in Background ─────────────────
            setFaceStatus("Loading Reference Bio-data...");
            const studentId = user.id;

            if (!referenceDescriptor.current) {
                const apiUrl = process.env.REACT_APP_API_URL || '/api';
                const img = await window.faceapi.fetchImage(`${apiUrl}/faces/${studentId}`);
                const fullDesc = await window.faceapi.detectSingleFace(img, new window.faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptor();
                
                if (!fullDesc) {
                    setFaceStatus("Ref Photo Quality Low");
                    return;
                }
                referenceDescriptor.current = fullDesc.descriptor;
            }

            setFaceStatus("Camera Live. Click Capture & Verify.");
        } catch (err) {
            console.error("Camera/Face init error:", err);
            setFaceStatus(`Error: ${err.message || 'Access Denied'}`);
            setIsFaceScanning(false);
            
            // Clean up stream if it was started
            try {
                const stream = videoRef.current?.srcObject;
                if (stream) stream.getTracks().forEach(track => track.stop());
            } catch (e) {}
        }
    };

    const handleCaptureAndVerify = async () => {
        if (!videoRef.current || !window.faceapi || !modelsLoaded || !referenceDescriptor.current) return;

        setFaceStatus("Capturing & Verifying...");
        
        try {
            const detections = await window.faceapi.detectSingleFace(videoRef.current, new window.faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptor();

            if (detections) {
                const distance = window.faceapi.euclideanDistance(detections.descriptor, referenceDescriptor.current);
                console.log("Matching distance:", distance);

                if (distance < 0.6) {
                    setFaceStatus("Verification Success!");
                    setTimeout(() => {
                        const stream = videoRef.current.srcObject;
                        if (stream) stream.getTracks().forEach(track => track.stop());
                        setFaceVerified(true);
                        setIsFaceScanning(false);
                        // Automatically trigger QR scanner for a seamless flow
                        startQrScanner();
                    }, 1500);
                } else {
                    const newAttempts = faceAttempts + 1;
                    setFaceAttempts(newAttempts);
                    if (newAttempts >= 3) {
                        setFaceStatus("Access Blocked: 3 Failed Matches");
                        const stream = videoRef.current.srcObject;
                        if (stream) stream.getTracks().forEach(track => track.stop());
                        setIsFaceScanning(false);
                    } else {
                        setFaceStatus(`Match Failed (Attempt ${newAttempts}/3)`);
                    }
                }
            } else {
                setFaceStatus("No Face Detected! Please try again.");
            }
        } catch (err) {
            console.error("Capture verify error:", err);
            setFaceStatus("Verification Error. Try again.");
        }
    };

    const handleRescan = () => {
        const stream = videoRef.current?.srcObject;
        if (stream) stream.getTracks().forEach(track => track.stop());
        setIsFaceScanning(false);
        setFaceStatus("Face Verification Required");
    };

    const startQrScanner = async () => {
        setIsQrScanning(true);
        setResult(null);
        
        // Give React a moment to render the scanner div
        setTimeout(async () => {
            try {
                const html5QrCode = new Html5Qrcode(qrRegionId);
                qrScannerRef.current = html5QrCode;

                const qrConfig = { fps: 10, qrbox: { width: 250, height: 250 } };
                
                await html5QrCode.start(
                    { facingMode: "environment" }, 
                    qrConfig, 
                    (decodedText) => {
                        console.log("QR Decoded:", decodedText);
                        stopQrScanner();
                        handleCheckIn(decodedText);
                    },
                    (errorMessage) => {
                        // ignore noise
                    }
                );
            } catch (err) {
                console.error("QR Scanner start error:", err);
                setIsQrScanning(false);
            }
        }, 500);
    };

    const stopQrScanner = async () => {
        if (qrScannerRef.current && qrScannerRef.current.isScanning) {
            try {
                await qrScannerRef.current.stop();
                await qrScannerRef.current.clear();
            } catch (err) {
                console.error("QR Scanner stop error:", err);
            }
        }
        setIsQrScanning(false);
    };

    const handleCheckIn = (scannedData) => {
        setScanning(true);
        setResult(null);

        setTimeout(() => {
            try {
                const data = JSON.parse(scannedData);
                if (data.type && data.name) {
                    // Report presence to backend
                    presenceApi.reportPresence({
                        studentId: user.id,
                        studentName: user.name,
                        advisorName: user.classAdvisorName, // Added for dual notifications
                        className: user.className,           // Added for dual notifications
                        type: data.type,
                        name: data.name,
                        facultyId: data.id,
                        floor: data.floor || 'Ground Floor',
                        bssid: data.bssid || 'N/A',
                        timestamp: new Date().toISOString()
                    });

                    // ── Auto-Start COE Lab Session Timer on QR Scan ──────────────
                    if (data.type === 'LAB') {
                        const startSession = async () => {
                            try {
                                const sessions = await sessionApi.getActiveSessions();
                                if (!sessions[user.id]?.isActive) {
                                    const labMeta = labMetadataRef.current;
                                    const gpsRegion = (labMeta?.lat && labMeta?.lng)
                                        ? {
                                            lat: parseFloat(labMeta.lat),
                                            lng: parseFloat(labMeta.lng),
                                            radius: parseFloat(labMeta.radius) || GPS_RADIUS_METERS
                                        }
                                        : null;

                                    await sessionApi.startSession({
                                        studentId: user.id,
                                        labName: data.name,
                                        studentName: user.name,
                                        startedBy: 'QR_SCAN',
                                        gpsRegion
                                    });
                                    activeSessionRef.current = true;
                                    if (gpsRegion) startGPSWatch(labMeta, user.id);
                                }
                            } catch (err) { console.error(err); }
                        };
                        startSession();
                    }

                    if (activeOD) {
                        odApi.updateStatus(activeOD.id, { scanned: true }).then(() => {
                            setActiveOD({ ...activeOD, scanned: true });
                        });
                    }

                    // ── Trigger Digital Sign-In Notification for Lab Incharge ──
                    if (data.type === 'LAB') {
                        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        // We can use a dedicated notification object or just rely on the Presence record.
                        // Here we'll ensure the presenceApi.reportPresence is called and perhaps add a specific flag.
                        console.log(`[Notification] ${user.name} digitally signed in into ${data.name} at ${time}`);
                    }

                    setLocationInfo(data);
                    setResult('success');
                    
                    // Reset Face Verification so it must be done again for next scan (e.g. going from Lab to Class)
                    setFaceVerified(false);
                    setFaceStatus("Face Verification Required");
                } else {
                    setResult('error_location');
                }
            } catch (e) {
                setResult('error_location');
            }
            setScanning(false);
        }, 1200);
    };

    // Derive whether each button should be active
    const canScanLab = scanWindow.open && activeOD && labMetadata && !activeOD.scanned;
    // Class scans are always open if the metadata is available, but still require Face-ID verification
    const canScanClass = !!classMetadata; 

    // Window indicator color
    const windowColor = scanWindow.open
        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
        : 'bg-amber-500/10 border-amber-500/20 text-amber-400';

    // GPS indicator color
    const gpsColor = gpsStatus === 'inside'
        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
        : gpsStatus === 'outside'
            ? 'bg-red-500/10 border-red-500/20 text-red-400'
            : 'bg-gray-500/10 border-gray-500/20 text-gray-500';

    const gpsLabel = gpsStatus === 'inside'
        ? '📍 Inside Lab Region'
        : gpsStatus === 'outside'
            ? '⚠️ Outside Lab Region — Timer will auto-stop'
            : gpsStatus === 'unavailable'
                ? '📡 GPS unavailable / lab has no GPS zone'
                : null;

    return (
        <div className="max-w-md mx-auto py-12 px-4 animate-fade-in">
            <div className="text-center mb-10">
                <h2 className="text-4xl font-extrabold text-white leading-tight tracking-tight">Scanner Portal</h2>
                <div className="mt-4 flex items-center justify-center space-x-3 bg-blue-500/10 border border-blue-500/20 py-2 px-6 rounded-2xl mx-auto inline-flex">
                    <FiClock className="text-blue-500 animate-pulse" />
                    <span className="text-blue-400 font-black text-sm tabular-nums">{currentTime}</span>
                </div>
            </div>

            {/* Active Task Info */}
            <div className="mb-6 space-y-4">
                {activeOD ? (
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-3xl p-6 shadow-xl shadow-blue-900/10 transition-all hover:bg-blue-500/20 group">
                        <div className="flex items-center space-x-4 mb-4">
                            <div className="bg-blue-500/20 p-3 rounded-2xl text-blue-500 group-hover:scale-110 transition-transform">
                                <FiInfo size={20} />
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest leading-none mb-1">Target Resource (Lab)</p>
                                <p className="text-lg font-bold text-white leading-tight">{activeOD.labName}</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
                            <div>
                                <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Purpose</p>
                                <p className="text-xs font-bold text-gray-300 truncate">{activeOD.purpose}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Safety Status</p>
                                <p className="text-[10px] font-black text-emerald-400 uppercase tracking-tighter">Verified: {faceVerified ? 'YES' : 'PENDING'}</p>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="bg-amber-500/5 border border-amber-500/20 rounded-3xl p-6 text-center">
                        <p className="text-sm font-bold text-amber-500 italic">No Approved OD Activity Detected</p>
                    </div>
                )}

                {/* Scan Window Status Banner */}
                <div className={`flex items-center justify-between px-5 py-3 rounded-2xl border ${windowColor} transition-all`}>
                    <div className="flex items-center space-x-2">
                        <span className={`w-2 h-2 rounded-full ${scanWindow.open ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                        <span className="text-[10px] font-black uppercase tracking-widest">
                            {scanWindow.open ? 'LIVE STATUS: ACTIVE' : 'Scan Window Closed'}
                        </span>
                    </div>
                    <span className="text-[10px] font-bold tabular-nums">{scanWindow.label}</span>
                </div>

                {/* GPS Status Banner — only shown after a scan starts a session */}
                {gpsLabel && (
                    <div className={`flex items-center justify-between px-5 py-3 rounded-2xl border ${gpsColor} transition-all`}>
                        <div className="flex items-center space-x-2">
                            <FiMapPin size={12} />
                            <span className="text-[10px] font-black uppercase tracking-widest">GPS Zone</span>
                        </div>
                        <span className="text-[10px] font-bold">{gpsLabel}</span>
                    </div>
                )}
            </div>

            {/* Scanner Body */}
            <div className="bg-[#141417] rounded-[2rem] sm:rounded-[2.5rem] shadow-2xl border border-white/5 overflow-hidden relative">
                <div className="bg-gray-900 aspect-square sm:aspect-auto sm:min-h-[400px] relative flex items-center justify-center">
                    {scanning ? (
                        <div className="absolute inset-0 bg-[#0a0a0b]/90 flex flex-col items-center justify-center backdrop-blur-md z-30">
                            <div className="w-20 h-20 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-6"></div>
                            <p className="text-blue-400 font-black uppercase text-xs tracking-widest animate-pulse">Syncing with Campus AP...</p>
                        </div>
                    ) : result === null ? (
                        <div className="text-center p-8 w-full h-full flex flex-col items-center justify-center">
                            {(!faceVerified && !IS_MOCK_MODE) ? (
                                <div className="w-full flex flex-col items-center">
                                    <div className="w-48 h-48 sm:w-64 sm:h-64 border-2 border-dashed border-gray-800 rounded-[2.5rem] sm:rounded-[3rem] mb-6 sm:mb-10 flex items-center justify-center bg-white/5 relative group overflow-hidden">
                                        {isFaceScanning ? (
                                            <video ref={videoRef} autoPlay muted playsInline className="absolute inset-0 w-full h-full object-cover scale-x-[-1]" />
                                        ) : (
                                            <Camera className="text-gray-700 group-hover:text-blue-500 transition-colors" size={48} />
                                        )}
                                        <div className="absolute inset-6 sm:inset-8 border-2 border-blue-500/20 rounded-3xl animate-pulse pointer-events-none"></div>
                                        <div className="absolute inset-0 border-[12px] sm:border-[16px] border-[#141417] rounded-[2.5rem] sm:rounded-[3rem] pointer-events-none"></div>
                                    </div>
                                    <p className={`text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] mb-6 sm:mb-8 ${faceStatus.includes('Verified') ? 'text-emerald-500' : 'text-gray-500'}`}>
                                        {faceStatus}
                                    </p>
                                    
                                    {isFaceScanning ? (
                                        <div className="w-full flex flex-col sm:flex-row gap-3">
                                            <button
                                                onClick={handleCaptureAndVerify}
                                                className="flex-1 py-4 sm:py-5 bg-blue-600 text-white rounded-2xl text-[10px] sm:text-[11px] font-black shadow-xl transition-all active:scale-95 uppercase tracking-[0.15em]"
                                            >
                                                Capture & Verify
                                            </button>
                                            <button
                                                onClick={handleRescan}
                                                className="px-6 sm:px-8 py-4 sm:py-5 bg-white/5 text-gray-400 border border-white/5 rounded-2xl text-[10px] sm:text-[11px] font-black transition-all active:scale-95 uppercase tracking-[0.15em]"
                                            >
                                                Rescan
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={startFaceVerification}
                                            disabled={isFaceScanning || !modelsLoaded}
                                            className="w-full py-5 bg-white text-black rounded-2xl text-[11px] font-black shadow-xl transition-all active:scale-95 uppercase tracking-[0.15em] disabled:opacity-30"
                                        >
                                            {!modelsLoaded ? 'Loading Models...' : 'Verify My Face First'}
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div className="w-full space-y-4 px-4 animate-scale-in">
                                    {isQrScanning ? (
                                        <div className="w-full flex flex-col items-center">
                                            <div id={qrRegionId} className="w-full aspect-square bg-black rounded-3xl overflow-hidden border border-white/10 mb-6"></div>
                                            <button
                                                onClick={stopQrScanner}
                                                className="w-full py-4 bg-red-500/10 text-red-500 rounded-2xl text-[11px] font-black border border-red-500/20 uppercase tracking-[0.15em] transition-all active:scale-95"
                                            >
                                                Cancel QR Scan
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="w-full space-y-4">
                                            <div className="flex items-center justify-center mb-6 space-x-2 text-emerald-500">
                                                <CheckCircle2 size={24} />
                                                <span className="text-[10px] font-black uppercase tracking-widest text-center">
                                                    Identity Verified - Face Match Confirmed
                                                </span>
                                            </div>
                                            
                                            <button
                                                onClick={startQrScanner}
                                                className="w-full py-6 bg-blue-600 hover:bg-blue-500 text-white rounded-3xl text-[13px] font-black shadow-2xl shadow-blue-900/40 transition-all active:scale-95 uppercase tracking-[0.2em] flex flex-col items-center border border-blue-400/20"
                                            >
                                                <Camera className="mb-2" size={24} />
                                                <span>Open QR Scanner</span>
                                                <span className="text-[9px] opacity-70 font-bold mt-1 tracking-normal">Align with Lab/Class QR Code</span>
                                            </button>

                                            {(canScanLab || canScanClass) && (
                                                <div className="pt-4 border-t border-white/5">
                                                    <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest text-center mb-1">Available Resources</p>
                                                    <div className="flex justify-center gap-2 flex-wrap">
                                                        {canScanLab && <span className="px-3 py-1 bg-blue-500/10 text-blue-400 rounded-full text-[8px] font-black uppercase border border-blue-500/20">{activeOD?.labName}</span>}
                                                        {canScanClass && <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 rounded-full text-[8px] font-black uppercase border border-emerald-500/20">{user.className}</span>}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="bg-[#141417] absolute inset-0 flex flex-col items-center justify-center p-10 text-center z-40">
                            {result === 'success' ? (
                                <>
                                    <div className="bg-emerald-500/10 text-emerald-500 rounded-[2rem] p-8 mb-6 border border-emerald-500/20 animate-bounce">
                                        <CheckCircle2 size={64} />
                                    </div>
                                    <h3 className="text-2xl font-black text-white mb-2 uppercase tracking-tight">Access Verified</h3>
                                    {locationInfo?.type === 'LAB' && (
                                        <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-6 animate-pulse">
                                            ⏱ Timer Started Automatically
                                        </p>
                                    )}
                                    <div className="w-full space-y-4 text-left bg-white/5 p-6 rounded-3xl border border-white/5 shadow-inner">
                                        <div className="flex items-center justify-between">
                                            <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Venue</p>
                                            <p className="text-sm font-bold text-white">{locationInfo.name}</p>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Type</p>
                                            <p className="text-sm font-bold text-white">{locationInfo.type}</p>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Floor</p>
                                            <p className="text-sm font-bold text-white">{locationInfo.floor || 'Ground Floor'}</p>
                                        </div>
                                        <div className="flex items-center justify-between pt-3 border-t border-white/5">
                                            <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Physical Signature</p>
                                            <p className="text-sm font-black text-emerald-400 font-mono tracking-tighter">{locationInfo.name}</p>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="bg-red-500/10 text-red-500 rounded-[2rem] p-8 mb-8 border border-red-500/20">
                                        <XCircle size={64} />
                                    </div>
                                    <h3 className="text-2xl font-black text-white mb-4 uppercase">Signal Collision</h3>
                                    <p className="text-gray-500 mb-8 text-xs font-medium">Authentication failed. Unable to resolve campus BSSID.</p>
                                </>
                            )}
                            <button
                                onClick={() => setResult(null)}
                                className="w-full mt-6 py-5 bg-white text-black rounded-2xl font-black uppercase tracking-[0.2em] text-xs hover:bg-gray-200 active:scale-95 shadow-2xl"
                            >
                                Re-verify Location
                            </button>
                        </div>
                    )}
                </div>

                <div className="bg-white/5 p-8 flex items-start space-x-6 border-t border-white/5">
                    <Fingerprint className="text-blue-500 mt-1 shrink-0" size={32} />
                    <div>
                        <p className="text-xs text-white font-black uppercase tracking-[0.2em]">Infrastructure Telemetry</p>
                        <p className="text-[10px] text-gray-500 mt-2 leading-relaxed font-medium">
                            {faceVerified
                                ? 'Hardware authorization complete. QR scanning interface initialized. Timer starts on lab scan.'
                                : 'Biometric verification initialized. Please look into the camera to unlock scanning hardware.'}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ScanCheckin;
