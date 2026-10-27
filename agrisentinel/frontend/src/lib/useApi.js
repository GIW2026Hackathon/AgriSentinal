import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'

export function useApi(path) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(Boolean(path))
  const [error, setError] = useState('')
  const requestId = useRef(0)

  const reload = useCallback(
    async ({ silent = false } = {}) => {
      if (!path) return null
      const current = ++requestId.current
      if (!silent) setLoading(true)
      setError('')
      try {
        const result = await api.get(path)
        if (current === requestId.current) setData(result)
        return result
      } catch (err) {
        if (current === requestId.current) setError(err.message || 'Something went wrong')
        return null
      } finally {
        if (current === requestId.current) setLoading(false)
      }
    },
    [path],
  )

  useEffect(() => {
    reload()
  }, [reload])

  return { data, loading, error, reload, setData }
}
