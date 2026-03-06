# Setup and Run SmartOD on Ubuntu

This guide provides the exact terminal commands required to set up and run the SmartOD project on an Ubuntu system.

## 1. Prerequisites

First, ensure your system is up to date and install the required language environments.

### Install Node.js and npm
```bash
sudo apt update
sudo apt install -y nodejs npm
```

### Install Python 3 and Pip
```bash
sudo apt install -y python3 python3-pip
```

---

## 2. Project Setup

> [!IMPORTANT]
> You **must** be inside the project folder for these commands to work.

### Navigate to Project Directory
```bash
cd ~/Desktop/smartod
```

### Install Node.js Dependencies
```bash
npm install
```

### Install Python Dependencies
Some scripts (like logo processing) require additional libraries:
```bash
pip3 install opencv-python numpy
```

---

## 3. Running the Application

### Start Development Server
This will start the React application on `http://localhost:3000`.
```bash
npm start
```

### Build for Production
To create an optimized production build in the `build/` folder:
```bash
npm run build
```

---

## 4. Data and Asset Management

The project includes several Python scripts for generating synthetic data or processing assets.

### Generate Student Data
If you need to refresh the `students.csv` file based on `advisors.csv`:
```bash
python3 generate_data.py
```

### Sync Advisor Information
To sync advisor data across files:
```bash
python3 sync_advisors.py
```

### Process Logo (Transparency)
If you update the logo and need to make it transparent:
```bash
python3 process_logo.py
```

---

## Troubleshooting

### "ERRESOLVE overriding peer dependency" Warnings
These warnings are expected because the project uses an older version of Tailwind CSS (v2) tailored for PostCSS 7. They do **not** prevent the app from running.

If `npm install` fails completely, you can bypass the check with:
```bash
npm install --legacy-peer-deps
```

### Port 3000 already in use
If you see an error that port 3000 is occupied, you can find and kill the process:
```bash
sudo lsof -i :3000
# Then kill the PID shown:
# kill -9 <PID>
```

### "Unsupported OpenSSL" Error
If you encounter OpenSSL issues (common on newer Node.js versions), the project is already configured to use the legacy provider. If it still fails, run:
```bash
export NODE_OPTIONS=--openssl-legacy-provider
npm start
```
