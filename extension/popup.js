document.addEventListener('DOMContentLoaded', async () => {
  const toggleBtn = document.getElementById('toggleBtn');
  const dashboardBtn = document.getElementById('dashboardBtn');
  const optionsBtn = document.getElementById('optionsBtn');
  const statusText = document.getElementById('statusText');
  const statusDot = document.getElementById('statusDot');
  const activityList = document.getElementById('activityList');

  // Load state
  let { monitoringActive, userId } = await chrome.storage.local.get(['monitoringActive', 'userId']);

  function updateUI() {
    if (monitoringActive) {
      statusText.innerText = 'Active';
      statusText.style.color = '#22c55e';
      statusDot.classList.add('active');
      toggleBtn.innerText = 'Pause Monitoring';
      toggleBtn.classList.add('stop');
    } else {
      statusText.innerText = 'Paused';
      statusText.style.color = '#ef4444';
      statusDot.classList.remove('active');
      toggleBtn.innerText = 'Resume Monitoring';
      toggleBtn.classList.remove('stop');
    }
  }

  updateUI();

  // Toggle button logic
  toggleBtn.addEventListener('click', async () => {
    // Basic consent check - options page should handle initial consent
    const { consentGranted } = await chrome.storage.local.get('consentGranted');
    if (!consentGranted) {
      alert("Please grant consent in the Options page first.");
      chrome.runtime.openOptionsPage();
      return;
    }
    
    monitoringActive = !monitoringActive;
    await chrome.storage.local.set({ monitoringActive });
    
    // Update badge to match state
    chrome.action.setBadgeText({ text: monitoringActive ? 'ON' : '' });
    chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
    
    updateUI();
  });

  // Dashboard button
  dashboardBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: `http://localhost:8000/static/index.html?userId=${userId}` });
  });

  // Options button
  optionsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Fetch recent activity
  async function fetchActivity() {
    try {
      const API_BASE = 'http://localhost:8000/api';
      const response = await fetch(`${API_BASE}/users/${userId}/activity`);
      if (response.ok) {
        const data = await response.json();
        activityList.innerHTML = '';
        if (data.length === 0) {
          activityList.innerHTML = '<li>No recent activity</li>';
        } else {
          // Show top 3
          data.slice(0, 3).forEach(item => {
            const li = document.createElement('li');
            const time = new Date(item.captured_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            const category = item.analysis?.category ? `[${item.analysis.category}]` : '';
            li.innerHTML = `
              <span class="activity-domain">${item.domain} <small style="color:#94a3b8">${time}</small></span>
              <span class="activity-summary">${category} ${item.analysis?.summary || 'Pending analysis...'}</span>
            `;
            activityList.appendChild(li);
          });
        }
      }
    } catch (e) {
      console.error("Failed to fetch activity:", e);
      activityList.innerHTML = '<li>Unable to connect to backend</li>';
    }
  }

  fetchActivity();
});
