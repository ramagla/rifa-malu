import {
  releaseParticipation,
} from '../server/_raffle-service.js'

import {
  verifyAdminRequest,
} from '../server/_session.js'

import {
  methodNotAllowed,
  parseBody,
  requireSameOrigin,
  sendJson,
} from '../server/_http.js'

export default async function handler(
  request,
  response
) {
  if (request.method !== 'POST') {
    return methodNotAllowed(response)
  }

  if (
    !requireSameOrigin(
      request,
      response
    )
  ) {
    return
  }

  if (
    !verifyAdminRequest(request).ok
  ) {
    return sendJson(
      response,
      401,
      { error: 'Não autenticado.' }
    )
  }

  try {
    const body = parseBody(request)

    const result =
      await releaseParticipation(
        body.participationId
      )

    return sendJson(
      response,
      result.status,
      result.ok
        ? { success: true }
        : { error: result.error }
    )
  } catch (error) {
    console.error(
      'release:',
      error?.message
    )

    return sendJson(
      response,
      500,
      {
        error:
          'Não foi possível liberar o número.',
      }
    )
  }
}
