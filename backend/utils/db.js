const fs = require('fs');
const path = require('path');

const DB_DIR = path.join(__dirname, '../db');

// Ensure db directory exists on startup
if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
}

const DEFAULTS = {
    od_requests: [],
    sessions: {},
    presence: {},
    uploads: {},
    violations: [],
    metadata: {},
    working_time: {}
};

const readDB = (name) => {
    const file = path.join(DB_DIR, `${name}.json`);
    if (!fs.existsSync(file)) return JSON.parse(JSON.stringify(DEFAULTS[name] ?? []));
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
        return JSON.parse(JSON.stringify(DEFAULTS[name] ?? []));
    }
};

const writeDB = (name, data) => {
    const file = path.join(DB_DIR, `${name}.json`);
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
};

module.exports = { readDB, writeDB };
