import {
  reserveNumber,
} from '../server/_raffle-service.js'

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

  try {
    const body = parseBody(request)

    const result =
      await reserveNumber(body)

    if (!result.ok) {
      return sendJson(
        response,
        result.status,
        {
          error: result.error,
        }
      )
    }

    return sendJson(
      response,
      201,
      result.reservation
    )
  } catch (error) {
    console.error(
      'reserve:',
      error?.message
    )

    return sendJson(
      response,
      500,
      {
        error:
          'Não foi possível concluir a reserva.',
      }
    )
  }
}
