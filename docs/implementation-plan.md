# Implementation & Testing Plan: Family Health Dashboard

## Quick Reference
**PRP Status:** ✅ Approved  
**Total Tasks:** 10 tasks across 4 conversation batches
**Estimated Timeline:** 4 conversations over 2-3 sessions

## Conversation Batching Strategy
**CRITICAL: Keep batches small to manage context window**
Based on the PRP complexity, create 4 conversation batches:
- **Batch 1:** Foundation (2 micro-tasks: Project setup, basic structure)
- **Batch 2:** Backend Core (3 micro-tasks: Server setup, Google Fit integration, data handling)
- **Batch 3:** Frontend & Integration (3 micro-tasks: Dashboard UI, API connection, real-time updates)
- **Batch 4:** Monitoring & Alerts (2 micro-tasks: Threshold checking, email notifications)

**Each batch = One conversation session**

---

## BATCH 1: Foundation & Setup
**Status:** ✅ Complete  
**Goal:** Create project structure and configuration files
**Context Window Strategy:** Fresh conversation, 2 tasks maximum

### Task 1: Project Structure & Package Setup
**Status:** ✅
**Implementation Checklist:**
- [x] Create file: `package.json` with required dependencies
- [x] Create file: `data/profiles.json` with 3 hardcoded family members
- [x] Create directory structure: `public/`, `data/`, root files
- [x] Add dependencies: express, googleapis, nodemailer

**Manual Test Commands:**
```bash
# Test command 1
npm install
# Expected output: All packages installed without errors, node_modules created

# Test command 2  
ls -la
# Expected output: Should see package.json, data/, public/ directories

# Test command 3
cat data/profiles.json
# Expected output: Valid JSON with 3 family member objects
```

**Visual Verification:**
- [x] Open project directory and verify folder structure exists
- [x] Check `data/profiles.json` contains 3 family members with id, name, email fields
- [x] Confirm `package.json` includes googleapis, nodemailer, express dependencies

**Success Criteria:** Project structure created with all required directories and configuration files in place.

---

### Task 2: shadcn/ui Dashboard Setup  
**Status:** ✅
**Implementation Checklist:**
- [x] Install Tailwind CSS and shadcn/ui dependencies
- [x] Initialize shadcn/ui configuration
- [x] Create `public/index.html` with shadcn/ui card components
- [x] Add 3 family member health cards using shadcn Card component

**Manual Test Commands:**
```bash
# Test command 1
npx tailwindcss -i ./src/input.css -o ./public/output.css --watch
# Expected output: Tailwind CSS builds successfully

# Test command 2
open public/index.html
# Expected output: HTML page opens showing 3 shadcn/ui cards

# Test command 3
ls public/
# Expected output: Should see index.html and output.css
```

**Visual Verification:**
- [x] Open `public/index.html` in browser and verify 3 distinct health cards display
- [x] Each card has placeholders for name, heart rate, steps, sleep, last updated
- [x] shadcn/ui styling makes cards visually distinct and professional
- [x] Page title shows "Family Health Dashboard"
- [x] Responsive grid layout works on mobile/tablet/desktop

**Success Criteria:** Static HTML dashboard displays 3 health cards with shadcn/ui styling and responsive design.

---

**Batch 1 Completion Checklist:**
- [x] All tasks marked as ✅ Complete
- [x] Manual tests passed for each task
- [x] Integration test: Dashboard shows proper shadcn/ui cards with responsive layout
- [x] Ready for Batch 2: Project structure and shadcn/ui frontend skeleton complete

**Batch 1 Completion Summary:**
**Files Created:**
- package.json (express, googleapis, nodemailer, tailwindcss dependencies)
- data/profiles.json (3 family members with sample health data)
- public/index.html (dashboard layout with shadcn/ui cards)
- public/output.css (compiled Tailwind CSS)
- src/input.css (Tailwind base styles)
- tailwind.config.js (Tailwind configuration)
- postcss.config.js (PostCSS configuration)
- Directory structure: public/, data/, src/, node_modules/

**Deviations:** Upgraded from vanilla CSS to shadcn/ui with Tailwind CSS for better UI
**Issues:** None encountered
**Completion Timestamp:** August 24, 2025 - 04:15 UTC

---

## BATCH 2: Backend Core
**Status:** ⬜ Not Started  
**Goal:** Create Node.js server with Google Fit API integration and data handling
**Context Window Strategy:** Fresh start conversation

### Task 3: Express Server Setup
**Status:** ⬜
**Implementation Checklist:**
- [ ] Create file: `server.js` with basic Express server
- [ ] Add function: `startServer()` to initialize on port 3000
- [ ] Serve static files from public directory
- [ ] Add basic error handling and logging

**Manual Test Commands:**
```bash
# Test command 1
node server.js
# Expected output: "Server running on port 3000" message

# Test command 2  
curl http://localhost:3000
# Expected output: HTML content from index.html returned

# Test command 3
open http://localhost:3000
# Expected output: Dashboard opens in browser successfully
```

**Visual Verification:**
- [ ] Start server and confirm no error messages
- [ ] Visit http://localhost:3000 and see dashboard loading
- [ ] Check browser console shows no JavaScript errors
- [ ] Server stays running without crashing

**Success Criteria:** Express server successfully serves static dashboard files on localhost:3000.

---

### Task 4: Google Fit API Configuration
**Status:** ⬜
**Implementation Checklist:**
- [ ] Add function: `setupGoogleAuth()` for OAuth2 configuration
- [ ] Create file: `config/google-credentials.json.example` template
- [ ] Add function: `authenticateGoogleFit(memberId)` for member authentication
- [ ] Include proper scopes for fitness data access

**Manual Test Commands:**
```bash
# Test command 1
node -e "require('./server.js').setupGoogleAuth()"
# Expected output: Google auth configuration loads without errors

# Test command 2
ls config/
# Expected output: Should see google-credentials.json.example file

# Test command 3
grep -r "googleapis" server.js
# Expected output: Google API client initialization code found
```

**Visual Verification:**
- [ ] Check `config/google-credentials.json.example` contains proper OAuth structure
- [ ] Verify `setupGoogleAuth()` function exists in server.js
- [ ] Confirm Google API scopes include fitness read permissions
- [ ] Function handles missing credentials gracefully with clear error messages

**Success Criteria:** Google Fit API authentication setup complete with proper OAuth2 configuration and scope handling.

---

### Task 5: Health Data Fetching Function
**Status:** ⬜
**Implementation Checklist:**
- [ ] Add function: `fetchGoogleFitData(memberId)` in server.js
- [ ] Extract heart rate, steps, sleep data from Google Fit responses
- [ ] Add function: `updateMemberHealthData(memberId, healthData)` to save to profiles.json
- [ ] Include error handling for API failures and missing data

**Manual Test Commands:**
```bash
# Test command 1
node -e "const s = require('./server.js'); s.fetchGoogleFitData('member1')"
# Expected output: Function executes without syntax errors

# Test command 2
cat data/profiles.json
# Expected output: Should show original structure (no changes until real API connection)

# Test command 3
grep -A 10 "fetchGoogleFitData" server.js
# Expected output: Function definition with proper parameters and return handling
```

**Visual Verification:**
- [ ] Check `fetchGoogleFitData()` function handles memberId parameter correctly
- [ ] Verify function structure includes heart rate, steps, sleep data extraction
- [ ] Confirm `updateMemberHealthData()` writes to data/profiles.json correctly
- [ ] Error handling provides meaningful messages for API failures

**Success Criteria:** Google Fit data fetching functions created with proper data extraction and JSON file updating capability.

---

**Batch 2 Completion Checklist:**
- [ ] All tasks marked as ✅ Complete
- [ ] Manual tests passed for each task
- [ ] Integration test: Server runs and can be configured for Google Fit API access
- [ ] Ready for Batch 3: Backend API foundation complete

---

## BATCH 3: Frontend & Integration
**Status:** ⬜ Not Started  
**Goal:** Connect frontend to backend with real-time data updates
**Context Window Strategy:** Fresh start conversation

### Task 6: Frontend JavaScript Setup
**Status:** ⬜
**Implementation Checklist:**
- [ ] Create file: `public/app.js` with main dashboard logic
- [ ] Add function: `loadFamilyMembers()` to populate initial card data
- [ ] Add function: `updateHealthCard(memberId, healthData)` for individual card updates
- [ ] Include DOM manipulation for health metric display

**Manual Test Commands:**
```bash
# Test command 1
open public/index.html
# Expected output: Browser console shows no JavaScript errors

# Test command 2  
ls public/
# Expected output: Should see app.js file alongside index.html and style.css

# Test command 3
grep -n "function.*load" public/app.js
# Expected output: loadFamilyMembers function definition found
```

**Visual Verification:**
- [ ] Open browser developer tools and confirm app.js loads without errors
- [ ] Check `loadFamilyMembers()` function exists and can be called manually in console
- [ ] Verify `updateHealthCard()` function accepts memberId and healthData parameters
- [ ] Confirm functions are properly structured with descriptive variable names

**Success Criteria:** Frontend JavaScript foundation created with functions to load and update family member health cards.

---

### Task 7: API Endpoint Creation
**Status:** ⬜
**Implementation Checklist:**
- [ ] Add endpoint: `GET /api/health-data` to server.js
- [ ] Return JSON with all family members' health data from profiles.json
- [ ] Add endpoint: `POST /api/refresh-data` to trigger Google Fit data updates
- [ ] Include proper JSON response formatting and error handling

**Manual Test Commands:**
```bash
# Test command 1
curl http://localhost:3000/api/health-data
# Expected output: JSON response with 3 family members and their health data

# Test command 2
curl -X POST http://localhost:3000/api/refresh-data
# Expected output: Success response indicating refresh initiated

# Test command 3
grep -A 5 "/api/health-data" server.js
# Expected output: GET endpoint definition with JSON response
```

**Visual Verification:**
- [ ] Visit http://localhost:3000/api/health-data in browser shows valid JSON
- [ ] JSON response includes id, name, latestHeartRate, latestSteps, latestSleep for each member
- [ ] POST to refresh endpoint returns proper success/error responses
- [ ] Error handling provides meaningful HTTP status codes

**Success Criteria:** REST API endpoints created for health data retrieval and refresh functionality with proper JSON responses.

---

### Task 8: Dashboard Real-Time Updates
**Status:** ⬜
**Implementation Checklist:**
- [ ] Add function: `fetchHealthData()` in app.js to call /api/health-data
- [ ] Add function: `refreshDashboard()` to update all cards with latest data
- [ ] Implement 5-minute polling with `setInterval(refreshDashboard, 300000)`
- [ ] Include loading states and error messaging for failed updates

**Manual Test Commands:**
```bash
# Test command 1
open http://localhost:3000
# Expected output: Dashboard loads and shows family member data automatically

# Test command 2
# In browser console: refreshDashboard()
# Expected output: Health cards update with current data from API

# Test command 3
# Wait 5+ minutes and observe dashboard
# Expected output: Cards refresh automatically every 5 minutes
```

**Visual Verification:**
- [ ] Open dashboard and verify health cards populate with data from profiles.json
- [ ] Check browser network tab shows /api/health-data requests every 5 minutes
- [ ] Manually trigger `refreshDashboard()` in console and see cards update
- [ ] Confirm loading states display during API calls

**Success Criteria:** Dashboard automatically loads and refreshes family health data every 5 minutes with proper error handling.

---

**Batch 3 Completion Checklist:**
- [ ] All tasks marked as ✅ Complete
- [ ] Manual tests passed for each task
- [ ] Integration test: Dashboard displays real family data with automatic updates
- [ ] Ready for Batch 4: Frontend-backend integration complete

---

## BATCH 4: Monitoring & Alerts
**Status:** ⬜ Not Started  
**Goal:** Implement threshold monitoring and email notification system
**Context Window Strategy:** Fresh start conversation

### Task 9: Health Threshold Monitoring
**Status:** ⬜
**Implementation Checklist:**
- [ ] Add function: `checkHealthThresholds(memberData)` in new file alerts.js
- [ ] Define heart rate danger threshold: >160 BPM
- [ ] Add function: `scanAllMembers()` to check all family members
- [ ] Include threshold violation detection and logging

**Manual Test Commands:**
```bash
# Test command 1
node -e "const a = require('./alerts.js'); console.log(a.checkHealthThresholds({latestHeartRate: 180}))"
# Expected output: Threshold violation detected with alert details

# Test command 2
node -e "const a = require('./alerts.js'); console.log(a.checkHealthThresholds({latestHeartRate: 120}))"
# Expected output: No threshold violations detected

# Test command 3
ls alerts.js
# Expected output: alerts.js file exists
```

**Visual Verification:**
- [ ] Check `checkHealthThresholds()` function correctly identifies heart rate >160 BPM
- [ ] Verify function returns proper alert object with member details and violation type
- [ ] Confirm `scanAllMembers()` processes all family members from profiles.json
- [ ] Function logging provides clear threshold violation messages

**Success Criteria:** Health threshold monitoring system detects dangerous heart rate levels and generates alert data.

---

### Task 10: Email Alert System
**Status:** ⬜
**Implementation Checklist:**
- [ ] Add function: `sendEmergencyAlert(member, metric, value)` to alerts.js
- [ ] Configure nodemailer with email service settings
- [ ] Create email template with member name, metric, and timestamp
- [ ] Add function: `scheduleThresholdChecking()` to run every 5 minutes

**Manual Test Commands:**
```bash
# Test command 1
node -e "const a = require('./alerts.js'); a.sendEmergencyAlert({name: 'Test', email: 'test@email.com'}, 'heart rate', 180)"
# Expected output: Email sending process initiated (may show config needed)

# Test command 2
grep -n "nodemailer" alerts.js
# Expected output: Nodemailer import and configuration found

# Test command 3
node server.js
# Expected output: Server starts with threshold checking scheduled every 5 minutes
```

**Visual Verification:**
- [ ] Check `sendEmergencyAlert()` function accepts member, metric, and value parameters
- [ ] Verify email template includes member name, critical metric, and timestamp
- [ ] Confirm `scheduleThresholdChecking()` sets up 5-minute interval checking
- [ ] Email configuration provides clear setup instructions for SMTP settings

**Success Criteria:** Email alert system sends emergency notifications when heart rate thresholds are exceeded with proper scheduling.

---

**Batch 4 Completion Checklist:**
- [ ] All tasks marked as ✅ Complete
- [ ] Manual tests passed for each task
- [ ] Integration test: Complete end-to-end flow from data fetch to email alert
- [ ] Ready for Production: All PRP requirements implemented and tested

---

## Conversation Briefing Templates

### Starting Fresh Conversation:
```
I'm implementing Family Health Dashboard from the PRP document. 

**Completed So Far:**
- [List completed batches/tasks]

**Current Focus - Batch [X]: [Batch Name]**
Tasks for this conversation:
1. [Task name and brief description]
2. [Task name and brief description]

**Key PRP Requirements:**
- Web dashboard displaying health data for 3 family members
- Google Fit API integration for heart rate, steps, sleep data
- Email alerts when heart rate exceeds 160 BPM
- 5-minute polling for real-time updates
- JSON file storage for member profiles

Please help me implement these tasks following the PRP specifications.
```

### Debugging/Reset Template:
```
I need to debug/fix Family Health Dashboard implementation.

**Issue:**
[Describe what's broken]

**Current State:**
- [What's been built]
- [What's working]
- [What's failing]

**PRP Reference:**
Core function: Dashboard displays heart rate, steps, sleep for 3 family members
Technical stack: Node.js/Express backend, vanilla HTML/CSS/JS frontend
Alert system: Email notifications when heart rate >160 BPM

Please help me fix this issue and get back on track.
```

### Continue Conversation Template:
```
Continuing implementation of Family Health Dashboard.

**Just Completed:**
- [Task(s) just finished]

**Next Tasks in Batch [X]:**
- [Next task name]
- [Following task]

Let's proceed with [specific next task].
```

## Progress Tracking System

### Status Indicators:
- ⬜ Not Started
- 🟦 In Progress  
- ✅ Complete
- ❌ Blocked
- 🔄 Needs Revision

### Example Usage:
```
## Batch 1 Status:
- ✅ Task 1: Project setup
- ✅ Task 2: HTML dashboard structure
- 🟦 Task 3: Express server setup
- ⬜ Task 4: Google Fit API config
```

### Regression Testing Checklist:
After each batch, verify:
- [ ] Previous batch functionality still works
- [ ] No breaking changes introduced
- [ ] Integration points are stable
- [ ] Manual tests from previous batches pass

---

## Implementation Guidelines

### Task Breakdown Rules:
- **Maximum 10-15 lines of code per task** (smaller is better for context)
- **2-3 tasks per batch maximum** (keeps conversation focused)
- Each task independently testable
- Clear file/function targets
- No task dependencies within same batch
- Every task must have specific manual test steps

### Testing Philosophy:
- **Test after EVERY task, not just at batch end**
- Manual verification with specific commands/actions
- No automated testing in skeleton phase
- Focus on observable behavior
- User-facing functionality over internals
- If a test fails, STOP and fix before proceeding

### Conversation Management:
- Start fresh after 3-4 tasks
- Always provide PRP context
- Reference completed work
- Clear next steps

## Critical Reminders:
- Follow PRP specifications exactly
- Verbose, readable code (no clever shortcuts)
- Test after EVERY task
- Document any deviations from plan

---

**Generated from:** `docs/prp.md`  
**Date:** August 23, 2025  
**Ready to implement:** Start with Batch 1, Task 1