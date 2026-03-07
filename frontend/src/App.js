import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Switch, Link, Redirect, useHistory } from 'react-router-dom';
import Home from './Home';
import AdminDashboard from './AdminDashboard';
import Rooms from './Rooms';
import ScanCheckin from './ScanCheckin';
import Login from './Login';
import ODStatus from './ODStatus';
import QRCodePortal from './QRCodePortal';
import ProfileDropdown from './ProfileDropdown';
import Notifications from './Notifications';
import SystemMonitor from './SystemMonitor';
import { FiLogOut, FiUser, FiCheckCircle, FiMaximize, FiGrid, FiAlertCircle, FiRefreshCw } from 'react-icons/fi';

const ProtectedRoute = ({ component: Component, user, ...rest }) => (
    <Route {...rest} render={(props) => (
        user ? <Component {...props} user={user} /> : <Redirect to="/login" />
    )} />
);

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }
    componentDidCatch(error, errorInfo) {
        console.error("APPLICATION_STABILITY_ERROR:", error, errorInfo);
    }
    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-[#0a0a0b] flex items-center justify-center p-8">
                    <div className="max-w-md w-full bg-[#141417] rounded-[2.5rem] border border-red-500/20 p-12 text-center shadow-2xl">
                        <div className="w-20 h-20 bg-red-500/10 rounded-[1.5rem] flex items-center justify-center mx-auto mb-8 border border-red-500/20">
                            <FiAlertCircle className="text-red-500" size={40} />
                        </div>
                        <h2 className="text-2xl font-black text-white mb-4">Dashboard Error</h2>
                        <p className="text-gray-500 text-sm mb-8 leading-relaxed">
                            Something crashed while rendering this page. This usually happens if your user session is corrupted or data is still loading.
                        </p>
                        <div className="space-y-4">
                            <button 
                                onClick={() => window.location.href = '/'}
                                className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-black text-xs uppercase tracking-widest rounded-2xl transition-all shadow-lg shadow-blue-900/20"
                            >
                                <FiRefreshCw className="inline mr-2" /> Reload Application
                            </button>
                            <button 
                                onClick={() => {
                                    localStorage.clear();
                                    window.location.href = '/login';
                                }}
                                className="w-full py-4 bg-white/5 hover:bg-white/10 text-gray-400 font-bold text-xs uppercase tracking-widest rounded-2xl transition-all border border-white/5"
                            >
                                Reset & Log Out
                            </button>
                        </div>
                        {process.env.NODE_ENV === 'development' && (
                            <div className="mt-8 p-4 bg-black/40 rounded-xl text-left overflow-auto max-h-40">
                                <code className="text-[10px] text-red-400/70 block whitespace-pre-wrap">{this.state.error?.toString()}</code>
                            </div>
                        )}
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

function App() {
    const [user, setUser] = useState(null);

    useEffect(() => {
        const savedUser = localStorage.getItem('user');
        if (savedUser) {
            setUser(JSON.parse(savedUser));
        }
    }, []);

    const handleLogin = (userData) => {
        setUser(userData);
    };

    const handleLogout = () => {
        localStorage.removeItem('user');
        setUser(null);
    };

    return (
        <Router>
            <ErrorBoundary>
                <div className="min-h-screen bg-[#0a0a0b] text-white font-['Outfit'] selection:bg-blue-500/30">
                    {user && <SystemMonitor />}
                {/* Navigation - Only visible if logged in */}
                {user && (
                    <nav className="bg-[#141417]/80 backdrop-blur-xl sticky top-0 z-50 border-b border-white/5 shadow-2xl">
                        <div className="max-w-7xl mx-auto px-6 lg:px-8">
                            <div className="flex justify-between h-20">
                                <div className="flex items-center">
                                    <div className="h-10 mr-6 flex items-center">
                                        <img src="/new_logo_transparent.png" alt="CIT Logo" className="h-full w-auto object-contain" />
                                    </div>
                                    <span className="text-2xl font-black text-white tracking-[-0.05em] mr-12 group cursor-pointer transition-all">
                                        Smart<span className="text-blue-500">OD</span>
                                        <div className="h-1 w-0 group-hover:w-full bg-blue-500 transition-all duration-500 rounded-full"></div>
                                    </span>
                                    <div className="flex space-x-2">
                                        {user.role === 'STUDENT' ? (
                                            <>
                                                <Link to="/" className="flex items-center px-5 py-2.5 text-xs font-black text-gray-500 hover:text-white rounded-xl transition-all hover:bg-white/5 uppercase tracking-widest leading-none">
                                                    <FiCheckCircle className="mr-3 text-blue-500" size={18} />
                                                    Terminal
                                                </Link>
                                                <Link to="/scan" className="flex items-center px-5 py-2.5 text-xs font-black text-gray-500 hover:text-white rounded-xl transition-all hover:bg-white/5 uppercase tracking-widest leading-none">
                                                    <FiMaximize className="mr-3 text-blue-500" size={18} />
                                                    Scanner
                                                </Link>
                                            </>
                                        ) : (
                                            <Link to="/admin" className="flex items-center px-5 py-2.5 text-xs font-black text-gray-500 hover:text-white rounded-xl transition-all hover:bg-white/5 uppercase tracking-widest leading-none">
                                                <FiCheckCircle className="mr-3 text-blue-500" size={18} />
                                                Dashboard
                                            </Link>
                                        )}
                                        {user && (user.role === 'LAB_INCHARGE' || user.role === 'ADVISOR') && (
                                            <Link to="/qrcode" className="flex items-center px-5 py-2.5 text-xs font-black text-gray-500 hover:text-white rounded-xl transition-all hover:bg-white/5 uppercase tracking-widest leading-none">
                                                <FiGrid className="mr-3 text-blue-500" size={18} />
                                                Portal
                                            </Link>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center space-x-6">
                                    <Notifications user={user} />
                                    <ProfileDropdown user={user} onLogout={handleLogout} />
                                    <button
                                        onClick={handleLogout}
                                        className="p-3 text-gray-400 hover:text-red-500 transition-all hover:bg-red-500/10 rounded-2xl border border-transparent hover:border-red-500/20"
                                        title="Terminate Session"
                                    >
                                        <FiLogOut size={22} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </nav>
                )}

                <main className={user ? "max-w-7xl mx-auto py-12 px-6 lg:px-8" : ""}>
                    <Switch>
                        <Route path="/login" render={() => user ? <Redirect to={user.role === 'STUDENT' ? '/' : '/admin'} /> : <Login onLogin={handleLogin} />} />

                        <ProtectedRoute exact path="/" user={user} component={user?.role === 'STUDENT' ? ODStatus : () => <Redirect to="/admin" />} />
                        <ProtectedRoute path="/scan" user={user} component={user?.role === 'STUDENT' ? ScanCheckin : () => <Redirect to="/admin" />} />
                        <ProtectedRoute path="/admin" user={user} component={user?.role !== 'STUDENT' ? AdminDashboard : () => <Redirect to="/" />} />
                        <ProtectedRoute path="/qrcode" user={user} component={(user?.role === 'LAB_INCHARGE' || user?.role === 'ADVISOR') ? QRCodePortal : () => <Redirect to="/admin" />} />

                        <Redirect to={user ? (user.role === 'STUDENT' ? '/' : '/admin') : '/login'} />
                    </Switch>
                </main>
            </div>
            </ErrorBoundary>
        </Router>
    );

}

export default App;
