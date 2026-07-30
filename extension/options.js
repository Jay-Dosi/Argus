const API_BASE = 'http://localhost:8000/api';

document.addEventListener('DOMContentLoaded', async () => {
  const consentCheckbox = document.getElementById('consentCheckbox');
  const retentionCheckbox = document.getElementById('retentionCheckbox');
  const saveConsentBtn = document.getElementById('saveConsentBtn');
  const consentStatus = document.getElementById('consentStatus');
  const blocklistUI = document.getElementById('blocklistUI');
  const newDomainInput = document.getElementById('newDomainInput');
  const addDomainBtn = document.getElementById('addDomainBtn');
  const deleteDataBtn = document.getElementById('deleteDataBtn');
  const deleteStatus = document.getElementById('deleteStatus');

  let { userId, consentGranted, retentionDays, blocklist } = await chrome.storage.local.get(['userId', 'consentGranted', 'retentionDays', 'blocklist']);
  
  if (!userId) {
    userId = crypto.randomUUID();
    await chrome.storage.local.set({ userId });
  }

  consentCheckbox.checked = !!consentGranted;
  retentionCheckbox.checked = retentionDays > 0;

  function renderBlocklist() {
    blocklistUI.innerHTML = '';
    (blocklist || []).forEach((domain, idx) => {
      const li = document.createElement('li');
      li.innerHTML = `${domain} <button data-idx="${idx}" class="remove-domain" style="background:none; color:red; border:none; cursor:pointer;">[x]</button>`;
      blocklistUI.appendChild(li);
    });
    
    document.querySelectorAll('.remove-domain').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const idx = parseInt(e.target.getAttribute('data-idx'));
        blocklist.splice(idx, 1);
        await chrome.storage.local.set({ blocklist });
        renderBlocklist();
      });
    });
  }
  renderBlocklist();

  saveConsentBtn.addEventListener('click', async () => {
    const isGranted = consentCheckbox.checked;
    const retain = retentionCheckbox.checked ? 7 : 0;
    
    await chrome.storage.local.set({
      consentGranted: isGranted,
      retentionDays: retain,
      monitoringActive: isGranted // auto start if granted
    });

    try {
      await fetch(`${API_BASE}/users/consent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          consent_status: isGranted ? 'granted' : 'revoked',
          screenshot_retention_days: retain
        })
      });
      consentStatus.innerText = "Consent settings saved successfully.";
      setTimeout(() => consentStatus.innerText = "", 3000);
    } catch (e) {
      console.error(e);
      consentStatus.innerText = "Saved locally, but failed to sync to server.";
      consentStatus.style.color = 'red';
    }
  });

  addDomainBtn.addEventListener('click', async () => {
    const domain = newDomainInput.value.trim();
    if (domain && !blocklist.includes(domain)) {
      blocklist.push(domain);
      await chrome.storage.local.set({ blocklist });
      renderBlocklist();
      newDomainInput.value = '';
    }
  });

  deleteDataBtn.addEventListener('click', async () => {
    if (confirm("Are you sure? This will delete all your activity history.")) {
      try {
        await fetch(`${API_BASE}/users/${userId}`, { method: 'DELETE' });
        deleteStatus.innerText = "Data deleted successfully.";
        await chrome.storage.local.set({ consentGranted: false, monitoringActive: false });
        consentCheckbox.checked = false;
      } catch (e) {
        deleteStatus.innerText = "Error deleting data.";
        deleteStatus.style.color = 'red';
      }
      setTimeout(() => deleteStatus.innerText = "", 3000);
    }
  });
});
