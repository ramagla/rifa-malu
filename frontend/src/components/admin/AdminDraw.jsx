/* eslint-disable react/prop-types */

import {
  useMemo,
  useState,
} from 'react'

import api from '../../services/api'

const pad = value =>
  String(value).padStart(2, '0')

export default function AdminDraw({
  dashboard,
  onSaved,
}) {
  const eligible = useMemo(
    () =>
      dashboard.participations
        .filter(
          item =>
            item.numberStatus ===
              'CONFIRMED' &&
            item.participationStatus ===
              'CONFIRMED'
        )
        .sort(
          (a, b) =>
            a.number - b.number
        ),
    [dashboard]
  )

  const excluded =
    dashboard.participations
      .filter(
        item =>
          item.participationStatus !==
            'CANCELLED' &&
          !eligible.some(
            eligibleItem =>
              eligibleItem
                .participationId ===
              item.participationId
          )
      )

  const [
    winner,
    setWinner,
  ] = useState('')

  const [
    notes,
    setNotes,
  ] = useState('')

  const [
    message,
    setMessage,
  ] = useState('')

  const [
    error,
    setError,
  ] = useState('')

  const [
    saving,
    setSaving,
  ] = useState(false)

  async function copyEligible() {
    const text =
      eligible
        .map(
          item =>
            `${pad(
              item.number
            )} - ${item.name}`
        )
        .join('\n')

    try {
      await navigator.clipboard
        .writeText(text)

      setMessage(
        'Lista de aptos copiada.'
      )
      setError('')
    } catch {
      setError(
        'Não foi possível copiar automaticamente.'
      )
    }
  }

  async function register(event) {
    event.preventDefault()

    const number =
      Number.parseInt(
        winner,
        10
      )

    const participant =
      eligible.find(
        item =>
          item.number === number
      )

    if (!participant) {
      setError(
        'Escolha um número que esteja na lista de aptos.'
      )
      return
    }

    if (
      !window.confirm(
        `Registrar o número ${pad(
          number
        )} de ${participant.name} como vencedor?`
      )
    ) {
      return
    }

    try {
      setSaving(true)
      setError('')
      setMessage('')

      await api.registerDraw(
        number,
        notes
      )

      await onSaved()

      setMessage(
        'Sorteio registrado com sucesso.'
      )
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const draw =
    dashboard.draw

  return (
    <div className="admin-page-body">
      <section className="draw-summary">
        <article>
          <span>NÚMEROS APTOS</span>
          <strong>
            {eligible.length}
          </strong>
        </article>

        <article>
          <span>FORA DO SORTEIO</span>
          <strong>
            {excluded.length}
          </strong>
        </article>
      </section>

      {message && (
        <div className="settings-success">
          ✓ {message}
        </div>
      )}

      {error && (
        <div className="admin-error">
          {error}
        </div>
      )}

      <section className="draw-layout">
        <article className="draw-panel">
          <div className="draw-panel-head">
            <div>
              <p className="card-label">
                PARTICIPANTES APTOS
              </p>

              <h3>
                Lista para o sorteio
              </h3>
            </div>

            <button
              className="secondary-button"
              disabled={
                eligible.length === 0
              }
              onClick={
                copyEligible
              }
            >
              Copiar lista
            </button>
          </div>

          {eligible.length === 0 ? (
            <div className="admin-empty">
              Ainda não existem
              números confirmados.
            </div>
          ) : (
            <div className="draw-eligible-list">
              {eligible.map(
                item => (
                  <div
                    key={
                      item.participationId
                    }
                  >
                    <b>
                      {pad(
                        item.number
                      )}
                    </b>

                    <span>
                      {item.name}
                    </span>
                  </div>
                )
              )}
            </div>
          )}

          <a
            className="draw-external"
            href="https://marraweb.com.br/sorteador/"
            target="_blank"
            rel="noreferrer"
          >
            Abrir Sorteador
            Marra Web ↗
          </a>
        </article>

        <article className="draw-panel">
          {draw ? (
            <div className="draw-result">
              <p className="card-label">
                SORTEIO REGISTRADO
              </p>

              <span>
                Número vencedor
              </span>

              <strong>
                {pad(
                  draw.winning_number
                )}
              </strong>

              <small>
                {draw.performed_at
                  ? new Date(
                      draw.performed_at
                    ).toLocaleString(
                      'pt-BR'
                    )
                  : ''}
              </small>

              <p>
                O resultado ficou
                registrado no histórico
                do evento.
              </p>
            </div>
          ) : (
            <form
              className="draw-form"
              onSubmit={register}
            >
              <p className="card-label">
                REGISTRAR RESULTADO
              </p>

              <h3>
                Número vencedor
              </h3>

              <label>
                Número sorteado

                <input
                  type="number"
                  min="1"
                  value={winner}
                  onChange={event =>
                    setWinner(
                      event.target.value
                    )
                  }
                  placeholder="Ex.: 05"
                />
              </label>

              <label>
                Observações

                <textarea
                  rows="4"
                  value={notes}
                  onChange={event =>
                    setNotes(
                      event.target.value
                    )
                  }
                  placeholder="Opcional"
                />
              </label>

              <button
                className="continue"
                disabled={
                  saving ||
                  eligible.length === 0
                }
              >
                {saving
                  ? 'Registrando...'
                  : 'Registrar vencedor →'}
              </button>
            </form>
          )}
        </article>
      </section>
    </div>
  )
}
