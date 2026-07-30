const API_BASE = 'http://localhost:8000/api';
let captureIntervalId = null;

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(['userId', 'monitoringActive']);
  if (!current.userId) {
    chrome.storage.local.set({ 
      monitoringActive: false,
      userId: crypto.randomUUID(),
      blocklist: ['*://*.bank.com/*', '*://*.health.com/*']
    });
  }
  
  // Set up default alarm for coarse interval (e.g., 2 minutes)
  chrome.alarms.create('capture_interval', { periodInMinutes: 2 });
});

// Setup offscreen document (Chrome only)
async function setupOffscreenDocument(path) {
  if (!chrome.offscreen) return; // Firefox does not support this
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: path,
    reasons: ['DOM_PARSER'],
    justification: 'Compress screenshots in canvas'
  });
}

// Direct compression for Firefox (which has DOM access in background scripts)
async function compressImageDirectly(dataUrl, quality) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const MAX_WIDTH = 1280;
      let width = img.width;
      let height = img.height;
      if (width > MAX_WIDTH) {
        height = Math.round((height * MAX_WIDTH) / width);
        width = MAX_WIDTH;
      }
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality).split(',')[1]);
    };
    img.src = dataUrl;
  });
}

// Alarms trigger
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'capture_interval') {
    triggerCapture('interval');
  }
});

// Tab switch trigger (debounced)
let tabSwitchTimeout;
chrome.tabs.onActivated.addListener((activeInfo) => {
  clearTimeout(tabSwitchTimeout);
  tabSwitchTimeout = setTimeout(() => {
    triggerCapture('tab_switch');
  }, 2000); // 2 second debounce
});

async function triggerCapture(triggerType) {
  const { monitoringActive, userId, blocklist } = await chrome.storage.local.get(['monitoringActive', 'userId', 'blocklist']);
  
  if (!monitoringActive) return;

  // Check idle state
  const idleState = await new Promise(resolve => chrome.idle.queryState(60, resolve));
  if (idleState !== 'active') return;

  // Get active tab
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab || activeTab.url.startsWith('chrome://') || activeTab.url.startsWith('edge://')) return;

  // Check blocklist
  const domain = new URL(activeTab.url).hostname;
  // Simple check for demonstration purposes
  if (blocklist.some(pattern => {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    return regex.test(activeTab.url);
  })) {
    console.log("Blocked by blocklist:", activeTab.url);
    return;
  }

  try {
    // Capture visible tab
    const dataUrl = await chrome.tabs.captureVisibleTab(activeTab.windowId, { format: 'jpeg', quality: 100 });
    
    let b64Image;
    if (chrome.offscreen) {
      // Chrome uses offscreen API
      await setupOffscreenDocument('offscreen.html');
      b64Image = await chrome.runtime.sendMessage({
        target: 'offscreen',
        type: 'compress_image',
        data: dataUrl,
        quality: 0.6
      });
    } else {
      // Firefox handles it directly in the background script
      b64Image = await compressImageDirectly(dataUrl, 0.6);
    }

    if (!b64Image) {
      console.warn("Failed to compress image, skipping ingest.");
      return;
    }

    // Send to backend
    await fetch(`${API_BASE}/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        image_b64: b64Image,
        tab_title: activeTab.title,
        domain: domain,
        window_focused: true,
        capture_trigger: triggerType,
        captured_at: new Date().toISOString()
      })
    });
    console.log("Capture sent to backend successfully.");

  } catch (err) {
    console.error("Capture failed:", err);
  }
}
