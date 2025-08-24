const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

// Define health thresholds
const HEALTH_THRESHOLDS = {
    HEART_RATE_DANGER: 160  // BPM
};

/**
 * Check if member's health data violates any thresholds
 * @param {Object} memberData - Member health data object
 * @returns {Object|null} Alert object if threshold violated, null otherwise
 */
function checkHealthThresholds(memberData) {
    if (!memberData || typeof memberData.latestHeartRate !== 'number') {
        return null;
    }
    
    if (memberData.latestHeartRate > HEALTH_THRESHOLDS.HEART_RATE_DANGER) {
        return {
            memberId: memberData.id,
            memberName: memberData.name,
            violationType: 'heart_rate_danger',
            currentValue: memberData.latestHeartRate,
            threshold: HEALTH_THRESHOLDS.HEART_RATE_DANGER,
            timestamp: new Date().toISOString()
        };
    }
    
    return null;
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
        
        profiles.familyMembers.forEach(member => {
            const alert = checkHealthThresholds(member);
            if (alert) {
                alerts.push(alert);
                console.log(`THRESHOLD VIOLATION: ${member.name} - Heart rate ${member.latestHeartRate} BPM exceeds ${HEALTH_THRESHOLDS.HEART_RATE_DANGER} BPM`);
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
 * @param {string} metric - The health metric that exceeded threshold
 * @param {number} value - The actual value that triggered the alert
 */
async function sendEmergencyAlert(member, metric, value) {
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
        
        const emailTemplate = `
EMERGENCY HEALTH ALERT

Family Member: ${member.name}
Critical Metric: ${metric}
Current Value: ${value}
Timestamp: ${new Date().toLocaleString()}

This alert was generated because ${member.name}'s ${metric} has exceeded the safe threshold.
Please check on them immediately.

Family Health Dashboard Alert System
        `;
        
        const mailOptions = {
            from: process.env.ALERT_EMAIL || 'your-email@gmail.com',
            to: 'nezobenardi@gmail.com', // Configure recipient
            subject: `🚨 EMERGENCY: ${member.name} Health Alert - ${metric}`,
            text: emailTemplate
        };
        
        await transporter.sendMail(mailOptions);
        console.log(`Emergency alert sent for ${member.name} - ${metric}: ${value}`);
        
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
                
                const member = profiles.familyMembers.find(m => m.id === alert.memberId);
                if (member) {
                    await sendEmergencyAlert(member, 'heart rate', alert.currentValue);
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