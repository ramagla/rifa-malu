import { getOrganizerName } from '../server/_raffle-service.js'

import {
  clearSessionCookie,
  verifyAdminRequest,
} from '../server/_session.js'

import {
  methodNotAllowed,
  requireSameOrigin,
  sendJson,
} from '../server/_http.js'

export default async function handler(
  request,
  response
) {
  if (request.method === 'GET') {
    const session =
      verifyAdminRequest(request)

    if (!session.ok) {
      return sendJson(
        response,
        401,
        {
          authenticated: false,
        }
      )
    }

    const organizerName = await getOrganizerName()

return sendJson(
      response,
      200,
      {
        authenticated: true,
        user: {
          name: organizerName,
          role: 'Organizador',
        },
      }
    )
  }

  if (request.method === 'POST') {
    if (
      !requireSameOrigin(
        request,
        response
      )
    ) {
      return
    }

    response.setHeader(
      'Set-Cookie',
      clearSessionCookie()
    )

    return sendJson(
      response,
      200,
      {
        authenticated: false,
      }
    )
  }

  return methodNotAllowed(response)
}
