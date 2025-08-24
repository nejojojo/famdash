// Member Detail Page JavaScript

let currentMemberId = null;
let currentPeriod = 'month';
let charts = {};

// Get member ID from URL parameters
function getMemberIdFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('member');
}

// Initialize page when DOM loads
document.addEventListener('DOMContentLoaded', function() {
    currentMemberId = getMemberIdFromURL();
    
    if (!currentMemberId) {
        alert('No member specified. Redirecting to dashboard.');
        window.location.href = '/';
        return;
    }

    setupEventListeners();
    loadMemberData();
    loadHistoricalData();
});

// Set up event listeners
function setupEventListeners() {
    // Period selector buttons
    document.getElementById('period-month').addEventListener('click', () => setPeriod('month'));
    document.getElementById('period-week').addEventListener('click', () => setPeriod('week'));
    document.getElementById('period-year').addEventListener('click', () => setPeriod('year'));
}

// Set active period and reload data
function setPeriod(period) {
    currentPeriod = period;
    
    // Update button styles
    document.querySelectorAll('[id^="period-"]').forEach(btn => {
        btn.className = 'px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300';
    });
    document.getElementById(`period-${period}`).className = 'px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700';
    
    // Reload historical data
    loadHistoricalData();
}

// Load member basic information
async function loadMemberData() {
    try {
        const response = await fetch('/api/health-data');
        const data = await response.json();
        
        const member = data.members.find(m => m.id === currentMemberId);
        if (!member) {
            throw new Error('Member not found');
        }
        
        // Update member information
        document.getElementById('member-name').textContent = member.name;
        document.getElementById('member-email').textContent = member.email;
        document.getElementById('page-title').textContent = `${member.name} - Health Details`;
        
        // Update member initials
        const initials = member.name.split(' ').map(n => n[0]).join('').toUpperCase();
        document.getElementById('member-initials').textContent = initials;
        
        // Update current metrics
        document.getElementById('current-heart-rate').textContent = member.latestHeartRate || '--';
        document.getElementById('current-steps').textContent = member.latestSteps ? member.latestSteps.toLocaleString() : '--';
        document.getElementById('current-sleep').textContent = member.latestSleep ? `${member.latestSleep}` : '--';
        
        // Update blood pressure
        if (member.latestBloodPressureSystolic && member.latestBloodPressureDiastolic) {
            document.getElementById('current-bp').textContent = `${Math.round(member.latestBloodPressureSystolic)}/${Math.round(member.latestBloodPressureDiastolic)}`;
        } else {
            document.getElementById('current-bp').textContent = '--/--';
        }
        
        // Update oxygen saturation
        document.getElementById('current-o2').textContent = member.latestOxygenSaturation ? `${Math.round(member.latestOxygenSaturation)}` : '--';
        
        // Update last updated
        if (member.lastUpdated) {
            const lastUpdated = new Date(member.lastUpdated).toLocaleString();
            document.getElementById('last-updated').textContent = lastUpdated;
        }
        
    } catch (error) {
        console.error('Error loading member data:', error);
        alert('Error loading member information. Redirecting to dashboard.');
        window.location.href = '/';
    }
}

// Load historical health data
async function loadHistoricalData() {
    showLoadingOverlay();
    
    try {
        const response = await fetch(`/api/member/${currentMemberId}/history?period=${currentPeriod}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const historicalData = await response.json();
        
        // Create or update charts
        updateCharts(historicalData);
        updateStatistics(historicalData);
        
    } catch (error) {
        console.error('Error loading historical data:', error);
        
        // Show error message or use sample data for testing
        console.log('Using sample data for testing...');
        const sampleData = generateSampleData();
        updateCharts(sampleData);
        updateStatistics(sampleData);
    } finally {
        hideLoadingOverlay();
    }
}

// Generate sample data for testing
function generateSampleData() {
    const days = [];
    const heartRates = [];
    const steps = [];
    const sleepHours = [];
    const bloodPressureSystolic = [];
    const bloodPressureDiastolic = [];
    const oxygenSaturation = [];
    
    // Generate data for the last 30 days
    for (let i = 29; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        
        days.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        heartRates.push(Math.floor(Math.random() * 40) + 60); // 60-100 BPM
        steps.push(Math.floor(Math.random() * 8000) + 2000); // 2000-10000 steps
        sleepHours.push(Math.floor(Math.random() * 4) + 6); // 6-10 hours
        bloodPressureSystolic.push(Math.floor(Math.random() * 40) + 100); // 100-140 mmHg
        bloodPressureDiastolic.push(Math.floor(Math.random() * 30) + 60); // 60-90 mmHg
        oxygenSaturation.push(Math.floor(Math.random() * 5) + 95); // 95-100%
    }
    
    return {
        period: currentPeriod,
        dates: days,
        heartRate: heartRates,
        steps: steps,
        sleep: sleepHours,
        bloodPressureSystolic: bloodPressureSystolic,
        bloodPressureDiastolic: bloodPressureDiastolic,
        oxygenSaturation: oxygenSaturation
    };
}

// Update all charts with new data
function updateCharts(data) {
    updateHeartRateChart(data.dates, data.heartRate);
    updateStepsChart(data.dates, data.steps);
    updateSleepChart(data.dates, data.sleep);
    updateBloodPressureChart(data.dates, data.bloodPressureSystolic, data.bloodPressureDiastolic);
    updateOxygenSaturationChart(data.dates, data.oxygenSaturation);
}

// Create or update heart rate chart
function updateHeartRateChart(labels, data) {
    const ctx = document.getElementById('heart-rate-chart').getContext('2d');
    
    if (charts.heartRate) {
        charts.heartRate.destroy();
    }
    
    charts.heartRate = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Heart Rate (BPM)',
                data: data,
                borderColor: 'rgb(239, 68, 68)',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                tension: 0.1,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    min: 50,
                    max: 120
                },
                x: {
                    display: true,
                    ticks: {
                        maxTicksLimit: 10
                    }
                }
            }
        }
    });
}

// Create or update steps chart
function updateStepsChart(labels, data) {
    const ctx = document.getElementById('steps-chart').getContext('2d');
    
    if (charts.steps) {
        charts.steps.destroy();
    }
    
    charts.steps = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Steps',
                data: data,
                backgroundColor: 'rgba(59, 130, 246, 0.8)',
                borderColor: 'rgb(59, 130, 246)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true
                },
                x: {
                    display: true,
                    ticks: {
                        maxTicksLimit: 10
                    }
                }
            }
        }
    });
}

// Create or update sleep chart
function updateSleepChart(labels, data) {
    const ctx = document.getElementById('sleep-chart').getContext('2d');
    
    if (charts.sleep) {
        charts.sleep.destroy();
    }
    
    charts.sleep = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Sleep (Hours)',
                data: data,
                borderColor: 'rgb(168, 85, 247)',
                backgroundColor: 'rgba(168, 85, 247, 0.1)',
                tension: 0.1,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    min: 0,
                    max: 12
                },
                x: {
                    display: true,
                    ticks: {
                        maxTicksLimit: 10
                    }
                }
            }
        }
    });
}

// Create or update blood pressure chart
function updateBloodPressureChart(labels, systolicData, diastolicData) {
    const ctx = document.getElementById('blood-pressure-chart').getContext('2d');
    
    if (charts.bloodPressure) {
        charts.bloodPressure.destroy();
    }
    
    charts.bloodPressure = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Systolic',
                data: systolicData,
                borderColor: 'rgb(239, 68, 68)',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                tension: 0.1,
                fill: false
            }, {
                label: 'Diastolic',
                data: diastolicData,
                borderColor: 'rgb(59, 130, 246)',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                tension: 0.1,
                fill: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    min: 50,
                    max: 180
                },
                x: {
                    display: true,
                    ticks: {
                        maxTicksLimit: 10
                    }
                }
            }
        }
    });
}

// Create or update oxygen saturation chart
function updateOxygenSaturationChart(labels, data) {
    const ctx = document.getElementById('oxygen-saturation-chart').getContext('2d');
    
    if (charts.oxygenSaturation) {
        charts.oxygenSaturation.destroy();
    }
    
    charts.oxygenSaturation = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Oxygen Saturation (%)',
                data: data,
                borderColor: 'rgb(34, 197, 94)',
                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                tension: 0.1,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    min: 90,
                    max: 100
                },
                x: {
                    display: true,
                    ticks: {
                        maxTicksLimit: 10
                    }
                }
            }
        }
    });
}

// Update statistics and summary
function updateStatistics(data) {
    // Heart Rate Stats
    const hrData = data.heartRate.filter(hr => hr > 0);
    if (hrData.length > 0) {
        document.getElementById('hr-avg').textContent = Math.round(hrData.reduce((a, b) => a + b) / hrData.length);
        document.getElementById('hr-max').textContent = Math.max(...hrData);
        document.getElementById('hr-min').textContent = Math.min(...hrData);
        
        // Heart rate alerts (>160 BPM)
        const hrAlerts = hrData.filter(hr => hr > 160).length;
        document.getElementById('hr-alerts').textContent = hrAlerts;
    }
    
    // Steps Stats
    const stepsData = data.steps.filter(steps => steps > 0);
    if (stepsData.length > 0) {
        document.getElementById('steps-avg').textContent = Math.round(stepsData.reduce((a, b) => a + b) / stepsData.length).toLocaleString();
        document.getElementById('steps-max').textContent = Math.max(...stepsData).toLocaleString();
        document.getElementById('steps-total').textContent = stepsData.reduce((a, b) => a + b).toLocaleString();
        
        // Active days (>5000 steps)
        const activeDays = stepsData.filter(steps => steps > 5000).length;
        document.getElementById('active-days').textContent = activeDays;
    }
    
    // Sleep Stats
    const sleepData = data.sleep.filter(sleep => sleep > 0);
    if (sleepData.length > 0) {
        document.getElementById('sleep-avg').textContent = (sleepData.reduce((a, b) => a + b) / sleepData.length).toFixed(1);
        document.getElementById('sleep-max').textContent = Math.max(...sleepData);
        document.getElementById('sleep-min').textContent = Math.min(...sleepData);
        
        // Good sleep days (>7 hours)
        const goodSleepDays = sleepData.filter(sleep => sleep >= 7).length;
        document.getElementById('good-sleep-days').textContent = goodSleepDays;
    }
    
    // Blood Pressure Stats
    if (data.bloodPressureSystolic && data.bloodPressureDiastolic) {
        const bpSysData = data.bloodPressureSystolic.filter(bp => bp > 0);
        const bpDiaData = data.bloodPressureDiastolic.filter(bp => bp > 0);
        
        if (bpSysData.length > 0 && bpDiaData.length > 0) {
            const avgSys = Math.round(bpSysData.reduce((a, b) => a + b) / bpSysData.length);
            const avgDia = Math.round(bpDiaData.reduce((a, b) => a + b) / bpDiaData.length);
            const latestSys = bpSysData[bpSysData.length - 1];
            const latestDia = bpDiaData[bpDiaData.length - 1];
            
            document.getElementById('bp-latest').textContent = `${latestSys}/${latestDia} mmHg`;
            document.getElementById('bp-sys-avg').textContent = avgSys;
            document.getElementById('bp-dia-avg').textContent = avgDia;
        }
    }
    
    // Oxygen Saturation Stats
    if (data.oxygenSaturation) {
        const o2Data = data.oxygenSaturation.filter(o2 => o2 > 0);
        
        if (o2Data.length > 0) {
            const avgO2 = Math.round(o2Data.reduce((a, b) => a + b) / o2Data.length);
            const maxO2 = Math.max(...o2Data);
            const minO2 = Math.min(...o2Data);
            
            document.getElementById('o2-avg').textContent = `${avgO2}%`;
            document.getElementById('o2-max').textContent = `${maxO2}%`;
            document.getElementById('o2-min').textContent = `${minO2}%`;
        }
    }
    
    // Calculate health score (simple algorithm)
    const healthScore = calculateHealthScore(data);
    document.getElementById('health-score').textContent = `${healthScore}/100`;
}

// Calculate overall health score
function calculateHealthScore(data) {
    let score = 0;
    let factors = 0;
    
    // Steps score (40 points max)
    const avgSteps = data.steps.reduce((a, b) => a + b) / data.steps.length;
    score += Math.min(40, (avgSteps / 10000) * 40);
    factors += 40;
    
    // Sleep score (35 points max)
    const avgSleep = data.sleep.reduce((a, b) => a + b) / data.sleep.length;
    if (avgSleep >= 7 && avgSleep <= 9) score += 35;
    else if (avgSleep >= 6) score += 25;
    else score += 10;
    factors += 35;
    
    // Heart rate score (25 points max)
    const avgHR = data.heartRate.filter(hr => hr > 0).reduce((a, b) => a + b) / data.heartRate.filter(hr => hr > 0).length;
    if (avgHR >= 60 && avgHR <= 100) score += 25;
    else if (avgHR <= 110) score += 20;
    else score += 10;
    factors += 25;
    
    return Math.round((score / factors) * 100);
}

// Show loading overlay
function showLoadingOverlay() {
    document.getElementById('loading-overlay').classList.remove('hidden');
}

// Hide loading overlay
function hideLoadingOverlay() {
    document.getElementById('loading-overlay').classList.add('hidden');
}