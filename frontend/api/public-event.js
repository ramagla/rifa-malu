import {
  getLatestPublicDraw,
  getPublicEvent,
} from '../server/_raffle-service.js'

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

  try {
    const slug =
      request.query?.slug ||
      'cha-da-malu'

    const data =
      await getPublicEvent(slug)

    const draw =
      await getLatestPublicDraw(slug)

    return sendJson(
      response,
      200,
      {
        ...data,
        draw,
      }
    )
  } catch (error) {
    console.error(
      'public-event:',
      error?.message
    )

    return sendJson(
      response,
      500,
      {
        error:
          'Não foi possível carregar o evento.',
      }
    )
  }
}
