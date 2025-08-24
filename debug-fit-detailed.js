const { google } = require('googleapis');
const fs = require('fs');

async function debugDetailedGoogleFit() {
    try {
        const credentials = JSON.parse(fs.readFileSync('./config/google-oauth2-credentials.json'));
        const oauth2Client = new google.auth.OAuth2(
            credentials.web.client_id,
            credentials.web.client_secret,
            credentials.web.redirect_uris[0]
        );
        
        const profiles = JSON.parse(fs.readFileSync('./data/profiles.json', 'utf8'));
        const member1 = profiles.members.find(m => m.id === 'member1');
        
        oauth2Client.setCredentials({ access_token: member1.googleFitToken });
        const fitness = google.fitness({ version: 'v1', auth: oauth2Client });
        
        const now = Date.now();
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayStartMs = todayStart.getTime();
        
        console.log('=== TIME RANGES ===');
        console.log('Now:', new Date(now).toLocaleString());
        console.log('Today start:', new Date(todayStartMs).toLocaleString());
        
        console.log('\n=== TODAY\'S STEPS DATA ===');
        const todaySteps = await fitness.users.dataset.aggregate({
            userId: 'me',
            requestBody: {
                aggregateBy: [{
                    dataTypeName: 'com.google.step_count.delta'
                }],
                bucketByTime: { durationMillis: 3600000 }, // 1 hour buckets
                startTimeMillis: todayStartMs,
                endTimeMillis: now
            }
        });
        
        let totalTodaySteps = 0;
        todaySteps.data.bucket?.forEach((bucket, i) => {
            const points = bucket.dataset?.[0]?.point || [];
            const hourSteps = points.reduce((sum, point) => sum + (point.value?.[0]?.intVal || 0), 0);
            if (hourSteps > 0) {
                const startTime = new Date(parseInt(bucket.startTimeMillis)).toLocaleTimeString();
                console.log(`Hour ${i} (${startTime}): ${hourSteps} steps`);
                totalTodaySteps += hourSteps;
            }
        });
        console.log(`Total today's steps: ${totalTodaySteps}`);
        
        console.log('\n=== TODAY\'S HEART RATE DATA ===');
        const todayHeartRate = await fitness.users.dataset.aggregate({
            userId: 'me',
            requestBody: {
                aggregateBy: [{
                    dataTypeName: 'com.google.heart_rate.bpm'
                }],
                bucketByTime: { durationMillis: 3600000 }, // 1 hour buckets
                startTimeMillis: todayStartMs,
                endTimeMillis: now
            }
        });
        
        let latestHeartRate = 0;
        todayHeartRate.data.bucket?.forEach((bucket, i) => {
            const points = bucket.dataset?.[0]?.point || [];
            if (points.length > 0) {
                const startTime = new Date(parseInt(bucket.startTimeMillis)).toLocaleTimeString();
                const avgHR = points.reduce((sum, point) => sum + (point.value?.[0]?.fpVal || 0), 0) / points.length;
                console.log(`Hour ${i} (${startTime}): ${points.length} readings, avg ${avgHR.toFixed(1)} BPM`);
                latestHeartRate = avgHR; // Keep updating to get latest
            }
        });
        console.log(`Latest heart rate: ${latestHeartRate.toFixed(1)} BPM`);
        
    } catch (error) {
        console.error('Error:', error.message);
    }
}

debugDetailedGoogleFit();