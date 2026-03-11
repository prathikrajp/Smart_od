import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { FiPrinter, FiMaximize, FiInfo } from 'react-icons/fi';
import { dataApi } from './api';

const QRCodePortal = ({ user }) => {
    const [locationMap, setLocationMap] = useState({});

    useEffect(() => {
        dataApi.getLocations().then(parsed => {
            const mapping = {};
            parsed.forEach(row => {
                mapping[row.className] = {
                    floor: row.floor,
                    bssid: row.bssid
                };
            });
            setLocationMap(mapping);
        }).catch(err => console.error(err));
    }, []);

    const locationName = user.role === 'LAB_INCHARGE' ? user.labName : user.className;
    
    // Normalize: "AI LAB" -> "AI" to match MAC_address.csv
    const normalizedName = locationName ? locationName.replace(/\s+LAB$/, '').trim() : '';
    const locData = locationMap[normalizedName] || locationMap[locationName] || { floor: 'Ground Floor', bssid: 'N/A' };

    const isLab = user.role === 'LAB_INCHARGE';

    // Generate QR values
    const entryQrValue = JSON.stringify({
        type: isLab ? 'LAB' : 'CLASS',
        scanType: 'ENTRY',
        name: locationName,
        id: user.id,
        floor: locData.floor,
        bssid: locData.bssid
    });

    const exitQrValue = isLab ? JSON.stringify({
        type: 'LAB',
        scanType: 'EXIT',
        name: locationName,
        id: user.id,
        floor: locData.floor,
        bssid: locData.bssid
    }) : null;

    const locationType = isLab ? 'Laboratory' : 'Classroom';

    const handlePrint = () => {
        window.print();
    };

    const QRCard = ({ qrValue, label, accentColor }) => (
        <div className="bg-[#141417]/90 backdrop-blur-3xl p-12 rounded-[4rem] shadow-[0_40px_100px_rgba(0,0,0,0.6)] border border-white/5 text-center print:shadow-none print:border-none print:p-0 print:bg-white relative overflow-hidden group">
            <div className={`absolute -top-24 -right-24 w-48 h-48 ${accentColor === 'red' ? 'bg-red-500/10 group-hover:bg-red-500/20' : 'bg-blue-500/10 group-hover:bg-blue-500/20'} rounded-full blur-[80px] transition-all duration-1000`}></div>

            <div className="mb-8 relative z-10">
                <span className={`px-5 py-2 ${accentColor === 'red' ? 'bg-red-500/10 text-red-500 border-red-500/20' : 'bg-blue-500/10 text-blue-500 border-blue-500/20'} rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] border`}>
                    {label}
                </span>
            </div>

            <h3 className="text-3xl font-black text-white mb-8 tracking-tight print:text-4xl print:text-black relative z-10">{locationName}</h3>

            <div className="inline-block p-8 bg-white rounded-[3rem] shadow-2xl mb-8 print:shadow-none print:p-0 border-8 border-white group-hover:scale-[1.02] transition-transform duration-500">
                <QRCodeSVG value={qrValue} size={240} level="H" includeMargin={false} />
            </div>

            <div className="space-y-2 print:mt-8 relative z-10">
                <p className="text-[10px] font-black text-gray-600 uppercase tracking-[0.4em]">{label}</p>
                <p className="text-xs font-mono text-gray-500 bg-white/5 px-4 py-2 rounded-xl inline-block border border-white/5">ID: {user.id}</p>
            </div>
        </div>
    );

    return (
        <div className="max-w-6xl mx-auto py-16 px-6 animate-fade-in">
            <div className="text-center mb-16 no-print">
                <h2 className="text-5xl font-black text-white tracking-tight mb-6">Location Beacon</h2>
                <p className="text-lg text-gray-500 font-medium tracking-wide">
                    Broadcasting unique check-in signal for <span className="text-blue-500 font-black">{locationName}</span>
                </p>
                <div className="flex items-center justify-center mt-6 space-x-4">
                    <span className="bg-white/5 text-gray-500 text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full border border-white/5 flex items-center">
                        <FiMaximize size={12} className="mr-2" /> {locData.floor}
                    </span>
                    <span className="bg-white/5 text-gray-500 text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full border border-white/5">
                        BSSID: {locData.bssid}
                    </span>
                </div>
            </div>

            <div className={`flex flex-col items-center justify-center ${isLab ? 'md:flex-row md:items-start md:gap-12' : ''}`}>
                <QRCard qrValue={entryQrValue} label={`${locationType} Entry Scanner`} accentColor="blue" />
                {isLab && exitQrValue && (
                    <QRCard qrValue={exitQrValue} label="Lab Exit Scanner" accentColor="red" />
                )}
            </div>

            <div className="flex justify-center mt-12 no-print">
                <button
                    onClick={handlePrint}
                    className="flex items-center px-10 py-5 bg-white text-black font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-blue-600 hover:text-white transition-all shadow-2xl active:scale-95"
                >
                    <FiPrinter className="mr-3" size={20} /> Generate Poster
                </button>
            </div>

            <div className="mt-16 max-w-md mx-auto no-print p-8 bg-blue-500/5 rounded-[2rem] border border-blue-500/10 backdrop-blur-md">
                <div className="flex items-start">
                    <div className="bg-blue-500/10 p-3 rounded-2xl mr-5 border border-blue-500/20">
                        <FiMaximize size={22} className="text-blue-500" />
                    </div>
                    <div>
                        <h4 className="text-sm font-black text-blue-500 uppercase tracking-widest mb-2">Protocol Guidelines</h4>
                        <p className="text-xs text-gray-400 leading-relaxed font-medium">
                            Deploy this physical gateway near the primary access point of your {locationType.toLowerCase()}.
                            {isLab && ' Place the Exit Scanner near the exit door for break tracking.'}
                            {' '}The hardware-encrypted BSSID and Floor parameters are embedded for verification.
                        </p>
                    </div>
                </div>
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
                @media print {
                    .no-print { display: none !important; }
                    body { background: white !important; }
                    main { padding: 0 !important; margin: 0 !important; max-width: 100% !important; }
                }
            ` }} />
        </div>
    );
};


export default QRCodePortal;
