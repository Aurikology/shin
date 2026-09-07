// Camera access. getUserMedia with a rear-camera preference, torch control, and a clean
// teardown. No module state, no DOM access at import time.

export async function startCamera(videoEl) {
  if (!window.isSecureContext) {
    throw new Error('Camera needs a secure connection (https or localhost).')
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('This browser has no camera API.')
  }

  const preferred = {
    audio: false,
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
  }

  let stream
  try {
    stream = await navigator.mediaDevices.getUserMedia(preferred)
  } catch (err) {
    // fall back to any camera at all, in case facingMode or the width hint was rejected
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true })
  }

  videoEl.muted = true
  videoEl.playsInline = true
  videoEl.srcObject = stream
  try {
    await videoEl.play()
  } catch (err) {
    // autoplay can be picky on some browsers even when muted, keep going, the stream is live
  }

  const track = stream.getVideoTracks()[0]
  let torchSupported = false
  try {
    const caps = track && track.getCapabilities ? track.getCapabilities() : {}
    torchSupported = !!caps.torch
  } catch (err) {
    torchSupported = false
  }

  const torch = {
    supported: torchSupported,
    set(on) {
      if (!torchSupported || !track) return
      track.applyConstraints({ advanced: [{ torch: !!on }] }).catch(() => {
        // some devices advertise torch and then refuse it mid stream, fail quietly
      })
    },
  }

  function stop() {
    stream.getTracks().forEach((t) => t.stop())
    if (videoEl.srcObject === stream) videoEl.srcObject = null
  }

  return { stream, torch, stop }
}

export function stopCamera(handle) {
  if (handle && typeof handle.stop === 'function') handle.stop()
}
