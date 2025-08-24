const express = require('express');
const path = require('path');
const { google } = require('googleapis');
const fs = require('fs');
const { scheduleThresholdChecking } = require('./alerts');

const app = express();
const PORT = 3000;

// Serve static files from public directory
app.use(express.static('public'));
app.use(express.json());

// OAuth2 authorization endpoint
app.get('/auth/:memberId', (req, res) => {
    const { memberId } = req.params;
    const authUrl = getAuthUrl(memberId);
    if (authUrl) {
        res.redirect(authUrl);
    } else {
        res.status(500).send('Failed to generate authorization URL');
    }
});

// OAuth2 callback endpoint
app.get('/auth/google/callback', async (req, res) => {
    const { code, state: memberId } = req.query;
    
    try {
        const oauth2Client = setupGoogleOAuth2();
        const { tokens } = await oauth2Client.getToken(code);
        
        // Get user info from Google
        oauth2Client.setCredentials(tokens);
        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
        const userInfo = await oauth2.userinfo.get();
        
        // Store tokens and real email for member
        const profilesPath = './data/profiles.json';
        const profiles = JSON.parse(fs.readFileSync(profilesPath, 'utf8'));
        const memberIndex = profiles.members.findIndex(m => m.id === memberId);
        
        if (memberIndex !== -1) {
            profiles.members[memberIndex].googleFitToken = tokens.access_token;
            profiles.members[memberIndex].email = userInfo.data.email;
            profiles.members[memberIndex].name = userInfo.data.name || profiles.members[memberIndex].name;
            fs.writeFileSync(profilesPath, JSON.stringify(profiles, null, 2));
        }
        
        res.send(`Authentication successful for ${memberId}! You can close this window.`);
    } catch (error) {
        console.error('OAuth callback error:', error);
        res.status(500).send('Authentication failed');
    }
});

// API endpoint to get health data
app.get('/api/health-data', (req, res) => {
    try {
        const profilesPath = './data/profiles.json';
        const profiles = JSON.parse(fs.readFileSync(profilesPath, 'utf8'));
        res.json(profiles);
    } catch (error) {
        console.error('Error reading health data:', error);
        res.status(500).json({ error: 'Failed to load health data' });
    }
});

// Basic error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).send('Internal Server Error');
});

// Start server function
function startServer() {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        
        // Start health threshold monitoring
        scheduleThresholdChecking();
    });
}

// Google Fit OAuth2 setup function
function setupGoogleOAuth2() {
    try {
        const credentialsPath = './config/google-oauth2-credentials.json';
        if (!fs.existsSync(credentialsPath)) {
            console.log('Google OAuth2 credentials not found. Please add google-oauth2-credentials.json to config/');
            return null;
        }
        
        const credentials = JSON.parse(fs.readFileSync(credentialsPath));
        const oauth2Client = new google.auth.OAuth2(
            credentials.web.client_id,
            credentials.web.client_secret,
            credentials.web.redirect_uris[0]
        );
        
        console.log('Google Fit OAuth2 setup complete');
        return oauth2Client;
    } catch (error) {
        console.error('Error setting up Google OAuth2:', error.message);
        return null;
    }
}

// Generate OAuth2 authorization URL for family member
function getAuthUrl(memberId) {
    const oauth2Client = setupGoogleOAuth2();
    if (!oauth2Client) {
        return null;
    }
    
    const scopes = [
        'https://www.googleapis.com/auth/fitness.heart_rate.read',
        'https://www.googleapis.com/auth/fitness.activity.read',
        'https://www.googleapis.com/auth/fitness.sleep.read',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile'
    ];
    
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes,
        state: memberId
    });
    
    console.log(`Generated auth URL for member: ${memberId}`);
    return authUrl;
}

// Fetch Google Fit data for authenticated member
async function fetchGoogleFitData(memberId, accessToken = null) {
    try {
        const oauth2Client = setupGoogleOAuth2();
        if (!oauth2Client) {
            console.error('OAuth2 setup failed');
            return null;
        }
        
        // If no access token provided, get it from profiles.json
        if (!accessToken) {
            const profilesPath = './data/profiles.json';
            const profiles = JSON.parse(fs.readFileSync(profilesPath, 'utf8'));
            const member = profiles.members.find(m => m.id === memberId);
            if (!member || !member.googleFitToken) {
                console.error(`No access token found for member: ${memberId}`);
                return null;
            }
            accessToken = member.googleFitToken;
        }
        
        oauth2Client.setCredentials({ access_token: accessToken });
        const fitness = google.fitness({ version: 'v1', auth: oauth2Client });
        
        const now = Date.now();
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0); // Start of today (midnight)
        const todayStartMs = todayStart.getTime();
        
        console.log(`Fetching today's data from ${new Date(todayStartMs).toLocaleString()} to ${new Date(now).toLocaleString()}`);
        
        // Fetch heart rate data - get raw data points, not aggregated
        const heartRateResponse = await fitness.users.dataset.aggregate({
            userId: 'me',
            requestBody: {
                aggregateBy: [{
                    dataTypeName: 'com.google.heart_rate.bpm'
                }],
                bucketByTime: { durationMillis: 900000 }, // 15-minute buckets for more granular data
                startTimeMillis: todayStartMs,
                endTimeMillis: now
            }
        });
        
        // Fetch steps data - get today's total
        const stepsResponse = await fitness.users.dataset.aggregate({
            userId: 'me',
            requestBody: {
                aggregateBy: [{
                    dataTypeName: 'com.google.step_count.delta'
                }],
                bucketByTime: { durationMillis: now - todayStartMs }, // Single bucket for today's total
                startTimeMillis: todayStartMs,
                endTimeMillis: now
            }
        });
        
        // Extract latest heart rate from most recent 15-minute bucket
        let latestHeartRate = 0;
        let latestHeartRateTime = null;
        
        // Look through heart rate buckets from most recent to oldest
        for (let i = heartRateResponse.data.bucket.length - 1; i >= 0; i--) {
            const points = heartRateResponse.data.bucket[i]?.dataset?.[0]?.point || [];
            if (points.length > 0) {
                // Get the most recent heart rate reading from this bucket
                const latestPoint = points[points.length - 1];
                latestHeartRate = latestPoint.value[0].fpVal || 0;
                latestHeartRateTime = new Date(parseInt(latestPoint.endTimeNanos) / 1000000).toISOString();
                console.log(`Latest heart rate: ${latestHeartRate} BPM at ${latestHeartRateTime}`);
                break;
            }
        }
        
        // Get today's total steps
        let latestSteps = 0;
        const stepsBucket = stepsResponse.data.bucket?.[0];
        if (stepsBucket) {
            const points = stepsBucket.dataset?.[0]?.point || [];
            latestSteps = points.reduce((sum, point) => sum + (point.value[0].intVal || 0), 0);
            console.log(`Today's total steps: ${latestSteps}`);
        }
        
        const healthData = {
            latestHeartRate,
            latestSteps,
            latestSleep: 0, // Sleep requires separate implementation
            lastUpdated: new Date().toISOString(),
            heartRateTimestamp: latestHeartRateTime
        };
        
        console.log(`Fetched health data for ${memberId}:`, healthData);
        return healthData;
    } catch (error) {
        console.error(`Error fetching Google Fit data for ${memberId}:`, error.message);
        return null;
    }
}

// Update member health data in profiles.json
function updateMemberHealthData(memberId, healthData) {
    try {
        const profilesPath = './data/profiles.json';
        const profiles = JSON.parse(fs.readFileSync(profilesPath, 'utf8'));
        
        const memberIndex = profiles.members.findIndex(member => member.id === memberId);
        if (memberIndex === -1) {
            console.error(`Member ${memberId} not found in profiles`);
            return false;
        }
        
        profiles.members[memberIndex] = { ...profiles.members[memberIndex], ...healthData };
        fs.writeFileSync(profilesPath, JSON.stringify(profiles, null, 2));
        
        console.log(`Updated health data for member: ${memberId}`);
        return true;
    } catch (error) {
        console.error(`Error updating member health data for ${memberId}:`, error.message);
        return false;
    }
}

// Automatically fetch fresh Google Fit data for all authenticated members
async function refreshAllMembersData() {
    try {
        console.log('=== Starting automatic data refresh ===');
        const profilesPath = './data/profiles.json';
        const profiles = JSON.parse(fs.readFileSync(profilesPath, 'utf8'));
        
        for (const member of profiles.members) {
            if (member.googleFitToken) {
                console.log(`Refreshing data for ${member.name} (${member.id})`);
                const freshData = await fetchGoogleFitData(member.id);
                if (freshData) {
                    updateMemberHealthData(member.id, freshData);
                    console.log(`✅ Updated ${member.name}: ${freshData.latestHeartRate} BPM, ${freshData.latestSteps} steps`);
                } else {
                    console.log(`❌ Failed to fetch data for ${member.name}`);
                }
            }
        }
        console.log('=== Data refresh complete ===');
    } catch (error) {
        console.error('Error during automatic data refresh:', error.message);
    }
}

// Start the server only if this file is run directly
if (require.main === module) {
    startServer();
    
    // Start automatic data fetching every 5 minutes
    console.log('Starting automatic Google Fit data refresh every 5 minutes...');
    setInterval(refreshAllMembersData, 300000); // 5 minutes = 300000ms
    
    // Do an initial data fetch after 10 seconds to allow server to start
    setTimeout(refreshAllMembersData, 10000);
}

module.exports = { 
    app, 
    startServer, 
    setupGoogleOAuth2, 
    getAuthUrl, 
    fetchGoogleFitData, 
    updateMemberHealthData 
};