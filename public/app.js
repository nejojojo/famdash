// Family Health Dashboard JavaScript

// Load family members data from API
async function loadFamilyMembers() {
    try {
        const response = await fetch('/api/health-data');
        const data = await response.json();
        
        if (data.members) {
            data.members.forEach(member => {
                updateHealthCard(member.id, member);
            });
        }
    } catch (error) {
        console.error('Error loading family members:', error);
    }
}

// Update individual health card with member data
function updateHealthCard(memberId, healthData) {
    const cardNumber = memberId.replace('member', '');
    
    // Update name
    const nameElement = document.getElementById(`member${cardNumber}-name`);
    if (nameElement) {
        nameElement.textContent = healthData.name || 'Unknown';
    }
    
    // Update email
    const emailElement = document.getElementById(`member${cardNumber}-email`);
    if (emailElement) {
        emailElement.textContent = healthData.email || 'No email';
    }
    
    // Update heart rate
    const heartRateElement = document.getElementById(`member${cardNumber}-heartrate`);
    if (heartRateElement) {
        heartRateElement.textContent = healthData.latestHeartRate ? 
            `${Math.round(healthData.latestHeartRate)} BPM` : '-- BPM';
    }
    
    // Update steps
    const stepsElement = document.getElementById(`member${cardNumber}-steps`);
    if (stepsElement) {
        stepsElement.textContent = healthData.latestSteps ? 
            healthData.latestSteps.toLocaleString() : '--';
    }
    
    // Update sleep
    const sleepElement = document.getElementById(`member${cardNumber}-sleep`);
    if (sleepElement) {
        sleepElement.textContent = healthData.latestSleep ? 
            `${healthData.latestSleep} hrs` : '-- hrs';
    }
    
    // Update last updated timestamp
    const updatedElement = document.getElementById(`member${cardNumber}-updated`);
    if (updatedElement) {
        if (healthData.lastUpdated) {
            const date = new Date(healthData.lastUpdated);
            updatedElement.textContent = date.toLocaleString();
        } else {
            updatedElement.textContent = '--';
        }
    }
}

// Fetch health data from API
async function fetchHealthData() {
    return loadFamilyMembers();
}

// Refresh entire dashboard
async function refreshDashboard() {
    console.log('Refreshing dashboard data...');
    await loadFamilyMembers();
}

// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', function() {
    console.log('Family Health Dashboard loaded');
    loadFamilyMembers();
    
    // Set up automatic refresh every 5 minutes
    setInterval(refreshDashboard, 300000); // 5 minutes = 300000ms
});