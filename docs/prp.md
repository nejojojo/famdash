# Family Health Dashboard - Project Requirements Plan (PRP)

## 1. Core Identity
A web-based family health monitoring dashboard that connects to Google Fit API to display real-time health metrics for 3 family members and sends emergency alerts when dangerous health thresholds are exceeded.

## 2. Single Success Scenario  
- User opens dashboard and sees heart rate data for all 3 family members
- System detects one member's heart rate at 180 BPM (danger zone)
- User receives immediate email notification with member's name and critical metric
- User can identify the emergency and take action by calling the family member

## 3. User Flows
**PRIMARY FLOW:**
1. User opens dashboard → system displays grid of 3 family member health cards
2. Each card shows: name, latest heart rate, steps, sleep hours, last updated timestamp
3. Background process checks thresholds every 5 minutes → updates display with new data
4. If heart rate >160 BPM detected → system sends email alert immediately
5. Result: User has continuous family health visibility with emergency alerting

**ERROR HANDLING:** 
- Google Fit API connection fails → show "Data unavailable" message
- No recent data for family member → show "Last seen: X hours ago"

## 4. Technical Stack & Architecture
**STACK:**
- Frontend: HTML/JavaScript with shadcn/ui components and Tailwind CSS
- Backend: Node.js with Express for Google Fit API handling
- Data Storage: JSON files for user profiles and thresholds  
- Deployment: Local development, expandable to cloud

**FILE STRUCTURE:**
- `index.html` - Main dashboard interface
- `app.js` - Frontend logic and API calls
- `server.js` - Backend API server and Google Fit integration
- `alerts.js` - Threshold monitoring and email notifications
- `data/profiles.json` - Family member configurations

## 5. API Design & Data Models
**DATA MODELS:**
```javascript
FamilyMember: {
  id, name, email, googleFitToken, 
  latestHeartRate, latestSteps, latestSleep, lastUpdated
}

HealthAlert: {
  memberId, metric, value, threshold, timestamp, notificationSent
}
```

**ENDPOINTS:**
- `GET /api/health-data` - Fetch all family members' latest metrics
- `POST /api/connect-google-fit` - Authenticate family member with Google Fit
- `GET /api/alerts` - Check for threshold violations and send notifications

**STORAGE:** JSON files updated every 5 minutes, email alerts via nodemailer

## 6. Core Functions & Data Flow
**FUNCTIONS:**
- `fetchGoogleFitData(memberId)` - Pull metrics from Google Fit API
- `updateDashboard()` - Refresh all member cards with latest data
- `checkHealthThresholds(memberData)` - Compare metrics against danger zones
- `sendEmergencyAlert(member, metric, value)` - Email notification dispatch
- `authenticateGoogleFit(memberId)` - OAuth flow for API access
- `refreshHealthData()` - Scheduled data updates every 5 minutes

**FLOW:** Google Fit API → Server fetches data → JSON storage → Frontend displays → Background threshold checking → Email alerts

**INTEGRATION:** Google Fit OAuth2, REST API endpoints, email service, scheduled tasks

## 7. Dependencies & Constraints
**ALLOWED:**
- `googleapis` for Google Fit API integration
- `nodemailer` for email notifications
- `express` for backend API server
- `tailwindcss` for styling
- `shadcn/ui` for UI components

**FORBIDDEN FOR SKELETON:**
- Real-time WebSockets (use 5-minute polling)
- Complex authentication (OAuth only for Google Fit)
- Database systems (JSON files only)

**LIMITS:** 3 family members maximum, heart rate alerts only, email notifications only

## 8. Code Quality Requirements
- Verbose, readable code over compact solutions
- Maximum 15 lines per function
- Descriptive variable names (no single letters except i, j for loops)
- Comments explaining business logic and WHY
- No nested ternary operators
- No method chaining beyond 2 levels
- Separate files for different concerns
- Explicit error handling where critical
- One responsibility per function

## 9. Definition of Done
**SKELETON COMPLETE WHEN:**
- Dashboard displays health data for 3 hardcoded family members
- Google Fit API successfully pulls heart rate, steps, sleep data
- Heart rate threshold detection works (>160 BPM triggers alert)
- Email notification sends with member name and critical metric
- Manual testing confirms end-to-end success scenario
- Code is verbose, readable, and properly commented
- Foundation ready for adding more family members and alert types