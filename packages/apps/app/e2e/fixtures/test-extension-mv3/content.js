// Content script — runs on every page.
// 1. Injects a marker element so the test can detect it
// 2. Sends a message to the background script to test messaging
;(function () {
  // Avoid double-injection
  if (document.getElementById('slayzone-test-ext')) return

  var marker = document.createElement('div')
  marker.id = 'slayzone-test-ext'
  marker.dataset.status = 'loaded'
  marker.style.display = 'none'
  document.documentElement.appendChild(marker)

  // Test chrome.runtime.sendMessage → background script
  try {
    chrome.runtime.sendMessage({ type: 'ping' }, function (response) {
      if (chrome.runtime.lastError) {
        marker.dataset.status = 'error'
        marker.dataset.error = chrome.runtime.lastError.message
        return
      }
      if (response && response.type === 'pong') {
        marker.dataset.status = 'connected'
      }
    })
  } catch (err) {
    marker.dataset.status = 'error'
    marker.dataset.error = err.message
  }
})()
