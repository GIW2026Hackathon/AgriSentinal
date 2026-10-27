import { useEffect, useRef, useState } from 'react'

const SCRIPT_ID = 'google-identity-services'

function loadGoogleIdentity() {
  if (window.google?.accounts?.id) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID)
    if (existing) {
      existing.addEventListener('load', resolve, { once: true })
      existing.addEventListener('error', () => reject(new Error('Google sign-in unavailable')), { once: true })
      return
    }
    const script = document.createElement('script')
    script.id = SCRIPT_ID
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.addEventListener('load', resolve, { once: true })
    script.addEventListener('error', () => reject(new Error('Google sign-in unavailable')), { once: true })
    document.head.appendChild(script)
  })
}

export default function GoogleSignIn({ clientId, onCredential, onError }) {
  const holder = useRef(null)
  const credentialRef = useRef(onCredential)
  const errorRef = useRef(onError)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    credentialRef.current = onCredential
    errorRef.current = onError
  }, [onCredential, onError])

  useEffect(() => {
    if (!clientId) return undefined
    let cancelled = false
    loadGoogleIdentity()
      .then(() => {
        if (cancelled || !window.google?.accounts?.id || !holder.current) return
        window.google.accounts.id.initialize({
          client_id: clientId,
          auto_select: false,
          cancel_on_tap_outside: true,
          callback: (response) => {
            if (response?.credential) credentialRef.current?.(response.credential)
            else errorRef.current?.('Google did not return a sign-in token.')
          },
        })
        const width = Math.min(400, Math.max(240, Math.round(holder.current.offsetWidth || 320)))
        holder.current.replaceChildren()
        window.google.accounts.id.renderButton(holder.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'pill',
          logo_alignment: 'left',
          width,
        })
        setReady(true)
      })
      .catch(() => errorRef.current?.('Google sign-in could not load. Use your email and password instead.'))
    return () => {
      cancelled = true
    }
  }, [clientId])

  if (!clientId) return null

  return (
    <div className={ready ? 'flex w-full justify-center' : 'h-0 overflow-hidden'}>
      <div ref={holder} className="w-full" />
    </div>
  )
}
