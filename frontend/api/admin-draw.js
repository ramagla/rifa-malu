import {
  registerDraw,
} from '../server/_admin-service.js'

import {
  verifyAdminRequest,
} from '../server/_session.js'

import {
  methodNotAllowed,
  parseBody,
  requireSameOrigin,
  sendJson,
} from '../server/_http.js'

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return methodNotAllowed(response)
  }

  if (!requireSameOrigin(request, response)) {
    return
  }

  if (!verifyAdminRequest(request).ok) {
    return sendJson(
      response,
      401,
      { error: 'Não autenticado.' }
    )
  }

  try {
    const result =
      await registerDraw(
        parseBody(request)
      )

    return sendJson(
      response,
      result.status,
      result.ok
        ? result
        : {
            error: result.error,
          }
    )
  } catch (error) {
    console.error(
      'admin-draw:',
      error?.message
    )

    return sendJson(
      response,
      500,
      {
        error:
          'Não foi possível registrar o sorteio.',
      }
    )
  }
}
