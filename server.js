const express = require('express');
const path = require('path');
const { google } = require('googleapis');
const fs = require('fs');
const { scheduleThresholdChecking } = require('./alerts');
const tokenManager = require('./tokenManager');

const app = express();
const PORT = process.env.PORT || 3000;

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
        
        // Store tokens securely using token manager
        tokenManager.storeTokens(memberId, tokens);
        
        // Update profile with user info and token status
        const profilesPath = './data/profiles.json';
        const profiles = JSON.parse(fs.readFileSync(profilesPath, 'utf8'));
        const memberIndex = profiles.members.findIndex(m => m.id === memberId);
        
        if (memberIndex !== -1) {
            profiles.members[memberIndex].email = userInfo.data.email;
            profiles.members[memberIndex].name = userInfo.data.name || profiles.members[memberIndex].name;
            // Update token status using token manager
            tokenManager.updateProfileTokenStatus(memberId, true);
        }
        
        // Trigger immediate data refresh with new token
        const freshData = await fetchGoogleFitData(memberId);
        if (freshData) {
            updateMemberHealthData(memberId, freshData);
        }
        
        res.send(`Authentication successful for ${memberId}! Data refresh started. You can close this window.`);
    } catch (error) {
        console.error('OAuth callback error:', error);
        res.status(500).send('Authentication failed');
    }
});

// API endpoint to get member historical data
app.get('/api/member/:memberId/history', async (req, res) => {
    const { memberId } = req.params;
    const { period = 'month' } = req.query;
    
    try {
        // Get historical data from Google Fit
        const historicalData = await fetchHistoricalGoogleFitData(memberId, period);
        
        if (historicalData) {
            res.json(historicalData);
        } else {
            // Return sample data if no historical data available
            res.json(generateSampleHistoricalData(period));
        }
    } catch (error) {
        console.error('Error fetching historical data:', error);
        res.status(500).json({ error: 'Failed to fetch historical data' });
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
        'https://www.googleapis.com/auth/fitness.blood_pressure.read',
        'https://www.googleapis.com/auth/fitness.oxygen_saturation.read',
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
        
        // Get valid access token using token manager
        if (!accessToken) {
            accessToken = await tokenManager.getValidToken(memberId);
            if (!accessToken) {
                console.error(`No valid access token available for member: ${memberId}. Re-authentication needed.`);
                // Update profile to show token is expired
                tokenManager.updateProfileTokenStatus(memberId, false);
                return null;
            }
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
        
        // Fetch blood pressure data - get most recent reading
        let latestBloodPressureSystolic = 0;
        let latestBloodPressureDiastolic = 0;
        let bloodPressureTimestamp = null;
        
        try {
            const bloodPressureResponse = await fitness.users.dataset.aggregate({
                userId: 'me',
                requestBody: {
                    aggregateBy: [{
                        dataTypeName: 'com.google.blood_pressure'
                    }],
                    bucketByTime: { durationMillis: now - todayStartMs }, // Today's readings
                    startTimeMillis: todayStartMs,
                    endTimeMillis: now
                }
            });
            
            // Get the most recent blood pressure reading
            const bpBuckets = bloodPressureResponse.data.bucket || [];
            for (let i = bpBuckets.length - 1; i >= 0; i--) {
                const points = bpBuckets[i]?.dataset?.[0]?.point || [];
                if (points.length > 0) {
                    const latestPoint = points[points.length - 1];
                    latestBloodPressureSystolic = latestPoint.value[0]?.fpVal || 0; // Systolic
                    latestBloodPressureDiastolic = latestPoint.value[1]?.fpVal || 0; // Diastolic
                    bloodPressureTimestamp = new Date(parseInt(latestPoint.endTimeNanos) / 1000000).toISOString();
                    console.log(`Latest blood pressure: ${latestBloodPressureSystolic}/${latestBloodPressureDiastolic} mmHg at ${bloodPressureTimestamp}`);
                    break;
                }
            }
        } catch (error) {
            console.log(`Blood pressure data not available: ${error.message}`);
        }
        
        // Fetch oxygen saturation data - get most recent reading
        let latestOxygenSaturation = 0;
        let oxygenSaturationTimestamp = null;
        
        try {
            const oxygenSaturationResponse = await fitness.users.dataset.aggregate({
                userId: 'me',
                requestBody: {
                    aggregateBy: [{
                        dataTypeName: 'com.google.oxygen_saturation'
                    }],
                    bucketByTime: { durationMillis: now - todayStartMs }, // Today's readings
                    startTimeMillis: todayStartMs,
                    endTimeMillis: now
                }
            });
            
            // Get the most recent oxygen saturation reading
            const o2Buckets = oxygenSaturationResponse.data.bucket || [];
            for (let i = o2Buckets.length - 1; i >= 0; i--) {
                const points = o2Buckets[i]?.dataset?.[0]?.point || [];
                if (points.length > 0) {
                    const latestPoint = points[points.length - 1];
                    latestOxygenSaturation = latestPoint.value[0]?.fpVal || 0;
                    oxygenSaturationTimestamp = new Date(parseInt(latestPoint.endTimeNanos) / 1000000).toISOString();
                    console.log(`Latest oxygen saturation: ${latestOxygenSaturation}% at ${oxygenSaturationTimestamp}`);
                    break;
                }
            }
        } catch (error) {
            console.log(`Oxygen saturation data not available: ${error.message}`);
        }
        
        const healthData = {
            latestHeartRate,
            latestSteps,
            latestSleep: 0, // Sleep requires separate implementation
            latestBloodPressureSystolic,
            latestBloodPressureDiastolic,
            latestOxygenSaturation,
            lastUpdated: new Date().toISOString(),
            heartRateTimestamp: latestHeartRateTime,
            bloodPressureTimestamp,
            oxygenSaturationTimestamp
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
            // Check if member has a valid token using token manager
            const hasValidToken = !(await tokenManager.needsReAuthentication(member.id));
            
            if (hasValidToken) {
                console.log(`Refreshing data for ${member.name} (${member.id})`);
                const freshData = await fetchGoogleFitData(member.id);
                if (freshData) {
                    updateMemberHealthData(member.id, freshData);
                    console.log(`✅ Updated ${member.name}: ${freshData.latestHeartRate} BPM, ${freshData.latestSteps} steps`);
                    tokenManager.updateProfileTokenStatus(member.id, true);
                } else {
                    console.log(`❌ Failed to fetch data for ${member.name} - token may be expired`);
                    tokenManager.updateProfileTokenStatus(member.id, false);
                }
            } else {
                console.log(`⚠️  ${member.name} needs re-authentication - visit http://localhost:${PORT}/auth/${member.id}`);
                tokenManager.updateProfileTokenStatus(member.id, false);
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

// Fetch historical Google Fit data for charts
async function fetchHistoricalGoogleFitData(memberId, period = 'month') {
    try {
        const accessToken = await tokenManager.getValidToken(memberId);
        if (!accessToken) {
            console.error(`No valid token for historical data: ${memberId}`);
            return null;
        }
        
        const oauth2Client = setupGoogleOAuth2();
        oauth2Client.setCredentials({ access_token: accessToken });
        const fitness = google.fitness({ version: 'v1', auth: oauth2Client });
        
        // Calculate date range based on period
        const endTime = Date.now();
        let startTime;
        
        switch (period) {
            case 'week':
                startTime = endTime - (7 * 24 * 60 * 60 * 1000);
                break;
            case 'year':
                startTime = endTime - (365 * 24 * 60 * 60 * 1000);
                break;
            case 'month':
            default:
                startTime = endTime - (30 * 24 * 60 * 60 * 1000);
                break;
        }
        
        console.log(`Fetching ${period} historical data from ${new Date(startTime).toDateString()} to ${new Date(endTime).toDateString()}`);
        
        // Fetch aggregated daily data
        const aggregatedData = await fitness.users.dataset.aggregate({
            userId: 'me',
            requestBody: {
                aggregateBy: [
                    { dataTypeName: 'com.google.step_count.delta' },
                    { dataTypeName: 'com.google.heart_rate.bpm' },
                    { dataTypeName: 'com.google.sleep.segment' },
                    { dataTypeName: 'com.google.blood_pressure' },
                    { dataTypeName: 'com.google.oxygen_saturation' }
                ],
                bucketByTime: { durationMillis: 86400000 }, // 1 day buckets
                startTimeMillis: startTime.toString(),
                endTimeMillis: endTime.toString()
            }
        });
        
        // Process the aggregated data
        const processedData = processHistoricalData(aggregatedData.data, period);
        return processedData;
        
    } catch (error) {
        console.error(`Error fetching historical data for ${memberId}:`, error.message);
        return null;
    }
}

// Process historical data from Google Fit response
function processHistoricalData(googleFitData, period) {
    const dates = [];
    const heartRates = [];
    const steps = [];
    const sleepHours = [];
    const bloodPressureSystolic = [];
    const bloodPressureDiastolic = [];
    const oxygenSaturation = [];
    
    if (googleFitData && googleFitData.bucket) {
        googleFitData.bucket.forEach(bucket => {
            const date = new Date(parseInt(bucket.startTimeMillis));
            dates.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
            
            let daySteps = 0;
            let dayHeartRate = 0;
            let daySleep = 0;
            let dayBloodPressureSystolic = 0;
            let dayBloodPressureDiastolic = 0;
            let dayOxygenSaturation = 0;
            
            bucket.dataset.forEach(dataset => {
                if (dataset.dataSourceId.includes('step_count')) {
                    dataset.point.forEach(point => {
                        daySteps += point.value[0]?.intVal || 0;
                    });
                } else if (dataset.dataSourceId.includes('heart_rate')) {
                    let hrSum = 0;
                    let hrCount = 0;
                    dataset.point.forEach(point => {
                        hrSum += point.value[0]?.fpVal || 0;
                        hrCount++;
                    });
                    dayHeartRate = hrCount > 0 ? hrSum / hrCount : 0;
                } else if (dataset.dataSourceId.includes('sleep')) {
                    dataset.point.forEach(point => {
                        daySleep += (point.value[0]?.intVal || 0) / 3600000; // Convert ms to hours
                    });
                } else if (dataset.dataSourceId.includes('blood_pressure')) {
                    // Get the most recent blood pressure reading for the day
                    if (dataset.point.length > 0) {
                        const latestPoint = dataset.point[dataset.point.length - 1];
                        dayBloodPressureSystolic = latestPoint.value[0]?.fpVal || 0;
                        dayBloodPressureDiastolic = latestPoint.value[1]?.fpVal || 0;
                    }
                } else if (dataset.dataSourceId.includes('oxygen_saturation')) {
                    // Get the most recent oxygen saturation reading for the day
                    if (dataset.point.length > 0) {
                        const latestPoint = dataset.point[dataset.point.length - 1];
                        dayOxygenSaturation = latestPoint.value[0]?.fpVal || 0;
                    }
                }
            });
            
            heartRates.push(Math.round(dayHeartRate));
            steps.push(daySteps);
            sleepHours.push(Math.round(daySleep * 10) / 10); // Round to 1 decimal
            bloodPressureSystolic.push(Math.round(dayBloodPressureSystolic));
            bloodPressureDiastolic.push(Math.round(dayBloodPressureDiastolic));
            oxygenSaturation.push(Math.round(dayOxygenSaturation));
        });
    }
    
    return {
        period,
        dates,
        heartRate: heartRates,
        steps,
        sleep: sleepHours,
        bloodPressureSystolic,
        bloodPressureDiastolic,
        oxygenSaturation
    };
}

// Generate sample historical data for testing/fallback
function generateSampleHistoricalData(period = 'month') {
    let days;
    switch (period) {
        case 'week': days = 7; break;
        case 'year': days = 365; break;
        case 'month':
        default: days = 30; break;
    }
    
    const dates = [];
    const heartRates = [];
    const steps = [];
    const sleepHours = [];
    const bloodPressureSystolic = [];
    const bloodPressureDiastolic = [];
    const oxygenSaturation = [];
    
    for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        
        dates.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        heartRates.push(Math.floor(Math.random() * 40) + 60); // 60-100 BPM
        steps.push(Math.floor(Math.random() * 8000) + 2000); // 2000-10000 steps
        sleepHours.push(Math.floor(Math.random() * 4) + 6); // 6-10 hours
        bloodPressureSystolic.push(Math.floor(Math.random() * 40) + 100); // 100-140 mmHg
        bloodPressureDiastolic.push(Math.floor(Math.random() * 30) + 60); // 60-90 mmHg
        oxygenSaturation.push(Math.floor(Math.random() * 5) + 95); // 95-100%
    }
    
    return {
        period,
        dates,
        heartRate: heartRates,
        steps,
        sleep: sleepHours,
        bloodPressureSystolic,
        bloodPressureDiastolic,
        oxygenSaturation
    };
}

module.exports = { 
    app, 
    startServer, 
    setupGoogleOAuth2, 
    getAuthUrl, 
    fetchGoogleFitData, 
    updateMemberHealthData,
    fetchHistoricalGoogleFitData,
    generateSampleHistoricalData
};