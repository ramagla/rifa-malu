import {
  getReservationStatus,
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
    return methodNotAllowed(
      response
    )
  }

  try {
    const result =
      await getReservationStatus(
        request.query
          ?.participationId
      )

    return sendJson(
      response,
      result.status,
      result.ok
        ? result.reservation
        : {
            error:
              result.error,
          }
    )
  } catch (error) {
    console.error(
      'reservation-status:',
      error?.message
    )

    return sendJson(
      response,
      500,
      {
        error:
          'Não foi possível consultar a reserva.',
      }
    )
  }
}
