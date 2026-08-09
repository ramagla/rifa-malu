import {
  getAdminDashboard,
} from '../server/_raffle-service.js'

import {
  verifyAdminRequest,
} from '../server/_session.js'

import {
  methodNotAllowed,
  sendJson,
} from '../server/_http.js'

export default async function handler(
  request,
  response
) {
  if (request.method !== 'GET') {
    return methodNotAllowed(response)
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
    const data =
      await getAdminDashboard()

    return sendJson(
      response,
      200,
      data
    )
  } catch (error) {
    console.error(
      'admin-dashboard:',
      error?.message
    )

    return sendJson(
      response,
      500,
      {
        error:
          'Não foi possível carregar o painel.',
      }
    )
  }
}
