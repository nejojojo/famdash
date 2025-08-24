const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

// Define health thresholds
const HEALTH_THRESHOLDS = {
    HEART_RATE_DANGER: 160,        // BPM
    BLOOD_PRESSURE_SYSTOLIC: 140,  // mmHg
    BLOOD_PRESSURE_DIASTOLIC: 90,  // mmHg
    OXYGEN_SATURATION_LOW: 95      // %
};

/**
 * Check if member's health data violates any thresholds
 * @param {Object} memberData - Member health data object
 * @returns {Array} Array of alert objects for any violations found
 */
function checkHealthThresholds(memberData) {
    if (!memberData) {
        return [];
    }
    
    const alerts = [];
    const timestamp = new Date().toISOString();
    
    // Check heart rate threshold
    if (typeof memberData.latestHeartRate === 'number' && memberData.latestHeartRate > HEALTH_THRESHOLDS.HEART_RATE_DANGER) {
        alerts.push({
            memberId: memberData.id,
            memberName: memberData.name,
            violationType: 'heart_rate_danger',
            metricName: 'Heart Rate',
            currentValue: memberData.latestHeartRate,
            threshold: HEALTH_THRESHOLDS.HEART_RATE_DANGER,
            unit: 'BPM',
            timestamp: timestamp
        });
    }
    
    // Check blood pressure thresholds
    if (typeof memberData.latestBloodPressureSystolic === 'number' && memberData.latestBloodPressureSystolic > HEALTH_THRESHOLDS.BLOOD_PRESSURE_SYSTOLIC) {
        alerts.push({
            memberId: memberData.id,
            memberName: memberData.name,
            violationType: 'blood_pressure_systolic_high',
            metricName: 'Systolic Blood Pressure',
            currentValue: memberData.latestBloodPressureSystolic,
            threshold: HEALTH_THRESHOLDS.BLOOD_PRESSURE_SYSTOLIC,
            unit: 'mmHg',
            timestamp: timestamp
        });
    }
    
    if (typeof memberData.latestBloodPressureDiastolic === 'number' && memberData.latestBloodPressureDiastolic > HEALTH_THRESHOLDS.BLOOD_PRESSURE_DIASTOLIC) {
        alerts.push({
            memberId: memberData.id,
            memberName: memberData.name,
            violationType: 'blood_pressure_diastolic_high',
            metricName: 'Diastolic Blood Pressure',
            currentValue: memberData.latestBloodPressureDiastolic,
            threshold: HEALTH_THRESHOLDS.BLOOD_PRESSURE_DIASTOLIC,
            unit: 'mmHg',
            timestamp: timestamp
        });
    }
    
    // Check oxygen saturation threshold (low is dangerous)
    if (typeof memberData.latestOxygenSaturation === 'number' && memberData.latestOxygenSaturation < HEALTH_THRESHOLDS.OXYGEN_SATURATION_LOW) {
        alerts.push({
            memberId: memberData.id,
            memberName: memberData.name,
            violationType: 'oxygen_saturation_low',
            metricName: 'Oxygen Saturation',
            currentValue: memberData.latestOxygenSaturation,
            threshold: HEALTH_THRESHOLDS.OXYGEN_SATURATION_LOW,
            unit: '%',
            timestamp: timestamp
        });
    }
    
    return alerts;
}

/**
 * Scan all family members for health threshold violations
 * @returns {Array} Array of alert objects for any violations found
 */
function scanAllMembers() {
    try {
        const profilesPath = path.join(__dirname, 'data', 'profiles.json');
        const profilesData = fs.readFileSync(profilesPath, 'utf8');
        const profiles = JSON.parse(profilesData);
        
        const alerts = [];
        
        profiles.members.forEach(member => {
            const memberAlerts = checkHealthThresholds(member);
            if (memberAlerts.length > 0) {
                alerts.push(...memberAlerts);
                memberAlerts.forEach(alert => {
                    console.log(`THRESHOLD VIOLATION: ${member.name} - ${alert.metricName} ${alert.currentValue} ${alert.unit} violates threshold ${alert.threshold} ${alert.unit}`);
                });
            }
        });
        
        return alerts;
    } catch (error) {
        console.error('Error scanning members for threshold violations:', error);
        return [];
    }
}

/**
 * Send emergency alert email for critical health threshold violation
 * @param {Object} member - Family member object with name and email
 * @param {Object} alert - Alert object with metric details
 */
async function sendEmergencyAlert(member, alert) {
    try {
        // Configure email transporter
        // Note: In production, use environment variables for email credentials
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.ALERT_EMAIL || 'your-email@gmail.com',
                pass: process.env.ALERT_EMAIL_PASSWORD || 'your-app-password'
            }
        });
        
        const thresholdText = alert.violationType.includes('low') ? 
            `fallen below ${alert.threshold} ${alert.unit}` : 
            `exceeded ${alert.threshold} ${alert.unit}`;
            
        const emailTemplate = `
EMERGENCY HEALTH ALERT

Family Member: ${member.name}
Critical Metric: ${alert.metricName}
Current Value: ${alert.currentValue} ${alert.unit}
Threshold: ${alert.threshold} ${alert.unit}
Alert Type: ${alert.violationType.replace(/_/g, ' ').toUpperCase()}
Timestamp: ${new Date(alert.timestamp).toLocaleString()}

This alert was generated because ${member.name}'s ${alert.metricName} has ${thresholdText}.
Please check on them immediately.

Family Health Dashboard Alert System
        `;
        
        const mailOptions = {
            from: process.env.ALERT_EMAIL || 'your-email@gmail.com',
            to: 'nezobenardi@gmail.com', // Configure recipient
            subject: `🚨 EMERGENCY: ${member.name} Health Alert - ${alert.metricName}`,
            text: emailTemplate
        };
        
        await transporter.sendMail(mailOptions);
        console.log(`Emergency alert sent for ${member.name} - ${alert.metricName}: ${alert.currentValue} ${alert.unit}`);
        
    } catch (error) {
        console.error('Failed to send emergency alert:', error.message);
        console.log('Email configuration needed: Set ALERT_EMAIL and ALERT_EMAIL_PASSWORD environment variables');
    }
}

/**
 * Schedule threshold checking to run every 5 minutes
 * Automatically checks all members and sends alerts for violations
 */
function scheduleThresholdChecking() {
    console.log('Starting health threshold monitoring - checking every 5 minutes');
    
    // Check immediately on startup
    performThresholdCheck();
    
    // Schedule checks every 5 minutes (300,000 milliseconds)
    setInterval(() => {
        performThresholdCheck();
    }, 300000);
}

/**
 * Perform a complete threshold check on all family members
 * Send alerts for any violations found
 */
async function performThresholdCheck() {
    const alerts = scanAllMembers();
    
    if (alerts.length > 0) {
        console.log(`Found ${alerts.length} health threshold violation(s)`);
        
        // Send email alert for each violation
        for (const alert of alerts) {
            try {
                const profilesPath = path.join(__dirname, 'data', 'profiles.json');
                const profilesData = fs.readFileSync(profilesPath, 'utf8');
                const profiles = JSON.parse(profilesData);
                
                const member = profiles.members.find(m => m.id === alert.memberId);
                if (member) {
                    await sendEmergencyAlert(member, alert);
                }
            } catch (error) {
                console.error('Error processing alert:', error);
            }
        }
    } else {
        console.log('Threshold check complete - all family members within safe ranges');
    }
}

module.exports = {
    checkHealthThresholds,
    scanAllMembers,
    sendEmergencyAlert,
    scheduleThresholdChecking,
    HEALTH_THRESHOLDS
};