/* eslint-disable react/prop-types */

import {
  useEffect,
  useMemo,
  useState,
} from 'react'


function remainingSeconds(
  expiresAt
) {
  if (!expiresAt) return null

  const difference =
    new Date(expiresAt)
      .getTime() -
    Date.now()

  return Math.max(
    0,
    Math.floor(
      difference / 1000
    )
  )
}


function formatTime(seconds) {
  if (
    seconds == null
  ) {
    return ''
  }

  const hours =
    Math.floor(
      seconds / 3600
    )

  const minutes =
    Math.floor(
      (
        seconds % 3600
      ) / 60
    )

  const remaining =
    seconds % 60

  if (hours > 0) {
    return [
      hours,
      String(minutes)
        .padStart(2, '0'),
      String(remaining)
        .padStart(2, '0'),
    ].join(':')
  }

  return [
    minutes,
    String(remaining)
      .padStart(2, '0'),
  ].join(':')
}


export function ReservationTimer({
  expiresAt,
}) {
  const [
    seconds,
    setSeconds,
  ] = useState(
    () =>
      remainingSeconds(
        expiresAt
      )
  )

  useEffect(() => {
    setSeconds(
      remainingSeconds(
        expiresAt
      )
    )

    if (!expiresAt) {
      return undefined
    }

    const timer =
      window.setInterval(
        () => {
          setSeconds(
            remainingSeconds(
              expiresAt
            )
          )
        },
        1000
      )

    return () => {
      window.clearInterval(
        timer
      )
    }
  }, [expiresAt])


  if (
    seconds == null
  ) {
    return null
  }


  if (seconds <= 0) {
    return (
      <div className="reservation-expired">
        Tempo da reserva encerrado.
        Atualizando o status...
      </div>
    )
  }


  return (
    <div className="reservation-timer">
      <span>
        Tempo restante para o Pix
      </span>

      <strong>
        {formatTime(seconds)}
      </strong>
    </div>
  )
}


function normalizeWhatsApp(
  value
) {
  let digits =
    String(value || '')
      .replace(/\D/g, '')

  if (!digits) return ''

  if (
    digits.startsWith('55') &&
    digits.length >= 12
  ) {
    return digits
  }

  return `55${digits}`
}


export function OrganizerWhatsApp({
  event,
  participation,
}) {
  const phone =
    useMemo(
      () =>
        normalizeWhatsApp(
          event?.whatsapp
        ),
      [event?.whatsapp]
    )


  if (!phone) {
    return (
      <p className="whatsapp-not-configured">
        O WhatsApp do organizador
        ainda não foi cadastrado.
      </p>
    )
  }


  const number =
    String(
      participation?.number ||
      ''
    ).padStart(2, '0')


  let message =
    `Olá! Participei da rifa da Malu ` +
    `com o número ${number}. ` +
    `Meu nome é ${participation?.name || ''}.`


  if (
    participation?.method ===
    'pix'
  ) {
    message +=
      ' Estou enviando o comprovante do Pix.'
  }

  else if (
    participation?.method ===
    'both'
  ) {
    message +=
      ' Estou enviando o comprovante do Pix e gostaria de combinar a entrega das fraldas.'
  }

  else {
    message +=
      ' Gostaria de combinar a entrega das fraldas.'
  }


  const href =
    `https://wa.me/${phone}` +
    `?text=${encodeURIComponent(
      message
    )}`


  return (
    <a
      className="whatsapp-public-button"
      href={href}
      target="_blank"
      rel="noreferrer"
    >
      Falar com o organizador
      pelo WhatsApp ↗
    </a>
  )
}
