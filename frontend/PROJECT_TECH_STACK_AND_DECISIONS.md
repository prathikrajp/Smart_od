# SmartOD: Technical Overview & Design Decisions

This document summarizes the core technologies and key architectural decisions behind the SmartOD project, structured for use in a technical presentation (PPT).

## 1. Technology Stack

### Frontend Framework
- **React.js**: Used for building a dynamic, component-based user interface.
- **React Router (v5)**: Handles client-side navigation between Home, Login, Dashboard, and Status pages.
- **Context/State Management**: Utilizes React Hooks (`useState`, `useEffect`) for managing application state locally and across components.

### Styling & UI
- **Tailwind CSS (v2)**: Utility-first CSS framework for rapid UI development and a modern, high-premium aesthetic.
- **Craco**: Used to override Create React App configurations for Tailwind CSS and PostCSS compatibility.
- **React Icons (Feather Icons)**: Provides consistent, scalable iconography throughout the dashboard.

### Data Handling
- **PapaParse**: Client-side CSV parser used to read academic records, faculty lists, and MAC address mappings directly.
- **Local Storage**: Acts as a lightweight "Global Store" for persistence (e.g., OD requests, student metadata, live presence) without a backend server requirement.

### Utilities & Assets
- **QRCode.React**: Generates dynamic location-based QR codes for student check-ins.
- **jsPDF & html2canvas**: Used for generating and downloading official OD letters as PDFs.

### Backend/Processing (Scripts)
- **Python 3**: Used for data synchronization, synthetic data generation, and image processing (OpenCV).
- **OpenCV & NumPy**: Automates asset preparation, such as making logos transparent for a cleaner UI.

---

## 2. Key Design Decisions

### Role-Based Dashboard Architecture
- **Decision**: Implemented a unified `AdminDashboard` with conditional rendering for three primary roles: **Lab Incharge**, **Advisor**, and **HOD**.
- **Rationale**: Simplifies codebase maintenance while ensuring each user sees only relevant student data and approval controls (e.g., Advisors see class students, HODs see departmental students).

### CSV-Driven Data Architecture
- **Decision**: Use CSV files (`students.csv`, `advisors.csv`) as the primary data source.
- **Rationale**: Allows for easy manual updates by faculty without needing database management skills. Python scripts automate the "sync" between these files to maintain data integrity.

### Automated OD Approval Logic (Priority Scoring)
- **Decision**: Developed a "Priority Score" formula: `(CGPA * 6) + (Marks * 0.4)`.
- **Decision**: Students with a score >= 75 are flagged as "High Performers" for prioritized/auto-approval consideration.
- **Rationale**: Provides an objective, data-driven basis for approving OD requests, rewarding academic excellence.

### Location-Based Presence Verification (QR + BSSID)
- **Decision**: Instead of simple GPS (which is unreliable indoors), the system uses QR codes combined with router **BSSIDs**.
- **Rationale**: Ensures students are physically present in the specific lab/classroom where the OD was granted, preventing check-in fraud.

### "Premium" Aesthetic Design System
- **Decision**: Adopted a dark-themed, "Glassmorphism" UI with vibrant blue accents and subtle animations.
- **Rationale**: Moves away from the typical "government/educational portal" look to provide a modern, engaging experience that feels highly professional.
