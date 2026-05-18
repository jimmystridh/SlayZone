// Content script — runs on every page.
// 1. Injects a marker element so the test can detect it
// 2. Sends a message to the background script to test messaging (with retry)
;(function () {
  if (document.getElementById('slayzone-test-ext')) return

  var marker = document.createElement('div')
  marker.id = 'slayzone-test-ext'
  marker.dataset.status = 'loaded'
  marker.dataset.error = 'none'
  marker.dataset.runtimeType = typeof chrome.runtime
  marker.dataset.sendMessageType = typeof chrome.runtime.sendMessage
  marker.dataset.runtimeId = chrome.runtime.id || 'no-id'
  marker.style.display = 'none'
  document.documentElement.appendChild(marker)

  var attempts = 0
  var maxAttempts = 10

  function tryPing() {
    attempts++
    try {
      chrome.runtime.sendMessage({ type: 'ping' }, function (response) {
        if (chrome.runtime.lastError) {
          marker.dataset.error = chrome.runtime.lastError.message
          // Retry — background page might not be ready yet
          if (attempts < maxAttempts) {
            setTimeout(tryPing, 500)
          } else {
            marker.dataset.status = 'msg-error'
          }
          return
        }
        if (response && response.type === 'pong') {
          marker.dataset.status = 'connected'
          marker.dataset.attempts = String(attempts)
        } else {
          marker.dataset.status = 'bad-response'
          marker.dataset.error = JSON.stringify(response)
        }
      })
    } catch (err) {
      marker.dataset.status = 'throw-error'
      marker.dataset.error = err.message
    }
  }

  // Start first attempt after a short delay to let background page initialize
  setTimeout(tryPing, 500)
})()
