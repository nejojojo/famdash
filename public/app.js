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
    
    // Update blood pressure
    const bpElement = document.getElementById(`member${cardNumber}-bp`);
    if (bpElement) {
        if (healthData.latestBloodPressureSystolic && healthData.latestBloodPressureDiastolic) {
            bpElement.textContent = `${Math.round(healthData.latestBloodPressureSystolic)}/${Math.round(healthData.latestBloodPressureDiastolic)} mmHg`;
        } else {
            bpElement.textContent = '--/-- mmHg';
        }
    }
    
    // Update oxygen saturation
    const o2Element = document.getElementById(`member${cardNumber}-o2`);
    if (o2Element) {
        o2Element.textContent = healthData.latestOxygenSaturation ? 
            `${Math.round(healthData.latestOxygenSaturation)}%` : '--%';
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
    
    // Set up card click handlers for navigation
    setupCardClickHandlers();
});

// Set up click handlers to navigate to member detail pages
function setupCardClickHandlers() {
    // Add click handlers to all member cards
    const memberCards = ['member1', 'member2', 'member3'];
    
    memberCards.forEach(memberId => {
        const cardElement = document.querySelector(`[data-member-id="${memberId}"]`);
        if (cardElement) {
            cardElement.style.cursor = 'pointer';
            cardElement.addEventListener('click', () => {
                window.location.href = `/member-detail.html?member=${memberId}`;
            });
        } else {
            // Fallback: Try to find card by ID pattern
            const fallbackCard = document.getElementById(`${memberId}-card`);
            if (fallbackCard) {
                fallbackCard.style.cursor = 'pointer';
                fallbackCard.addEventListener('click', () => {
                    window.location.href = `/member-detail.html?member=${memberId}`;
                });
            }
        }
    });
    
    // Also add hover effects
    const style = document.createElement('style');
    style.textContent = `
        .member-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
            transition: all 0.2s ease;
        }
        .member-card {
            transition: all 0.2s ease;
        }
    `;
    document.head.appendChild(style);
}