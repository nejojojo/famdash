# Family Health Dashboard - Project Summary

## Project Understanding
**Core Problem:** Family members' health data is scattered across individual devices and apps, making it impossible to monitor potential health emergencies or concerning trends across the family unit.

**Target Users:** Family caregivers who want to monitor their family members' health metrics for safety and emergency response purposes.

**Solution Approach:** A centralized dashboard that pulls health data from Google Fit API and displays real-time metrics with intelligent alerting for dangerous health thresholds.

**Key User Journey:** 
1. Family members sync their health data to Google Fit (steps, heart rate, sleep, blood pressure)
2. Dashboard continuously pulls and displays this data in a unified view
3. System monitors metrics against universal medical danger thresholds
4. When dangerous levels are detected, immediate notifications are sent
5. User can quickly call family member to check on their wellbeing

**Success Looks Like:** 
- Real-time visibility into 3 family members' health metrics
- Reliable alerts when any metric enters medical danger zone
- Quick response capability to potentially life-threatening situations
- Reduced anxiety about family health by having continuous monitoring

**Technical Direction:** 
- Web-based dashboard
- Google Fit API integration for data pulling
- Real-time notification system (email, SMS, or push notifications)
- Universal medical threshold database for alerting logic
- Starting with 3 users, scalable to more family members

**First Version Focus:** 
- Google Fit API connection and authentication
- Basic dashboard showing steps, heart rate, sleep, blood pressure for 3 people
- Simple alert system for heart rate exceeding dangerous levels
- One notification method (email or SMS) for emergency alerts