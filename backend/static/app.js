document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const userId = urlParams.get('userId');

  const userIdDisplay = document.getElementById('userIdDisplay');
  const tableBody = document.getElementById('tableBody');
  const totalCapturesEl = document.getElementById('totalCaptures');
  const topCategoryEl = document.getElementById('topCategory');
  const avgLatencyEl = document.getElementById('avgLatency');

  if (!userId) {
    userIdDisplay.innerText = "No User ID provided in URL";
    tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:red;">Error: Missing ?userId= in URL</td></tr>';
    return;
  }

  userIdDisplay.innerText = userId;

  fetch(`/api/users/${userId}/activity`)
    .then(res => res.json())
    .then(data => {
      if (data.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No activity recorded yet.</td></tr>';
        return;
      }

      totalCapturesEl.innerText = data.length;
      
      let latencies = [];
      let categories = {};

      tableBody.innerHTML = '';
      data.forEach(item => {
        // Stats aggregation
        if (item.analysis?.latency_ms) latencies.push(item.analysis.latency_ms);
        if (item.analysis?.category) {
          categories[item.analysis.category] = (categories[item.analysis.category] || 0) + 1;
        }

        // Render Row
        const tr = document.createElement('tr');
        
        const time = new Date(item.captured_at).toLocaleString();
        const cat = item.analysis?.category || 'Unknown';
        const domain = item.analysis?.app_or_site || item.domain;
        const summary = item.analysis?.summary || 'Pending analysis...';
        
        let confHtml = '';
        if (item.analysis?.confidence) {
          const conf = Math.round(item.analysis.confidence * 100);
          const color = conf > 80 ? '#22c55e' : (conf > 50 ? '#f59e0b' : '#ef4444');
          confHtml = `<span style="color:${color}">${conf}%</span>`;
        }

        let flagsHtml = `<span class="badge">${item.trigger || 'interval'}</span>`;
        if (item.analysis?.sensitive) {
          flagsHtml += ` <span class="badge sensitive">Sensitive Data</span>`;
        }

        tr.innerHTML = `
          <td class="text-muted">${time}</td>
          <td><span class="badge" style="background: rgba(59, 130, 246, 0.2); color: #93c5fd;">${cat}</span></td>
          <td style="font-weight: 500;">${domain}</td>
          <td>${summary}</td>
          <td>${confHtml}</td>
          <td>${flagsHtml}</td>
        `;
        tableBody.appendChild(tr);
      });

      // Update Top Category
      if (Object.keys(categories).length > 0) {
        const topCat = Object.keys(categories).reduce((a, b) => categories[a] > categories[b] ? a : b);
        topCategoryEl.innerText = topCat;
      } else {
        topCategoryEl.innerText = "N/A";
      }

      // Update Avg Latency
      if (latencies.length > 0) {
        const avg = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
        avgLatencyEl.innerText = `${avg} ms`;
      }
    })
    .catch(err => {
      console.error(err);
      tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:red;">Failed to fetch activity data.</td></tr>';
    });
});
