const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

const apiRequest = async (endpoint, options = {}) => {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };

    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    return response.json();
};

export const authApi = {
    login: (name, id) => apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ name, id })
    })
};

export const dataApi = {
    getLocations: () => apiRequest('/data/locations'),
    getStudents: () => apiRequest('/data/students')
};

export const odApi = {
    getAllRequests: () => apiRequest('/od-requests'),
    createRequest: (data) => apiRequest('/od-requests', {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    updateStatus: (id, updates) => apiRequest(`/od-requests/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates)
    }),
    cancelRequest: (id) => apiRequest(`/od-requests/${id}`, {
        method: 'DELETE'
    })
};

export const sessionApi = {
    getActiveSessions: () => apiRequest('/sessions'),
    startSession: (data) => apiRequest('/sessions', {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    updateSession: (studentId, updates) => apiRequest(`/sessions/${studentId}`, {
        method: 'PATCH',
        body: JSON.stringify(updates)
    }),
    getHistory: (studentId) => apiRequest(`/sessions/history/${studentId}`)
};

export const presenceApi = {
    getPresence: () => apiRequest('/presence'),
    getPresenceLogs: () => apiRequest('/presence/logs'), // For digital sign-in notifications
    reportPresence: (data) => apiRequest('/presence', {
        method: 'POST',
        body: JSON.stringify(data)
    })
};

export const uploadApi = {
    getUploads: (studentId) => apiRequest(`/uploads/${studentId}`),
    uploadWork: (studentId, data) => apiRequest(`/uploads/${studentId}`, {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    deleteWork: (studentId, workId) => apiRequest(`/uploads/${studentId}/${workId}`, {
        method: 'DELETE'
    })
};

export const miscApi = {
    getViolations: () => apiRequest('/violations'),
    reportViolation: (data) => apiRequest('/violations', {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    markViolationRead: (id, userId) => apiRequest(`/violations/read/${id}/${userId}`, {
        method: 'PATCH'
    }),
    getMetadata: () => apiRequest('/metadata'),
    updateMetadata: (studentId, updates) => apiRequest(`/metadata/${studentId}`, {
        method: 'PATCH',
        body: JSON.stringify(updates)
    })
};

export const breakTimerApi = {
    startBreak: (data) => apiRequest('/break-timers', {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    stopBreak: (data) => apiRequest('/break-timers/stop', {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    getActiveBreak: (studentId) => apiRequest(`/break-timers/${studentId}`),
    getLabBreaks: (labName) => apiRequest(`/break-timers/lab/${encodeURIComponent(labName)}`)
};

export const notificationApi = {
    getNotifications: (role, dept) => apiRequest(`/notifications/${role}${dept ? `?dept=${dept}` : ''}`),
    createNotification: (data) => apiRequest('/notifications', {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    markRead: (id, userId) => apiRequest(`/notifications/read/${id}/${userId}`, {
        method: 'PATCH'
    })
};
