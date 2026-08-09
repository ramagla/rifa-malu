import http from 'node:http'

import authLogin from '../api/auth-login.js'
import authSession from '../api/auth-session.js'
import publicEvent from '../api/public-event.js'
import reserve from '../api/reserve.js'
import reservationStatus from '../api/reservation-status.js'

import adminDashboard from '../api/admin-dashboard.js'
import adminPaymentPaid from '../api/admin-payment-paid.js'
import adminRelease from '../api/admin-release.js'
import adminSettings from '../api/admin-settings.js'

import adminDiaper from '../api/admin-diaper.js'
import adminDraw from '../api/admin-draw.js'
import exportHandler from '../api/export.js'

const PORT = Number(process.env.API_PORT || 8000)

const routes = new Map([
  ['/api/auth-login', authLogin],
  ['/api/auth-session', authSession],
  ['/api/auth-logout', authSession],
  ['/api/public-event', publicEvent],
  ['/api/reserve', reserve],
  ['/api/reservation-status', reservationStatus],
  ['/api/admin-dashboard', adminDashboard],
  ['/api/admin-payment-paid', adminPaymentPaid],
  ['/api/admin-release', adminRelease],
  ['/api/admin-settings', adminSettings],
  ['/api/admin-diaper', adminDiaper],
  ['/api/admin-draw', adminDraw],
  ['/api/export', exportHandler],
])

function readBody(request) {
  return new Promise((resolve, reject) => {
    let data = ''

    request.on('data', chunk => {
      data += chunk

      if (data.length > 1024 * 1024) {
        reject(new Error('Payload muito grande.'))
        request.destroy()
      }
    })

    request.on('end', () => {
      if (!data) {
        resolve({})
        return
      }

      try {
        resolve(JSON.parse(data))
      } catch {
        resolve(data)
      }
    })

    request.on('error', reject)
  })
}

function makeResponse(response) {
  const wrapper = {
    setHeader(name, value) {
      response.setHeader(name, value)
      return wrapper
    },

    status(code) {
      response.statusCode = code
      return wrapper
    },

    json(data) {
      if (!response.hasHeader('Content-Type')) {
        response.setHeader(
          'Content-Type',
          'application/json; charset=utf-8'
        )
      }

      response.end(JSON.stringify(data))
      return wrapper
    },

    send(data) {
      response.end(data)
      return wrapper
    },

    end() {
      response.end()
      return wrapper
    },
  }

  return wrapper
}

const server = http.createServer(
  async (request, response) => {
    try {
      const url = new URL(
        request.url,
        `http://${request.headers.host}`
      )

      const handler = routes.get(url.pathname)

      if (!handler) {
        response.statusCode = 404
        response.setHeader(
          'Content-Type',
          'application/json; charset=utf-8'
        )

        response.end(
          JSON.stringify({
            error: 'Rota não encontrada.',
          })
        )

        return
      }

      request.query = Object.fromEntries(
        url.searchParams.entries()
      )

      if (
        request.method !== 'GET' &&
        request.method !== 'HEAD'
      ) {
        request.body = await readBody(request)
      }

      await handler(
        request,
        makeResponse(response)
      )
    } catch (error) {
      console.error(
        'local-api:',
        error?.message || error
      )

      if (!response.headersSent) {
        response.statusCode = 500

        response.setHeader(
          'Content-Type',
          'application/json; charset=utf-8'
        )
      }

      response.end(
        JSON.stringify({
          error: 'Erro interno da API local.',
        })
      )
    }
  }
)

server.listen(
  PORT,
  '127.0.0.1',
  () => {
    console.log('')
    console.log('======================================')
    console.log('RIFA MALU - API LOCAL')
    console.log('======================================')
    console.log(`http://127.0.0.1:${PORT}`)
    console.log('')
  }
)
