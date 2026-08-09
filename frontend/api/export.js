import {
  getAdminDashboard,
  getPublicEvent,
} from '../server/_raffle-service.js'

import {
  verifyAdminRequest,
} from '../server/_session.js'

const labels = {
  AVAILABLE: 'Disponível',
  RESERVED: 'Reservado',
  AWAITING_PAYMENT: 'Aguardando pagamento',
  CONFIRMED: 'Confirmado',
  CANCELLED: 'Cancelado',
  PENDING: 'Pendente',
  PAID: 'Pago',
}

function statusLabel(value) {
  return labels[value] || value || ''
}

function methodLabel(value) {
  if (value === 'pix') return 'Pix'
  if (value === 'diaper') return 'Fraldas'
  if (value === 'both') return 'Pix + fraldas'
  return value || ''
}

function cell(value) {
  return `"${String(value ?? '')
    .replace(/"/g, '""')}"`
}

function line(values) {
  return values.map(cell).join(';')
}

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    return response
      .status(405)
      .json({
        error: 'Método não permitido.',
      })
  }

  if (!verifyAdminRequest(request).ok) {
    return response
      .status(401)
      .json({
        error: 'Não autenticado.',
      })
  }

  try {
    const type =
      String(
        request.query?.type ||
        'participants'
      )

    const [
      dashboard,
      publicData,
    ] = await Promise.all([
      getAdminDashboard(),
      getPublicEvent(),
    ])

    let filename = ''
    let rows = []

    const active =
      dashboard.participations
        .filter(
          item =>
            item.participationStatus !==
            'CANCELLED'
        )

    if (type === 'numbers') {
      filename =
        'numeros-rifa-malu.csv'

      rows.push([
        'Número',
        'Status',
        'Participante',
        'WhatsApp',
      ])

      for (const number of publicData.numbers) {
        const participant =
          active.find(
            item =>
              item.number === number.number
          )

        rows.push([
          number.number,
          statusLabel(number.status),
          participant?.name || '',
          participant?.phone || '',
        ])
      }
    }

    else if (type === 'payments') {
      filename =
        'pagamentos-rifa-malu.csv'

      rows.push([
        'Número',
        'Participante',
        'WhatsApp',
        'Valor',
        'Status',
        'Pago em',
      ])

      dashboard.participations
        .filter(item => item.paymentId)
        .forEach(item => {
          rows.push([
            item.number,
            item.name,
            item.phone,
            item.amount,
            statusLabel(
              item.paymentStatus
            ),
            item.paidAt || '',
          ])
        })
    }

    else if (type === 'diapers') {
      filename =
        'fraldas-rifa-malu.csv'

      rows.push([
        'Número',
        'Participante',
        'WhatsApp',
        'Tamanho',
        'Marca',
        'Pacotes previstos',
        'Pacotes recebidos',
        'Recebido em',
        'Status participação',
      ])

      dashboard.participations
        .filter(
          item =>
            item.method !== 'pix'
        )
        .forEach(item => {
          rows.push([
            item.number,
            item.name,
            item.phone,
            item.diaperSize,
            item.diaperBrand,
            item.diaperPacks,
            item.diaperReceivedPacks,
            item.diaperReceivedAt || '',
            statusLabel(
              item.participationStatus
            ),
          ])
        })
    }

    else if (type === 'eligible') {
      filename =
        'aptos-sorteio-rifa-malu.csv'

      rows.push([
        'Número',
        'Participante',
      ])

      active
        .filter(
          item =>
            item.numberStatus ===
              'CONFIRMED' &&
            item.participationStatus ===
              'CONFIRMED'
        )
        .forEach(item => {
          rows.push([
            item.number,
            item.name,
          ])
        })
    }

    else {
      filename =
        'participantes-rifa-malu.csv'

      rows.push([
        'Número',
        'Participante',
        'WhatsApp',
        'Modalidade',
        'Status',
      ])

      dashboard.participations
        .forEach(item => {
          rows.push([
            item.number,
            item.name,
            item.phone,
            methodLabel(item.method),
            statusLabel(
              item.participationStatus
            ),
          ])
        })
    }

    const content =
      '\uFEFF' +
      rows
        .map(line)
        .join('\r\n')

    response.setHeader(
      'Content-Type',
      'text/csv; charset=utf-8'
    )

    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`
    )

    return response
      .status(200)
      .send(content)
  } catch (error) {
    console.error(
      'export:',
      error?.message
    )

    return response
      .status(500)
      .json({
        error:
          'Não foi possível gerar a exportação.',
      })
  }
}
