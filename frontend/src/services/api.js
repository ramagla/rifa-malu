async function request(url, options = {}) {
  let response

  try {
    response = await fetch(url, {
      credentials: 'include',
      ...options,
      headers: {
        ...(options.body
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...(options.headers || {}),
      },
    })
  } catch {
    const error = new Error(
      'Não foi possível conectar ao sistema. Verifique sua internet e tente novamente.'
    )

    error.status = 0
    error.network = true

    throw error
  }

  const contentType =
    response.headers.get('content-type') || ''

  const data = contentType.includes('application/json')
    ? await response.json()
    : await response.text()

  if (!response.ok) {
    const error = new Error(
      data?.error ||
      `Erro HTTP ${response.status}`
    )

    error.status = response.status
    error.data = data

    throw error
  }

  return data
}

const api = {
  getPublicEvent() {
    return request('/api/public-event')
  },

  reserve(payload) {
    return request('/api/reserve', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  reservationStatus(
    participationId
  ) {
    return request(
      '/api/reservation-status?' +
      'participationId=' +
      encodeURIComponent(
        participationId
      )
    )
  },


  adminLogin(password) {
    return request('/api/auth-login', {
      method: 'POST',
      body: JSON.stringify({
        password,
      }),
    })
  },

  adminSession() {
    return request('/api/auth-session')
  },

  adminLogout() {
    return request('/api/auth-logout', {
      method: 'POST',
    })
  },

  adminDashboard() {
    return request('/api/admin-dashboard')
  },

  markPaymentPaid(paymentId) {
    return request(
      '/api/admin-payment-paid',
      {
        method: 'POST',
        body: JSON.stringify({
          paymentId,
        }),
      }
    )
  },

  updateSettings(payload) {
    return request(
      '/api/admin-settings',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    )
  },

  releaseParticipation(
    participationId
  ) {
    return request(
      '/api/admin-release',
      {
        method: 'POST',
        body: JSON.stringify({
          participationId,
        }),
      }
    )
  },

  markDiaperReceived(
    participationId,
    receivedPacks
  ) {
    return request(
      '/api/admin-diaper',
      {
        method: 'POST',
        body: JSON.stringify({
          participationId,
          receivedPacks,
        }),
      }
    )
  },

  registerDraw(
    winningNumber,
    notes
  ) {
    return request(
      '/api/admin-draw',
      {
        method: 'POST',
        body: JSON.stringify({
          winningNumber,
          notes,
        }),
      }
    )
  },

  exportUrl(type) {
    return (
      '/api/export?type=' +
      encodeURIComponent(type)
    )
  },

}

export default api
