(function () {
  'use strict';

  var refreshBtn = document.getElementById('refresh-btn');

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function show(id) {
    var el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
  }

  function hide(id) {
    var el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  }

  function setBadge(id, text, level) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.className = 'badge badge-' + level;
  }

  async function fetchStatus() {
    show('status-loading');
    hide('status-content');
    hide('status-error');

    try {
      var res = await fetch('/api/public/status');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();

      setBadge('status-service', data.service === 'ok' ? 'OK' : data.service, data.service === 'ok' ? 'ok' : 'error');
      setText('status-engine', data.engine);

      if (data.geminiConfigured) {
        setBadge('status-gemini', 'Configured', 'ok');
      } else {
        setBadge('status-gemini', 'Not configured', 'warn');
      }

      setText('status-apis', (data.allowedApis || []).join(', '));
      setText('status-timestamp', data.timestamp);

      hide('status-loading');
      show('status-content');
    } catch (err) {
      hide('status-loading');
      setText('status-error', 'Failed to load status: ' + err.message);
      show('status-error');
    }
  }

  async function fetchLatestReview() {
    show('review-loading');
    hide('review-content');
    hide('review-error');

    try {
      var res = await fetch('/api/public/reviews/latest');
      if (res.status === 404) {
        hide('review-loading');
        setText('review-error', 'No review reports found.');
        show('review-error');
        return;
      }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();

      setText('review-meta', 'Source: ' + data.source + ' | Last modified: ' + data.lastModified);
      setText('review-body', data.content);

      if (data.truncated) {
        show('review-truncated');
      } else {
        hide('review-truncated');
      }

      hide('review-loading');
      show('review-content');
    } catch (err) {
      hide('review-loading');
      setText('review-error', 'Failed to load review: ' + err.message);
      show('review-error');
    }
  }

  function refreshAll() {
    refreshBtn.disabled = true;
    Promise.all([fetchStatus(), fetchLatestReview()]).finally(function () {
      refreshBtn.disabled = false;
    });
  }

  refreshBtn.addEventListener('click', refreshAll);

  // Initial load
  refreshAll();
})();
