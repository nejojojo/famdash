# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Family Health Dashboard** - A web-based family health monitoring system that connects to Google Fit API to display real-time health metrics for 3 family members and sends emergency email alerts when dangerous health thresholds (>160 BPM heart rate) are exceeded.

## Architecture & Tech Stack

**Frontend**: HTML/JavaScript with shadcn/ui components and Tailwind CSS
**Backend**: Node.js with Express for Google Fit API integration
**Data Storage**: JSON files for family member profiles and health data
**UI Framework**: Tailwind CSS with shadcn/ui design patterns
**Alert System**: nodemailer for email notifications

## Key Commands

```bash
# Development
npm install                    # Install dependencies
npm run start                  # Start Express server on port 3000
npm run dev                    # Development mode (same as start)

# Frontend Build
npx tailwindcss -i ./src/input.css -o ./public/output.css    # Build CSS
npx tailwindcss -i ./src/input.css -o ./public/output.css --watch    # Watch mode

# Testing
open http://localhost:3000     # View dashboard in browser
curl http://localhost:3000/api/health-data    # Test API endpoint
```

## Project Structure

```
famdash/
├── server.js                  # Express server & Google Fit API integration
├── alerts.js                  # Health threshold monitoring & email alerts
├── public/
│   ├── index.html            # Main dashboard with shadcn/ui cards
│   ├── output.css            # Compiled Tailwind CSS
│   └── app.js                # Frontend JavaScript (dashboard logic)
├── data/
│   └── profiles.json         # Family member health data & configurations
├── src/
│   └── input.css             # Tailwind base styles
├── docs/                     # Implementation documentation
│   ├── prp.md               # Project Requirements Plan
│   └── implementation-plan.md # Micro-task breakdown & progress
└── tailwind.config.js        # Tailwind configuration
```

## Core Data Flow

1. **Google Fit API** → `fetchGoogleFitData()` pulls heart rate, steps, sleep data
2. **JSON Storage** → Data saved to `data/profiles.json` via `updateMemberHealthData()`
3. **Dashboard Display** → Frontend calls `/api/health-data` every 5 minutes
4. **Threshold Monitoring** → `checkHealthThresholds()` detects >160 BPM heart rate
5. **Alert System** → `sendEmergencyAlert()` sends email notifications via nodemailer

## Implementation Approach

This project follows a **micro-task skeleton-first approach**:
- Tasks limited to 10-15 lines of code maximum
- 4 conversation batches: Foundation, Backend Core, Frontend Integration, Monitoring & Alerts
- Manual testing after EVERY task completion
- JSON file storage for MVP (expandable to database later)
- Focus on 3 family members maximum for initial implementation

## Key Implementation Guidelines

### Code Quality
- Verbose, readable code over compact solutions (max 15 lines per function)
- Descriptive variable names and business logic comments
- One responsibility per function, separate files for different concerns
- No nested ternary operators or excessive method chaining

### Development Workflow
- Always read `docs/implementation-plan.md` first to check task status
- Update implementation plan with completion timestamps and file details
- Test after each task before proceeding to next
- Use conversation templates for fresh sessions if context window becomes issue

### Current Status
- **Batch 1**: ✅ Complete (Project setup + shadcn/ui dashboard)
- **Batch 2**: Pending (Express server + Google Fit API + health data fetching)
- **Batch 3**: Pending (Frontend JavaScript + API endpoints + real-time updates)
- **Batch 4**: Pending (Health threshold monitoring + email alert system)

## Google Fit Integration

The system requires OAuth2 setup for Google Fit API access:
- Scopes needed: fitness data read permissions
- Family members authenticate individually via `authenticateGoogleFit()`
- Data pulled every 5 minutes: heart rate, steps, sleep metrics
- API failures handled gracefully with "Data unavailable" messages

## Alert System Configuration

- **Critical Threshold**: Heart rate >160 BPM triggers immediate email alert
- **Email Template**: Includes member name, metric value, and timestamp
- **Notification Target**: Primary caregiver receives all alerts
- **Frequency**: Real-time alerts (not batched) for emergency response