export function sendJson(response, status, data) {
  return response
    .status(status)
    .json(data)
}

export function methodNotAllowed(response) {
  return sendJson(
    response,
    405,
    {
      error: 'Método não permitido.',
    }
  )
}

export function parseBody(request) {
  if (
    request.body &&
    typeof request.body === 'object'
  ) {
    return request.body
  }

  if (typeof request.body === 'string') {
    try {
      return JSON.parse(request.body)
    } catch {
      return {}
    }
  }

  return {}
}

export function verifySameOrigin(request) {
  const origin = String(
    request.headers?.origin || ''
  )

  if (!origin) {
    return true
  }

  const host = String(
    request.headers?.host || ''
  )

  if (!host) {
    return false
  }

  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

export function requireSameOrigin(
  request,
  response
) {
  if (!verifySameOrigin(request)) {
    sendJson(
      response,
      403,
      {
        error:
          'Origem da requisição inválida.',
      }
    )

    return false
  }

  return true
}
