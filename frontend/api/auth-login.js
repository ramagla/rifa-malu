import { getOrganizerName } from '../server/_raffle-service.js'

import {
  createSessionCookie,
  verifyAdminPassword,
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

  const body = parseBody(request)

  const result =
    verifyAdminPassword(
      body.password
    )

  if (!result.ok) {
    return sendJson(
      response,
      result.configError ? 500 : 401,
      {
        error: result.configError
          ? 'Autenticação administrativa não configurada.'
          : 'Senha inválida.',
      }
    )
  }

  response.setHeader(
    'Set-Cookie',
    createSessionCookie()
  )

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
