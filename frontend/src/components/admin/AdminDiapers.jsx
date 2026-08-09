/* eslint-disable react/prop-types */

import {
  useEffect,
  useMemo,
  useState,
} from 'react'

import api from '../../services/api'

const pad = value =>
  String(value).padStart(2, '0')

export default function AdminDiapers({
  dashboard,
  onSaved,
}) {
  const rows = useMemo(
    () =>
      dashboard.participations
        .filter(
          item =>
            item.method !== 'pix' &&
            item.participationStatus !==
              'CANCELLED'
        ),
    [dashboard]
  )

  const [
    drafts,
    setDrafts,
  ] = useState({})

  const [
    saving,
    setSaving,
  ] = useState(null)

  const [
    message,
    setMessage,
  ] = useState('')

  const [
    error,
    setError,
  ] = useState('')

  const [
    confirmation,
    setConfirmation,
  ] = useState(null)

  useEffect(() => {
    const next = {}

    rows.forEach(item => {
      next[item.participationId] =
        Number(
          item.diaperReceivedPacks || 0
        )
    })

    setDrafts(next)
  }, [rows])

  const expected =
    rows.reduce(
      (sum, item) =>
        sum +
        Number(item.diaperPacks || 0),
      0
    )

  const received =
    rows.reduce(
      (sum, item) =>
        sum +
        Number(
          item.diaperReceivedPacks || 0
        ),
      0
    )

  function save(item) {
    const value =
      Number(
        drafts[
          item.participationId
        ] ?? 0
      )

    if (
      !Number.isInteger(value) ||
      value < 0 ||
      value >
        Number(item.diaperPacks)
    ) {
      setError(
        'Quantidade recebida inválida.'
      )
      return
    }

    setConfirmation({
      item,
      value,
    })
  }


  async function confirmSave() {
    const pending = confirmation

    if (
      !pending ||
      saving !== null
    ) {
      return
    }

    try {
      setSaving(
        pending.item.participationId
      )

      setMessage('')
      setError('')

      await api.markDiaperReceived(
        pending.item.participationId,
        pending.value
      )

      await onSaved()

      setMessage(
        'Recebimento atualizado com sucesso.'
      )
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(null)
      setConfirmation(null)
    }
  }


  return (
    <div className="admin-page-body">
      <section className="diaper-metrics">
        <article>
          <span>PREVISTOS</span>
          <strong>{expected}</strong>
          <small>pacotes</small>
        </article>

        <article>
          <span>RECEBIDOS</span>
          <strong>{received}</strong>
          <small>pacotes</small>
        </article>

        <article>
          <span>PENDENTES</span>
          <strong>
            {Math.max(
              0,
              expected - received
            )}
          </strong>
          <small>pacotes</small>
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

      {rows.length === 0 ? (
        <div className="admin-empty">
          Nenhuma participação com
          fraldas registrada.
        </div>
      ) : (
        <div className="admin-list">
          {rows.map(item => {
            const expectedPacks =
              Number(
                item.diaperPacks || 0
              )

            const receivedPacks =
              Number(
                item.diaperReceivedPacks ||
                0
              )

            const complete =
              receivedPacks >=
              expectedPacks

            return (
              <article
                className="admin-list-card diaper-card"
                key={
                  item.participationId
                }
              >
                <div className="admin-number-badge">
                  {pad(item.number)}
                </div>

                <div className="admin-card-main">
                  <strong>
                    {item.name}
                  </strong>

                  <span>
                    Tamanho{' '}
                    {item.diaperSize ||
                      '—'}
                    {' · '}
                    {item.diaperBrand ||
                      'Marca não informada'}
                  </span>

                  <small>
                    Previsto:{' '}
                    {expectedPacks}{' '}
                    pacote(s)
                  </small>
                </div>

                <span
                  className={
                    complete
                      ? 'diaper-state received'
                      : receivedPacks > 0
                        ? 'diaper-state partial'
                        : 'diaper-state pending'
                  }
                >
                  {complete
                    ? 'Recebido'
                    : receivedPacks > 0
                      ? 'Parcial'
                      : 'Pendente'}
                </span>

                <div className="diaper-receipt">
                  <label>
                    Recebidos

                    <input
                      type="number"
                      min="0"
                      max={
                        expectedPacks
                      }
                      value={
                        drafts[
                          item
                            .participationId
                        ] ?? 0
                      }
                      onChange={event =>
                        setDrafts(
                          current => ({
                            ...current,

                            [item
                              .participationId]:
                              event
                                .target
                                .value,
                          })
                        )
                      }
                    />
                  </label>

                  <button
                    className="confirm-button"
                    disabled={
                      saving ===
                      item.participationId
                    }
                    onClick={() =>
                      save(item)
                    }
                  >
                    {saving ===
                    item.participationId
                      ? 'Salvando...'
                      : 'Salvar recebimento'}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {confirmation && (
        <div
          className="modal admin-confirm-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="diaper-confirm-title"
        >
          <form
            onSubmit={event => {
              event.preventDefault()
              confirmSave()
            }}
          >
            <button
              type="button"
              className="close"
              aria-label="Cancelar"
              disabled={saving !== null}
              onClick={() =>
                setConfirmation(null)
              }
            >
              ×
            </button>

            <p className="eyebrow">
              CONFIRMAÇÃO
            </p>

            <h2 id="diaper-confirm-title">
              Confirmar recebimento?
            </h2>

            <p className="form-copy">
              Registrar{' '}
              <strong>
                {confirmation.value}
              </strong>{' '}
              pacote(s) recebidos do
              número{' '}
              <strong>
                {pad(
                  confirmation
                    .item
                    .number
                )}
              </strong>
              ?
            </p>

            <div className="admin-confirm-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={saving !== null}
                onClick={() =>
                  setConfirmation(null)
                }
              >
                Cancelar
              </button>

              <button
                type="submit"
                className="continue"
                disabled={saving !== null}
              >
                {saving !== null
                  ? 'Salvando...'
                  : 'Confirmar'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
