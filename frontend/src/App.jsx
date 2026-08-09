/* eslint-disable react/prop-types */

import {
  useCallback,
  useEffect,
  useState,
} from 'react'

import QRCode from 'qrcode'

import api from './services/api'
import {
  OrganizerWhatsApp,
  ReservationTimer,
} from './components/public/PublicReservation'
import AdminPendingPayments from './components/admin/AdminPendingPayments'
import AdminDiapers from './components/admin/AdminDiapers'
import AdminDraw from './components/admin/AdminDraw'
import './App.css'


function formatWhatsApp(value) {
  const digits = String(value || '')
    .replace(/\D/g, '')
    .slice(0, 11)

  if (!digits) {
    return ''
  }

  if (digits.length <= 2) {
    return `(${digits}`
  }

  const ddd = digits.slice(0, 2)
  const number = digits.slice(2)

  if (number.length <= 4) {
    return `(${ddd}) ${number}`
  }

  if (number.length <= 8) {
    return `(${ddd}) ${number.slice(0, 4)}-${number.slice(4)}`
  }

  return `(${ddd}) ${number.slice(0, 5)}-${number.slice(5)}`
}


const pad = value =>
  String(value).padStart(2, '0')


function Logo() {
  return (
    <a className="brand" href="/">
      mimo<span>.</span>
    </a>
  )
}


function formatCurrency(value) {
  return Number(value || 0)
    .toLocaleString(
      'pt-BR',
      {
        style: 'currency',
        currency: 'BRL',
      }
    )
}


function formatDate(value) {
  if (!value) return '—'

  const date =
    new Date(`${value}T12:00:00`)

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value
  }

  return date.toLocaleDateString(
    'pt-BR'
  )
}


function LoadingPage({
  text = 'Carregando...',
}) {
  return (
    <div className="app-state">
      <div className="app-spinner" />
      <p>{text}</p>
    </div>
  )
}


function ErrorPage({
  message,
  onRetry,
}) {
  return (
    <div className="app-state">
      <strong>
        Não foi possível carregar.
      </strong>

      <p>
        {message ||
          'Verifique se a API está funcionando.'}
      </p>

      {onRetry && (
        <button
          className="continue"
          onClick={onRetry}
        >
          Tentar novamente
        </button>
      )}
    </div>
  )
}


function publicNumberStatus(status) {
  const labels = {
    AVAILABLE: 'Disponível',
    RESERVED: 'Reservado',
    AWAITING_PAYMENT:
      'Aguardando pagamento',
    CONFIRMED: 'Confirmado',
    CANCELLED: 'Cancelado',
  }

  return labels[status] || status
}


function numberClass(status, selected) {
  if (status === 'CONFIRMED') {
    return 'number confirmed'
  }

  if (
    status === 'RESERVED' ||
    status === 'AWAITING_PAYMENT'
  ) {
    return 'number reserved'
  }

  if (selected) {
    return 'number selected'
  }

  return 'number'
}



function WinnerBanner({
  draw,
}) {
  const number =
    String(
      draw.winningNumber
    ).padStart(2, '0')

  return (
    <section
      className="winner-banner"
      id="resultado"
    >
      <div className="winner-badge">
        Sorteio encerrado
      </div>

      <div className="winner-content">
        <div className="winner-number">
          <span>
            NÚMERO SORTEADO
          </span>

          <strong>
            {number}
          </strong>
        </div>

        <div className="winner-copy">
          <p className="eyebrow">
            TEMOS UM GANHADOR!
          </p>

          <h2>
            🎉 Parabéns,{' '}
            {draw.winnerName}!
          </h2>

          <p>
            O número{' '}
            <strong>
              {number}
            </strong>{' '}
            foi o grande vencedor
            da rifa da Malu.
          </p>

          <p className="winner-thanks">
            Muito obrigado a todos
            que participaram e fizeram
            parte desse momento especial. 💖
          </p>

          {draw.notes && (
            <p className="winner-notes">
              <strong>
                Observação:
              </strong>{' '}
              {draw.notes}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}


function PublicRaffle() {
  const [
    data,
    setData,
  ] = useState(null)

  const [
    loading,
    setLoading,
  ] = useState(true)

  const [
    error,
    setError,
  ] = useState('')

  const [
    notice,
    setNotice,
  ] = useState('')

  const [
    selected,
    setSelected,
  ] = useState(null)

  const [
    formOpen,
    setFormOpen,
  ] = useState(false)

  const [
    review,
    setReview,
  ] = useState(null)

  const [
    done,
    setDone,
  ] = useState(null)

  const [
    saving,
    setSaving,
  ] = useState(false)

  const [
    form,
    setForm,
  ] = useState({
    name: '',
    phone: '',
    method: 'both',
    size: 'M',
    packs: 1,
    brand: '',
  })


  const load = useCallback(
    async () => {
      try {
        setLoading(true)
        setError('')

        const result =
          await api.getPublicEvent()

        setData(result)

        const event =
          result.event

        setForm(current => ({
          ...current,

          method:
            event.allowPix &&
            event.allowDiaper
              ? 'both'
              : event.allowPix
                ? 'pix'
                : 'diaper',
        }))
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    },
    []
  )


  useEffect(() => {
    load()
  }, [load])


  useEffect(() => {
    const participationId =
      done?.participationId

    if (!participationId) {
      return undefined
    }

    let active = true

    async function refreshReservation() {
      try {
        const status =
          await api.reservationStatus(
            participationId
          )

        if (!active) {
          return
        }

        setDone(current => {
          if (!current) {
            return current
          }

          return {
            ...current,
            ...status,
          }
        })

        if (
          status.numberStatus ===
            'AVAILABLE' &&
          status.participationStatus ===
            'CANCELLED'
        ) {
          await load()
        }

        if (
          status.numberStatus ===
          'CONFIRMED'
        ) {
          await load()
        }
      } catch {
        // Mantém o último status conhecido.
      }
    }

    refreshReservation()

    const timer =
      window.setInterval(
        refreshReservation,
        5000
      )

    return () => {
      active = false

      window.clearInterval(
        timer
      )
    }
  }, [
    done?.participationId,
    load,
  ])


  useEffect(() => {
    async function refreshPublicData() {
      try {
        const result =
          await api.getPublicEvent()

        setData(result)
      } catch {
        // Mantém os últimos dados visíveis.
      }
    }

    const timer =
      window.setInterval(
        refreshPublicData,
        10000
      )

    function onVisibilityChange() {
      if (
        document.visibilityState ===
        'visible'
      ) {
        refreshPublicData()
      }
    }

    document.addEventListener(
      'visibilitychange',
      onVisibilityChange
    )

    return () => {
      window.clearInterval(timer)

      document.removeEventListener(
        'visibilitychange',
        onVisibilityChange
      )
    }
  }, [])


  async function completeReservation(
    payload
  ) {
    try {
      setSaving(true)
      setNotice('')

      const result =
        await api.reserve(
          payload
        )

      setDone({
        ...result,
        name: payload.name,
        phone: payload.phone,
        method: payload.method,
        diaperSize:
          payload.diaperSize,
        diaperBrand:
          payload.diaperBrand,
        diaperPacks:
          payload.diaperPacks,
      })

      setReview(null)
      setFormOpen(false)
      setSelected(null)

      await load()
    } catch (err) {
      if (err.status === 409) {
        setNotice(
          err.message ||
          'Este número não está mais disponível.'
        )

        setReview(null)
        setFormOpen(false)
        setSelected(null)

        await load()

        setTimeout(() => {
          document
            .getElementById('numeros')
            ?.scrollIntoView({
              behavior: 'smooth',
            })
        }, 100)

        return
      }

      setNotice(
        err.message ||
        'Não foi possível registrar sua participação.'
      )
    } finally {
      setSaving(false)
    }
  }


  function submitForm(event) {
    event.preventDefault()

    const payload = {
      number: selected,

      name:
        form.name.trim(),

      phone:
        form.phone.trim(),

      method:
        form.method,

      diaperSize:
        form.method === 'pix'
          ? ''
          : form.size,

      diaperBrand:
        form.method === 'pix'
          ? ''
          : form.brand.trim(),

      diaperPacks:
        form.method === 'pix'
          ? 0
          : Number(form.packs),
    }

    if (
      form.method === 'pix' ||
      form.method === 'both'
    ) {
      setReview(payload)
      setFormOpen(false)
      return
    }

    completeReservation(payload)
  }


  if (loading && !data) {
    return (
      <LoadingPage text="Carregando a rifa..." />
    )
  }


  if (!data) {
    return (
      <ErrorPage
        message={error}
        onRetry={load}
      />
    )
  }


  const event = data.event

  const draw =
    data.draw || null

  const drawClosed =
    Boolean(
      draw?.winningNumber
    )

  const date =
    new Date(
      `${event.drawDate}T12:00:00`
    )


  return (
    <main>
      <section className="hero">
        <nav className="nav content">
          <Logo />

          <div className="nav-links">
            <a href="#como-funciona">
              Como funciona
            </a>

            <a
              className="admin-link"
              href="/admin"
            >
              Área do organizador
            </a>
          </div>
        </nav>

        <div className="content hero-content">
          <p className="eyebrow">
            {event.name.toUpperCase()}
          </p>

          <h1>
            Um número, um carinho
            <br />
            para a nossa pequena.
          </h1>

          <p className="hero-copy">
            {event.message}
          </p>

          {drawClosed ? (
            <a
              className="primary-button"
              href="#resultado"
            >
              Ver resultado do sorteio ↓
            </a>
          ) : (
            <a
              className="primary-button"
              href="#numeros"
            >
              Escolher meu número ↓
            </a>
          )}
        </div>

        <div className="hero-orb orb-one" />
        <div className="hero-orb orb-two" />
      </section>


      <section className="content event-card">
        <div className="event-date">
          <strong>
            {date.getDate()}
          </strong>

          <span>
            {date
              .toLocaleDateString(
                'pt-BR',
                {
                  month: 'short',
                }
              )
              .replace('.', '')
              .toUpperCase()}
            <br />
            {date.getFullYear()}
          </span>
        </div>

        <div>
          <p className="card-label">
            SORTEIO
          </p>

          <h2>
            {event.prize}
          </h2>

          <p>
            O sorteio será realizado
            on-line e divulgado para todos.
          </p>
        </div>

        <div className="divider" />

        <div>
          <p className="card-label">
            {drawClosed
              ? 'RESULTADO'
              : 'PARTICIPAÇÃO'}
          </p>

          <h2>
            {drawClosed
              ? `Nº ${pad(
                  draw.winningNumber
                )} — ${draw.winnerName}`
              : event.allowPix &&
                  event.allowDiaper
                ? 'Fraldas ou Pix'
                : event.allowPix
                  ? 'Pix'
                  : 'Fraldas'}
          </h2>

          <p>
            {drawClosed
              ? 'Sorteio realizado com sucesso. Obrigado a todos que participaram!'
              : 'Você escolhe como prefere participar.'}
          </p>
        </div>
      </section>


      {drawClosed && (
        <div className="content winner-wrapper">
          <WinnerBanner
            draw={draw}
          />
        </div>
      )}


      <section
        className="content raffle"
        id="numeros"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              {drawClosed
                ? 'SORTEIO FINALIZADO'
                : 'ESCOLHA UM NÚMERO'}
            </p>

            <h2>
              {drawClosed
                ? 'Obrigado por fazer parte dessa história.'
                : 'A sua sorte pode fazer parte dessa história.'}
            </h2>
          </div>

          <div className="legend">
            <span>
              <i className="dot available" />
              Disponível
            </span>

            <span>
              <i className="dot reserved-dot" />
              Aguardando Pix
            </span>

            <span>
              <i className="dot confirmed-dot" />
              Confirmado
            </span>
          </div>
        </div>


        {notice && (
          <div className="public-notice">
            {notice}
          </div>
        )}


        <div className="number-grid">
          {data.numbers.map(item => {
            const available =
              item.status === 'AVAILABLE' &&
              !drawClosed

            return (
              <button
                key={item.number}
                className={numberClass(
                  item.status,
                  selected === item.number
                )}
                disabled={!available}
                title={
                  `Número ${pad(
                    item.number
                  )} - ${publicNumberStatus(
                    item.status
                  )}`
                }
                aria-label={
                  `Número ${pad(
                    item.number
                  )} - ${publicNumberStatus(
                    item.status
                  )}`
                }
                onClick={() => {
                  setSelected(
                    item.number
                  )

                  setNotice('')
                }}
              >
                {pad(item.number)}
              </button>
            )
          })}
        </div>


        {drawClosed ? (
          <div className="raffle-closed-box">
            <div className="raffle-closed-icon">
              ✓
            </div>

            <div>
              <p className="card-label">
                RIFA ENCERRADA
              </p>

              <h3>
                O sorteio já foi realizado.
              </h3>

              <p>
                O número vencedor foi{' '}
                <strong>
                  {pad(
                    draw.winningNumber
                  )}
                </strong>{' '}
                e o ganhador foi{' '}
                <strong>
                  {draw.winnerName}
                </strong>.
              </p>
            </div>
          </div>
        ) : (
          <div className="selection-box">
            <div>
              <p className="card-label">
                SEU NÚMERO
              </p>

              <strong>
                {selected
                  ? pad(selected)
                  : '—'}
              </strong>
            </div>

            <p>
              {selected
                ? 'Perfeito! Continue para informar seus dados e a forma de participação.'
                : 'Toque em um número disponível para continuar.'}
            </p>

            <button
              className="continue"
              disabled={!selected}
              onClick={() =>
                setFormOpen(true)
              }
            >
              Continuar →
            </button>
          </div>
        )}
      </section>


      <section
        className="how"
        id="como-funciona"
      >
        <div className="content how-layout">
          <div>
            <p className="eyebrow">
              É SIMPLES PARTICIPAR
            </p>

            <h2>
              Seu gesto vai encher
              o enxoval de amor.
            </h2>
          </div>

          <ol>
            <li>
              <span>01</span>

              <div>
                <h3>
                  Escolha seu número
                </h3>

                <p>
                  Selecione um número
                  disponível na rifa.
                </p>
              </div>
            </li>

            <li>
              <span>02</span>

              <div>
                <h3>
                  Escolha a modalidade
                </h3>

                <p>
                  Participe com fraldas,
                  Pix ou fraldas + Pix.
                </p>
              </div>
            </li>

            <li>
              <span>03</span>

              <div>
                <h3>
                  Pronto, você está dentro!
                </h3>

                <p>
                  Sua participação fica
                  registrada no sistema.
                </p>
              </div>
            </li>
          </ol>
        </div>
      </section>


      <footer>
        <div className="content">
          <Logo />

          <div className="footer-copy">
            <p>
              Feito com carinho para celebrar
              a chegada da {event.babyName || 'Malu'}.
            </p>

            <a
              className="developer-credit"
              href="https://portif-lio-iota-nine.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Desenvolvido por Rafael Almeida ↗
            </a>
          </div>
        </div>
      </footer>


      {formOpen && (
        <div
          className="modal"
          role="dialog"
          aria-modal="true"
        >
          <form onSubmit={submitForm}>
            <button
              type="button"
              className="close"
              aria-label="Fechar"
              onClick={() =>
                setFormOpen(false)
              }
            >
              ×
            </button>

            <p className="eyebrow">
              NÚMERO {pad(selected)}
            </p>

            <h2>
              Vamos confirmar
              sua participação?
            </h2>

            <label>
              Seu nome

              <input
                required
                autoComplete="name"
                value={form.name}
                onChange={event =>
                  setForm({
                    ...form,
                    name:
                      event.target.value,
                  })
                }
              />
            </label>

            <label>
              WhatsApp

              <input
                required
                inputMode="tel"
                autoComplete="tel"
                maxLength={15}
                value={form.phone}
                onChange={event =>
                  setForm({
                    ...form,
                    phone:
                      formatWhatsApp(
                        event.target.value
                      ),
                  })
                }
                placeholder="(11) 99999-9999"
              />
            </label>


            <fieldset className="method-select">
              <legend>
                Como quer participar?
              </legend>

              {event.allowDiaper && (
                <label>
                  <input
                    type="radio"
                    checked={
                      form.method ===
                      'diaper'
                    }
                    onChange={() =>
                      setForm({
                        ...form,
                        method: 'diaper',
                      })
                    }
                  />
                  Fraldas
                </label>
              )}

              {event.allowPix && (
                <label>
                  <input
                    type="radio"
                    checked={
                      form.method ===
                      'pix'
                    }
                    onChange={() =>
                      setForm({
                        ...form,
                        method: 'pix',
                      })
                    }
                  />
                  Somente Pix
                </label>
              )}

              {event.allowPix &&
                event.allowDiaper && (
                  <label>
                    <input
                      type="radio"
                      checked={
                        form.method ===
                        'both'
                      }
                      onChange={() =>
                        setForm({
                          ...form,
                          method: 'both',
                        })
                      }
                    />
                    Pix + fraldas
                  </label>
                )}
            </fieldset>


            {form.method !== 'pix' && (
              <>
                <div className="form-row">
                  <label>
                    Tamanho

                    <select
                      value={form.size}
                      onChange={event =>
                        setForm({
                          ...form,
                          size:
                            event.target.value,
                        })
                      }
                    >
                      <option>P</option>
                      <option>M</option>
                      <option>G</option>
                      <option>XG</option>
                    </select>
                  </label>

                  <label>
                    Pacotes

                    <select
                      value={form.packs}
                      onChange={event =>
                        setForm({
                          ...form,
                          packs:
                            Number(
                              event.target.value
                            ),
                        })
                      }
                    >
                      <option value="1">
                        1
                      </option>
                      <option value="2">
                        2
                      </option>
                      <option value="3">
                        3
                      </option>
                    </select>
                  </label>
                </div>

                <label>
                  Marca da fralda

                  <input
                    value={form.brand}
                    onChange={event =>
                      setForm({
                        ...form,
                        brand:
                          event.target.value,
                      })
                    }
                    placeholder="Ex.: Pampers, Huggies..."
                  />
                </label>
              </>
            )}


            <button
              className="continue submit"
              disabled={saving}
            >
              {saving
                ? 'Salvando...'
                : form.method ===
                    'diaper'
                  ? 'Confirmar participação →'
                  : 'Revisar dados e pagar →'}
            </button>
          </form>
        </div>
      )}


      {review && (
        <div
          className="modal"
          role="dialog"
          aria-modal="true"
        >
          <div className="success review">
            <p className="eyebrow">
              CONFIRME ANTES DE PAGAR
            </p>

            <h2>
              Confira seus dados
            </h2>

            <dl>
              <div>
                <dt>Nome</dt>
                <dd>{review.name}</dd>
              </div>

              <div>
                <dt>Número</dt>
                <dd>
                  {pad(review.number)}
                </dd>
              </div>

              <div>
                <dt>Participação</dt>
                <dd>
                  {review.method === 'both'
                    ? 'Pix + fraldas'
                    : 'Somente Pix'}
                </dd>
              </div>

              {review.method === 'both' && (
                <div>
                  <dt>Fraldas</dt>
                  <dd>
                    {review.diaperPacks}{' '}
                    pacote(s), tamanho{' '}
                    {review.diaperSize}
                  </dd>
                </div>
              )}

              <div>
                <dt>Pix</dt>
                <dd>
                  {formatCurrency(
                    event.numberPrice
                  )}
                </dd>
              </div>
            </dl>

            <div className="reservation-policy">
              <strong>
                Reserva temporária
              </strong>

              <p>
                Após confirmar, este número ficará reservado por{' '}
                {event.reservationTtlMinutes || 1440}{' '}
                minutos aguardando a confirmação do Pix.
              </p>
            </div>

            <button
              className="continue submit"
              disabled={saving}
              onClick={() =>
                completeReservation(
                  review
                )
              }
            >
              {saving
                ? 'Registrando...'
                : 'Confirmar dados e gerar Pix →'}
            </button>

            <button
              className="text-button"
              disabled={saving}
              onClick={() => {
                setReview(null)
                setFormOpen(true)
              }}
            >
              Editar dados
            </button>
          </div>
        </div>
      )}


      {done && (
        <div
          className="modal"
          role="dialog"
          aria-modal="true"
        >
          <div className="success">
            <b>✓</b>

            <p className="eyebrow">
              TUDO CERTO
            </p>

            <h2>
              Participação registrada!
            </h2>

            <p>
              Número{' '}
              <strong>
                {pad(done.number)}
              </strong>{' '}
              reservado para{' '}
              <strong>
                {done.name}
              </strong>.
            </p>

            {done.paymentStatus === 'PAID' ? (
              <div className="public-status-card status-ok">
                <strong>
                  ✓ Pagamento confirmado
                </strong>

                <p>
                  Seu número está confirmado para o sorteio.
                </p>
              </div>
            ) : done.participationStatus === 'CANCELLED' ? (
              <div className="public-status-card status-error">
                <strong>
                  Reserva encerrada
                </strong>

                <p>
                  O prazo terminou e o número voltou a ficar disponível.
                </p>
              </div>
            ) : done.method === 'diaper' ? (
              <div className="public-status-card status-ok">
                <strong>
                  ✓ Participação confirmada
                </strong>

                <p>
                  Seu número já está confirmado. Agora basta combinar a entrega das fraldas.
                </p>
              </div>
            ) : (
              <div className="public-status-card status-wait">
                <strong>
                  Aguardando confirmação do Pix
                </strong>

                <p>
                  Enquanto o contador estiver ativo, o número fica reservado para você.
                </p>

                <ReservationTimer
                  expiresAt={
                    done.expiresAt
                  }
                />
              </div>
            )}

            {done.method !== 'diaper' &&
              done.paymentStatus !== 'PAID' &&
              done.participationStatus !== 'CANCELLED' && (
                <PixPayment
                  event={event}
                />
              )}

            {done.method !== 'pix' &&
              done.participationStatus !== 'CANCELLED' && (
                <p className="delivery-public-info">
                  <strong>
                    Entrega das fraldas:
                  </strong>
                  <br />
                  {event.deliveryAddress}
                </p>
              )}

            {done.participationStatus !== 'CANCELLED' && (
              <OrganizerWhatsApp
                event={event}
                participation={done}
              />
            )}

            <button
              className="continue submit"
              onClick={() =>
                setDone(null)
              }
            >
              Voltar para a rifa
            </button>
          </div>
        </div>
      )}
    </main>
  )
}


const pixField = (
  id,
  value
) =>
  `${id}${String(value.length).padStart(
    2,
    '0'
  )}${value}`


function pixSafe(value, max) {
  return String(value || '')
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      ''
    )
    .replace(
      /[^A-Za-z0-9 $%*+\-./:]/g,
      ''
    )
    .toUpperCase()
    .slice(0, max)
}


function pixPayload(event) {
  const key =
    String(event.pixKey || '').trim()

  if (!key) return ''

  const amount =
    Number(event.numberPrice || 0)

  const merchant =
    pixField(
      '00',
      'br.gov.bcb.pix'
    ) +
    pixField(
      '01',
      key
    )

  const body =
    pixField('00', '01') +
    pixField('26', merchant) +
    pixField('52', '0000') +
    pixField('53', '986') +
    (
      amount
        ? pixField(
            '54',
            amount.toFixed(2)
          )
        : ''
    ) +
    pixField('58', 'BR') +
    pixField(
      '59',
      pixSafe(
        event.pixRecipientName ||
        'Malu',
        25
      )
    ) +
    pixField(
      '60',
      pixSafe(
        event.pixCity ||
        'SAO PAULO',
        15
      )
    ) +
    pixField(
      '62',
      pixField(
        '05',
        '***'
      )
    )

  let crc = 0xffff

  const content =
    `${body}6304`

  for (
    let i = 0;
    i < content.length;
    i += 1
  ) {
    crc ^=
      content.charCodeAt(i) << 8

    for (
      let bit = 0;
      bit < 8;
      bit += 1
    ) {
      crc =
        crc & 0x8000
          ? (crc << 1) ^ 0x1021
          : crc << 1

      crc &= 0xffff
    }
  }

  return (
    content +
    crc
      .toString(16)
      .toUpperCase()
      .padStart(4, '0')
  )
}


function PixPayment({
  event,
}) {
  const [
    image,
    setImage,
  ] = useState('')

  const [
    copied,
    setCopied,
  ] = useState('')

  const code =
    pixPayload(event)


  useEffect(() => {
    if (!code) {
      setImage('')
      return
    }

    QRCode
      .toDataURL(
        code,
        {
          width: 220,
          margin: 1,

          color: {
            dark: '#2e2930',
            light: '#fffdfa',
          },
        }
      )
      .then(setImage)
      .catch(() =>
        setImage('')
      )
  }, [code])


  async function copy(
    value,
    label
  ) {
    try {
      await navigator.clipboard
        .writeText(value)

      setCopied(label)
    } catch {
      setCopied(
        'Não foi possível copiar automaticamente.'
      )
    }
  }


  if (!code) {
    return (
      <p className="pix-box">
        <strong>
          Pix para pagamento
        </strong>
        <br />
        A chave Pix ainda precisa
        ser cadastrada pelo organizador.
      </p>
    )
  }


  return (
    <section className="pix-payment">
      <h3>
        Faça o Pix para confirmar
      </h3>

      {image && (
        <img
          src={image}
          alt="QR Code para pagamento Pix"
        />
      )}

      <p>
        Valor:{' '}
        <strong>
          {formatCurrency(
            event.numberPrice
          )}
        </strong>
        <br />

        Recebedor:{' '}
        <strong>
          {event.pixRecipientName}
        </strong>
      </p>

      <button
        type="button"
        className="copy-button"
        onClick={() =>
          copy(
            event.pixKey,
            'Chave Pix copiada!'
          )
        }
      >
        Copiar chave Pix
      </button>

      <button
        type="button"
        className="copy-button"
        onClick={() =>
          copy(
            code,
            'Código Pix copia e cola copiado!'
          )
        }
      >
        Copiar Pix copia e cola
      </button>

      {copied && (
        <small>
          ✓ {copied}
        </small>
      )}

      <p className="pix-note">
        Após pagar, envie o comprovante
        para o organizador.
      </p>
    </section>
  )
}


function AdminLogin({
  onAuthenticated,
}) {
  const [
    password,
    setPassword,
  ] = useState('')

  const [
    error,
    setError,
  ] = useState('')

  const [
    loading,
    setLoading,
  ] = useState(false)


  async function submit(event) {
    event.preventDefault()

    try {
      setLoading(true)
      setError('')

      await api.adminLogin(
        password
      )

      setPassword('')

      onAuthenticated()
    } catch (err) {
      setError(
        err.status === 401
          ? 'Senha inválida.'
          : err.message
      )
    } finally {
      setLoading(false)
    }
  }


  return (
    <div className="admin-login-page">
      <form
        className="admin-login-card"
        onSubmit={submit}
      >
        <Logo />

        <p className="eyebrow">
          ÁREA DO ORGANIZADOR
        </p>

        <h1>
          Administração da rifa
        </h1>

        <p>
          Entre com sua senha
          administrativa.
        </p>

        {error && (
          <div className="admin-error">
            {error}
          </div>
        )}

        <label>
          Senha

          <input
            type="password"
            required
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={event =>
              setPassword(
                event.target.value
              )
            }
          />
        </label>

        <button
          className="continue submit"
          disabled={loading}
        >
          {loading
            ? 'Entrando...'
            : 'Entrar →'}
        </button>

        <a
          className="admin-back-link"
          href="/"
        >
          ← Voltar para a rifa
        </a>
      </form>
    </div>
  )
}


function AdminApp() {
  const [
    status,
    setStatus,
  ] = useState('checking')


  useEffect(() => {
    let mounted = true

    api
      .adminSession()
      .then(() => {
        if (mounted) {
          setStatus(
            'authenticated'
          )
        }
      })
      .catch(() => {
        if (mounted) {
          setStatus(
            'anonymous'
          )
        }
      })

    return () => {
      mounted = false
    }
  }, [])


  if (status === 'checking') {
    return (
      <LoadingPage text="Verificando sessão..." />
    )
  }


  if (
    status !==
    'authenticated'
  ) {
    return (
      <AdminLogin
        onAuthenticated={() =>
          setStatus(
            'authenticated'
          )
        }
      />
    )
  }


  return (
    <AdminPortal
      onLogout={() =>
        setStatus('anonymous')
      }
    />
  )
}


function AdminPortal({
  onLogout,
}) {
  const [
    page,
    setPage,
  ] = useState('Visão geral')

  const [
    dashboard,
    setDashboard,
  ] = useState(null)

  const [
    publicData,
    setPublicData,
  ] = useState(null)

  const [
    loading,
    setLoading,
  ] = useState(true)

  const [
    error,
    setError,
  ] = useState('')

  const [
    actionBusy,
    setActionBusy,
  ] = useState(false)

  const [
    confirmation,
    setConfirmation,
  ] = useState(null)

  const [
    drawerOpen,
    setDrawerOpen,
  ] = useState(false)


  const load =
    useCallback(
      async () => {
        try {
          setLoading(true)
          setError('')

          const [
            admin,
            publicResult,
          ] =
            await Promise.all([
              api.adminDashboard(),
              api.getPublicEvent(),
            ])

          setDashboard(admin)
          setPublicData(
            publicResult
          )
        } catch (err) {
          if (err.status === 401) {
            onLogout()
            return
          }

          setError(err.message)
        } finally {
          setLoading(false)
        }
      },
      [onLogout]
    )


  useEffect(() => {
    load()
  }, [load])


  function executeAction(
    confirmMessage,
    operation
  ) {
    setConfirmation({
      message: confirmMessage,
      operation,
    })
  }


  async function confirmAction() {
    const pending = confirmation

    if (
      !pending ||
      actionBusy
    ) {
      return
    }

    try {
      setActionBusy(true)
      setError('')

      // Entrega um frame ao navegador para
      // atualizar a interface antes da requisição.
      await new Promise(resolve => {
        window.requestAnimationFrame(
          () => resolve()
        )
      })

      await pending.operation()
      await load()
    } catch (err) {
      if (err.status === 401) {
        onLogout()
        return
      }

      setError(err.message)
    } finally {
      setActionBusy(false)
      setConfirmation(null)
    }
  }


  async function logout() {
    try {
      await api.adminLogout()
    } finally {
      onLogout()
    }
  }


  if (
    loading &&
    !dashboard
  ) {
    return (
      <LoadingPage text="Carregando painel..." />
    )
  }


  if (!dashboard) {
    return (
      <ErrorPage
        message={error}
        onRetry={load}
      />
    )
  }


  const pages = [
    'Visão geral',
    'Números',
    'Participantes',
    'Pagamentos',
    'Fraldas',
    'Sorteio',
    'Configurações',
  ]

  const exportTypes = {
    'Números': 'numbers',
    'Participantes': 'participants',
    'Pagamentos': 'payments',
    'Fraldas': 'diapers',
    'Sorteio': 'eligible',
  }


  function navigate(nextPage) {
    setPage(nextPage)
    setDrawerOpen(false)
  }


  return (
    <div
      className={
        `admin-shell ${
          drawerOpen
            ? 'drawer-open'
            : ''
        }`
      }
    >
      <button
        className="admin-overlay"
        aria-label="Fechar menu"
        onClick={() =>
          setDrawerOpen(false)
        }
      />

      <aside>
        <div className="admin-aside-head">
          <Logo />

          <button
            className="drawer-close"
            aria-label="Fechar menu"
            onClick={() =>
              setDrawerOpen(false)
            }
          >
            ×
          </button>
        </div>

        <div className="event">
          <b>M</b>

          <span>
            <small>
              EVENTO ATIVO
            </small>

            {dashboard.event.name}
          </span>
        </div>

        <nav>
          {pages.map(
            (item, index) => (
              <button
                key={item}
                className={
                  page === item
                    ? 'active'
                    : ''
                }
                onClick={() =>
                  navigate(item)
                }
              >
                <i>
                  {
                    [
                      '◫',
                      '▦',
                      '♙',
                      '◌',
                      '▱',
                      '☆',
                      '⚙',
                    ][index]
                  }
                </i>

                {item}
              </button>
            )
          )}
        </nav>

        <div className="aside-bottom">
          <a href="/">
            ↗ Ver página pública
          </a>

          <button
            onClick={logout}
          >
            ⇥ Sair
          </button>

          <OrganizerIdentity />
        </div>
      </aside>


      <main className="admin-main">
        <div className="admin-mobile-bar">
          <button
            className="admin-menu-toggle"
            aria-label="Abrir menu"
            aria-expanded={
              drawerOpen
            }
            onClick={() =>
              setDrawerOpen(true)
            }
          >
            ☰
          </button>

          <Logo />

          <a href="/">
            ↗
          </a>
        </div>

        <header>
          <div>
            <p>
              MEUS EVENTOS /
              CHÁ DA MALU
            </p>

            <h1>{page}</h1>
          </div>

          <a href="/">
            Ver página pública ↗
          </a>
        </header>


        {error && (
          <div className="admin-global-error">
            {error}
          </div>
        )}


        {exportTypes[page] && (
          <div className="admin-export-toolbar">
            <span>
              Exportações
            </span>

            <a
              className="secondary-button"
              href={api.exportUrl(
                exportTypes[page]
              )}
            >
              Exportar CSV (Excel) ↓
            </a>
          </div>
        )}

        {page ===
          'Visão geral' && (
          <>
            <AdminOverview
              dashboard={dashboard}
            />

            <AdminPendingPayments
              dashboard={dashboard}
              busy={actionBusy}
              onPaid={item =>
                executeAction(
                  `Confirmar pagamento de ${formatCurrency(
                    item.amount
                  )} do número ${pad(
                    item.number
                  )}?`,
                  () =>
                    api.markPaymentPaid(
                      item.paymentId
                    )
                )
              }
            />
          </>
        )}

        {page ===
          'Números' && (
          <AdminNumbers
            dashboard={dashboard}
            publicData={publicData}
            busy={actionBusy}
            onRelease={item =>
              executeAction(
                `Liberar o número ${pad(
                  item.number
                )}?`,
                () =>
                  api
                    .releaseParticipation(
                      item.participationId
                    )
              )
            }
          />
        )}

        {page ===
          'Participantes' && (
          <AdminParticipants
            dashboard={dashboard}
          />
        )}

        {page ===
          'Fraldas' && (
          <AdminDiapers
            dashboard={dashboard}
            onSaved={load}
          />
        )}

        {page ===
          'Sorteio' && (
          <AdminDraw
            dashboard={dashboard}
            onSaved={load}
          />
        )}

        {page ===
          'Configurações' && (
          <AdminSettings
            publicData={publicData}
            dashboard={dashboard}
            onSaved={load}
          />
        )}

        {page ===
          'Pagamentos' && (
          <AdminPayments
            dashboard={dashboard}
            busy={actionBusy}
            onPaid={item =>
              executeAction(
                `Confirmar pagamento de ${formatCurrency(
                  item.amount
                )} do número ${pad(
                  item.number
                )}?`,
                () =>
                  api
                    .markPaymentPaid(
                      item.paymentId
                    )
              )
            }
            onRelease={item =>
              executeAction(
                `Liberar o número ${pad(
                  item.number
                )}?`,
                () =>
                  api
                    .releaseParticipation(
                      item.participationId
                    )
              )
            }
          />
        )}
      </main>

      {confirmation && (
        <div
          className="modal admin-confirm-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-confirm-title"
        >
          <form
            onSubmit={event => {
              event.preventDefault()
              confirmAction()
            }}
          >
            <button
              type="button"
              className="close"
              aria-label="Cancelar"
              disabled={actionBusy}
              onClick={() =>
                setConfirmation(null)
              }
            >
              ×
            </button>

            <p className="eyebrow">
              CONFIRMAÇÃO
            </p>

            <h2 id="admin-confirm-title">
              Confirmar ação?
            </h2>

            <p className="form-copy">
              {confirmation.message}
            </p>

            <div className="admin-confirm-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={actionBusy}
                onClick={() =>
                  setConfirmation(null)
                }
              >
                Cancelar
              </button>

              <button
                type="submit"
                className="continue"
                disabled={actionBusy}
              >
                {actionBusy
                  ? 'Processando...'
                  : 'Confirmar'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}


function AdminOverview({
  dashboard,
}) {
  const counts =
    dashboard.counts

  return (
    <div className="dash">
      <section className="banner">
        <div>
          <small>
            {dashboard.event.name.toUpperCase()}
          </small>

          <h2>
            Sorteio em{' '}
            <b>
              {formatDate(
                dashboard.event.drawDate
              )}
            </b>.
          </h2>

          <p>
            {dashboard.event.prize}
          </p>
        </div>

        <a href="/">
          Ver página ↗
        </a>
      </section>

      <section className="metrics">
        <Card
          a="NÚMEROS CONFIRMADOS"
          b={counts.CONFIRMED}
          c={`de ${dashboard.event.numberCount} números`}
        />

        <Card
          a="AGUARDANDO PAGAMENTO"
          b={
            counts
              .AWAITING_PAYMENT
          }
          c="Reservas Pix pendentes"
        />

        <Card
          a="VALOR RECEBIDO"
          b={formatCurrency(
            dashboard
              .financial
              .paidAmount
          )}
          c="Pagamentos confirmados"
        />

        <Card
          a="PARTICIPAÇÕES"
          b={
            dashboard
              .participations
              .filter(
                item =>
                  item
                    .participationStatus !==
                  'CANCELLED'
              )
              .length
          }
          c="Participações ativas"
        />
      </section>

      <section className="admin-summary-grid">
        <article>
          <p className="card-label">
            DISPONIBILIDADE
          </p>

          <strong>
            {counts.AVAILABLE}
          </strong>

          <span>
            números ainda disponíveis
          </span>
        </article>

        <article>
          <p className="card-label">
            VALOR PENDENTE
          </p>

          <strong>
            {formatCurrency(
              dashboard
                .financial
                .pendingAmount
            )}
          </strong>

          <span>
            aguardando confirmação
          </span>
        </article>
      </section>
    </div>
  )
}


function Card({
  a,
  b,
  c,
}) {
  return (
    <article>
      <p>{a}</p>
      <b>{b}</b>
      <small>{c}</small>
    </article>
  )
}


function AdminNumbers({
  dashboard,
  publicData,
  busy,
  onRelease,
}) {
  if (!publicData) {
    return (
      <LoadingPage text="Carregando números..." />
    )
  }

  const participations =
    dashboard.participations


  return (
    <div className="admin-page-body">
      <div className="admin-list">
        {publicData.numbers.map(
          number => {
            const participation =
              participations.find(
                item =>
                  item.number ===
                    number.number &&
                  item
                    .participationStatus !==
                    'CANCELLED'
              )

            return (
              <article
                className="admin-list-card"
                key={number.number}
              >
                <div className="admin-number-badge">
                  {pad(
                    number.number
                  )}
                </div>

                <div className="admin-card-main">
                  <strong>
                    {participation
                      ?.name ||
                      'Disponível'}
                  </strong>

                  <span>
                    {participation
                      ? participation.phone
                      : 'Sem participante'}
                  </span>
                </div>

                <StatusPill
                  status={
                    number.status
                  }
                />

                {participation &&
                  participation
                    .paymentStatus !==
                    'PAID' && (
                    <button
                      className="secondary-button"
                      disabled={busy}
                      onClick={() =>
                        onRelease(
                          participation
                        )
                      }
                    >
                      Liberar
                    </button>
                  )}
              </article>
            )
          }
        )}
      </div>
    </div>
  )
}


function AdminParticipants({
  dashboard,
}) {
  const rows =
    dashboard.participations
      .filter(
        item =>
          item
            .participationStatus !==
          'CANCELLED'
      )


  return (
    <div className="admin-page-body">
      {rows.length === 0 ? (
        <div className="admin-empty">
          Nenhum participante
          cadastrado.
        </div>
      ) : (
        <div className="admin-list">
          {rows.map(item => (
            <article
              className="admin-list-card"
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
                  {item.phone}
                </span>

                <small>
                  {methodLabel(
                    item.method
                  )}
                </small>
              </div>

              <StatusPill
                status={
                  item
                    .participationStatus
                }
              />

              <a
                className="secondary-button"
                target="_blank"
                rel="noreferrer"
                href={
                  `https://wa.me/55${String(
                    item.phone
                  ).replace(
                    /\D/g,
                    ''
                  )}`
                }
              >
                WhatsApp
              </a>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}


function AdminPayments({
  dashboard,
  busy,
  onPaid,
  onRelease,
}) {
  const rows =
    dashboard.participations
      .filter(
        item =>
          item.paymentId &&
          item
            .participationStatus !==
            'CANCELLED'
      )


  return (
    <div className="admin-page-body">
      {rows.length === 0 ? (
        <div className="admin-empty">
          Nenhum pagamento
          registrado.
        </div>
      ) : (
        <div className="admin-list">
          {rows.map(item => (
            <article
              className="admin-list-card admin-payment-card"
              key={item.paymentId}
            >
              <div className="admin-number-badge">
                {pad(item.number)}
              </div>

              <div className="admin-card-main">
                <strong>
                  {item.name}
                </strong>

                <span>
                  {formatCurrency(
                    item.amount
                  )}
                </span>

                <small>
                  {item.paidAt
                    ? `Pago em ${new Date(
                        item.paidAt
                      ).toLocaleString(
                        'pt-BR'
                      )}`
                    : 'Aguardando confirmação'}
                </small>
              </div>

              <StatusPill
                status={
                  item.paymentStatus
                }
              />

              <div className="action-row">
                {item.paymentStatus ===
                  'PENDING' && (
                  <>
                    <button
                      className="confirm-button"
                      disabled={busy}
                      onClick={() =>
                        onPaid(item)
                      }
                    >
                      ✓ Marcar como pago
                    </button>

                    <button
                      className="secondary-button"
                      disabled={busy}
                      onClick={() =>
                        onRelease(item)
                      }
                    >
                      Liberar
                    </button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}




function OrganizerIdentity() {
  const [
    name,
    setName,
  ] = useState('Organizador')

  useEffect(() => {
    let active = true

    async function loadOrganizer() {
      try {
        const response =
          await fetch(
            '/api/public-event',
            {
              credentials: 'include',
            }
          )

        if (!response.ok) {
          return
        }

        const data =
          await response.json()

        const organizerName =
          String(
            data?.event
              ?.organizerName ||
            ''
          ).trim()

        if (
          active &&
          organizerName
        ) {
          setName(organizerName)
        }
      } catch {
        if (active) {
          setName('Organizador')
        }
      }
    }

    loadOrganizer()

    window.addEventListener(
      'organizer-updated',
      loadOrganizer
    )

    return () => {
      active = false

      window.removeEventListener(
        'organizer-updated',
        loadOrganizer
      )
    }
  }, [])

  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part =>
        part[0]
          ?.toUpperCase()
      )
      .join('') || 'OR'

  return (
    <p>
      <b>{initials}</b>

      <span>
        {name}

        <small>
          Organizador
        </small>
      </span>
    </p>
  )
}


function AdminSettings({
  publicData,
  dashboard,
  onSaved,
}) {
  const event =
    publicData?.event

  const payment =
    dashboard?.payment || null

  const [
    form,
    setForm,
  ] = useState(null)

  const [
    saving,
    setSaving,
  ] = useState(false)

  const [
    testingMercadoPago,
    setTestingMercadoPago,
  ] = useState(false)

  const [
    mercadoPagoTest,
    setMercadoPagoTest,
  ] = useState(null)

  const [
    message,
    setMessage,
  ] = useState('')

  const [
    error,
    setError,
  ] = useState('')


  useEffect(() => {
    if (!event) return

    setForm({
      name:
        event.name || '',

      babyName:
        event.babyName || '',

      message:
        event.message || '',

      prize:
        event.prize || '',

      drawDate:
        event.drawDate || '',

      drawTime:
        event.drawTime || '',

      numberCount:
        Number(
          event.numberCount || 30
        ),

      numberPrice:
        Number(
          event.numberPrice || 15
        ),

      pixKey:
        event.pixKey || '',

      pixRecipientName:
        event.pixRecipientName || '',

      pixCity:
        event.pixCity || '',

      organizerName:
        event.organizerName ||
        'Rafael Almeida',

      whatsapp:
        event.whatsapp || '',

      deliveryAddress:
        event.deliveryAddress || '',

      allowPix:
        Boolean(event.allowPix),

      allowDiaper:
        Boolean(
          event.allowDiaper
        ),

      reservationTtlMinutes:
        Number(
          event.reservationTtlMinutes ||
          1440
        ),

      mercadoPagoEnabled:
        Boolean(
          payment?.mercadoPagoEnabled
        ),

      mercadoPagoEnvironment:
        payment?.environment ||
        'TEST',

      credentialProfile:
        payment?.credentialProfile ||
        'principal',

      feeType:
        payment?.feeType ||
        'PERCENTAGE',

      feeValue:
        Number(
          payment?.feeValue ?? 0.99
        ),

      feePayer:
        payment?.feePayer ||
        'ORGANIZER',

      showFee:
        payment?.showFee !== false,

      autoConfirm:
        payment?.autoConfirm !== false,

      manualFallback:
        payment?.manualFallback !== false,

      pixExpirationMinutes:
        Number(
          payment?.pixExpirationMinutes ||
          1440
        ),
    })
  }, [event, payment])


  if (!form) {
    return (
      <LoadingPage
        text="Carregando configurações..."
      />
    )
  }


  function update(
    key,
    value
  ) {
    setForm(current => ({
      ...current,
      [key]: value,
    }))
  }


  async function submit(
    submitEvent
  ) {
    submitEvent.preventDefault()

    try {
      setSaving(true)
      setError('')
      setMessage('')

      await api.updateSettings(
        form
      )

      await onSaved()

      window.dispatchEvent(
        new Event('organizer-updated')
      )

      setMessage(
        'Configurações salvas com sucesso.'
      )
    } catch (err) {
      setError(
        err.message ||
        'Não foi possível salvar.'
      )
    } finally {
      setSaving(false)
    }
  }


  async function testMercadoPagoConnection() {
    try {
      setTestingMercadoPago(true)
      setMercadoPagoTest(null)
      setError('')
      setMessage('')

      const result =
        await api.testMercadoPago(
          form.credentialProfile
        )

      setMercadoPagoTest(result)
    } catch (err) {
      setError(
        err.message ||
        'Não foi possível testar o Mercado Pago.'
      )
    } finally {
      setTestingMercadoPago(false)
    }
  }


  return (
    <div className="admin-page-body">
      <form
        className="settings-panel"
        onSubmit={submit}
      >
        <div className="settings-title">
          <div>
            <p className="card-label">
              CONFIGURAÇÕES DO EVENTO
            </p>

            <h2>
              Chá de bebê da Malu
            </h2>

            <p>
              As alterações feitas aqui
              aparecem na página pública.
            </p>
          </div>

          <button
            className="confirm-button settings-save-top"
            disabled={saving}
          >
            {saving
              ? 'Salvando...'
              : 'Salvar alterações'}
          </button>
        </div>


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


        <section className="settings-section">
          <h3>
            Informações principais
          </h3>

          <div className="settings-grid">
            <label>
              Nome do evento

              <input
                required
                value={form.name}
                onChange={e =>
                  update(
                    'name',
                    e.target.value
                  )
                }
              />
            </label>

            <label>
              Nome do bebê

              <input
                value={form.babyName}
                onChange={e =>
                  update(
                    'babyName',
                    e.target.value
                  )
                }
              />
            </label>

            <label className="settings-full">
              Mensagem da página

              <textarea
                rows="4"
                value={form.message}
                onChange={e =>
                  update(
                    'message',
                    e.target.value
                  )
                }
              />
            </label>

            <label>
              Prêmio

              <input
                value={form.prize}
                onChange={e =>
                  update(
                    'prize',
                    e.target.value
                  )
                }
              />
            </label>

            <label>
              Data do sorteio

              <input
                type="date"
                value={form.drawDate}
                onChange={e =>
                  update(
                    'drawDate',
                    e.target.value
                  )
                }
              />
            </label>

            <label>
              Horário do sorteio

              <input
                type="time"
                value={form.drawTime}
                onChange={e =>
                  update(
                    'drawTime',
                    e.target.value
                  )
                }
              />
            </label>
          </div>
        </section>


        <section className="settings-section">
          <h3>
            Rifa
          </h3>

          <div className="settings-grid">
            <label>
              Quantidade de números

              <input
                type="number"
                min="1"
                max="500"
                value={
                  form.numberCount
                }
                onChange={e =>
                  update(
                    'numberCount',
                    Number(
                      e.target.value
                    )
                  )
                }
              />
            </label>

            <label>
              Valor por número

              <input
                type="number"
                min="0"
                step="0.01"
                value={
                  form.numberPrice
                }
                onChange={e =>
                  update(
                    'numberPrice',
                    Number(
                      e.target.value
                    )
                  )
                }
              />
            </label>

            <label>
              Reserva Pix (minutos)

              <input
                type="number"
                min="5"
                max="10080"
                value={
                  form
                    .reservationTtlMinutes
                }
                onChange={e =>
                  update(
                    'reservationTtlMinutes',
                    Number(
                      e.target.value
                    )
                  )
                }
              />
            </label>
          </div>


          <div className="settings-options">
            <label>
              <input
                type="checkbox"
                checked={
                  form.allowPix
                }
                onChange={e =>
                  update(
                    'allowPix',
                    e.target.checked
                  )
                }
              />

              Aceitar Pix
            </label>

            <label>
              <input
                type="checkbox"
                checked={
                  form.allowDiaper
                }
                onChange={e =>
                  update(
                    'allowDiaper',
                    e.target.checked
                  )
                }
              />

              Aceitar fraldas
            </label>
          </div>
        </section>


        <section className="settings-section">
          <h3>
            Pix
          </h3>

          <div className="settings-grid">
            <label className="settings-full">
              Chave Pix

              <input
                value={form.pixKey}
                onChange={e =>
                  update(
                    'pixKey',
                    e.target.value
                  )
                }
                placeholder="CPF, e-mail, celular ou chave aleatória"
              />
            </label>

            <label>
              Nome do recebedor

              <input
                value={
                  form
                    .pixRecipientName
                }
                onChange={e =>
                  update(
                    'pixRecipientName',
                    e.target.value
                  )
                }
              />
            </label>

            <label>
              Cidade

              <input
                value={form.pixCity}
                onChange={e =>
                  update(
                    'pixCity',
                    e.target.value
                  )
                }
              />
            </label>
          </div>
        </section>


        <section className="settings-section payment-settings-section">
          <h3>
            Pagamentos automáticos
          </h3>

          <p className="settings-help">
            Configure o Mercado Pago para este evento.
            As credenciais privadas permanecem protegidas
            nas variáveis da Vercel.
          </p>

          <div className="settings-options payment-master-option">
            <label>
              <input
                type="checkbox"
                checked={
                  form.mercadoPagoEnabled
                }
                onChange={e =>
                  update(
                    'mercadoPagoEnabled',
                    e.target.checked
                  )
                }
              />

              Usar Mercado Pago para o Pix
            </label>
          </div>

          <div className="payment-test-box">
            <div>
              <strong>
                Testar integração
              </strong>

              <small>
                Cria uma cobrança somente no
                ambiente de teste do Mercado Pago.
                Nenhum número da rifa será reservado.
              </small>
            </div>

            <button
              type="button"
              className="secondary-button"
              disabled={
                testingMercadoPago
              }
              onClick={
                testMercadoPagoConnection
              }
            >
              {testingMercadoPago
                ? 'Testando...'
                : 'Testar credencial de teste'}
            </button>
          </div>

          {mercadoPagoTest && (
            <div className="payment-test-result">
              <strong>
                ✓ Mercado Pago respondeu
              </strong>

              <span>
                Order:{' '}
                {mercadoPagoTest.orderId}
              </span>

              <span>
                Status:{' '}
                {mercadoPagoTest.orderStatus}
                {' / '}
                {
                  mercadoPagoTest
                    .orderStatusDetail
                }
              </span>

              <span>
                Pix gerado:{' '}
                {
                  mercadoPagoTest
                    .hasPixCopyPaste
                    ? 'Sim'
                    : 'Não'
                }
              </span>
            </div>
          )}

          {form.mercadoPagoEnabled && (
            <div className="payment-settings-fields">
              <div className="settings-grid">
                <label>
                  Ambiente

                  <select
                    value={
                      form
                        .mercadoPagoEnvironment
                    }
                    onChange={e =>
                      update(
                        'mercadoPagoEnvironment',
                        e.target.value
                      )
                    }
                  >
                    <option value="TEST">
                      Teste
                    </option>

                    <option value="PRODUCTION">
                      Produção
                    </option>
                  </select>
                </label>

                <label>
                  Perfil de credencial

                  <input
                    value={
                      form.credentialProfile
                    }
                    onChange={e =>
                      update(
                        'credentialProfile',
                        e.target.value
                          .toLowerCase()
                      )
                    }
                    placeholder="principal"
                  />
                </label>

                <label>
                  Tipo da taxa

                  <select
                    value={form.feeType}
                    onChange={e =>
                      update(
                        'feeType',
                        e.target.value
                      )
                    }
                  >
                    <option value="PERCENTAGE">
                      Percentual (%)
                    </option>

                    <option value="FIXED">
                      Valor fixo (R$)
                    </option>
                  </select>
                </label>

                <label>
                  Valor da taxa

                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.feeValue}
                    onChange={e =>
                      update(
                        'feeValue',
                        Number(
                          e.target.value
                        )
                      )
                    }
                  />
                </label>

                <label>
                  Quem absorve a taxa

                  <select
                    value={form.feePayer}
                    onChange={e =>
                      update(
                        'feePayer',
                        e.target.value
                      )
                    }
                  >
                    <option value="ORGANIZER">
                      Organizador
                    </option>

                    <option value="PARTICIPANT">
                      Participante
                    </option>
                  </select>
                </label>

                <label>
                  Validade do Pix (minutos)

                  <input
                    type="number"
                    min="30"
                    max="43200"
                    value={
                      form
                        .pixExpirationMinutes
                    }
                    onChange={e =>
                      update(
                        'pixExpirationMinutes',
                        Number(
                          e.target.value
                        )
                      )
                    }
                  />
                </label>
              </div>

              <div className="settings-options payment-extra-options">
                <label>
                  <input
                    type="checkbox"
                    checked={form.showFee}
                    onChange={e =>
                      update(
                        'showFee',
                        e.target.checked
                      )
                    }
                  />

                  Exibir a taxa ao participante
                </label>

                <label>
                  <input
                    type="checkbox"
                    checked={
                      form.autoConfirm
                    }
                    onChange={e =>
                      update(
                        'autoConfirm',
                        e.target.checked
                      )
                    }
                  />

                  Confirmar pagamento automaticamente
                </label>

                <label>
                  <input
                    type="checkbox"
                    checked={
                      form.manualFallback
                    }
                    onChange={e =>
                      update(
                        'manualFallback',
                        e.target.checked
                      )
                    }
                  />

                  Permitir Pix manual como alternativa
                </label>
              </div>

              <div className="payment-environment-note">
                {form.mercadoPagoEnvironment ===
                'TEST'
                  ? 'Ambiente de teste: nenhuma cobrança real será criada.'
                  : 'Ambiente de produção: utilizar somente após concluir a homologação.'}
              </div>
            </div>
          )}

          {!form.mercadoPagoEnabled && (
            <div className="payment-disabled-note">
              Mercado Pago desativado. O evento
              continua utilizando o Pix manual atual.
            </div>
          )}
        </section>


        <section className="settings-section">
          <h3>
            Contato e entrega
          </h3>

          <div className="settings-grid">
            <label>
              Nome do organizador

              <input
                required
                value={form.organizerName}
                onChange={e =>
                  update(
                    'organizerName',
                    e.target.value
                  )
                }
                placeholder="Nome do responsável pela rifa"
              />
            </label>

            <label>
              WhatsApp do organizador

              <input
                value={form.whatsapp}
                onChange={e =>
                  update(
                    'whatsapp',
                    formatWhatsApp(e.target.value)
                  )
                }
                placeholder="(11) 99999-9999"
                inputMode="tel"
                maxLength={15}
              />
            </label>

            <label className="settings-full">
              Local para entrega das fraldas

              <textarea
                rows="3"
                value={
                  form.deliveryAddress
                }
                onChange={e =>
                  update(
                    'deliveryAddress',
                    e.target.value
                  )
                }
              />
            </label>
          </div>
        </section>


        <button
          className="continue settings-save-bottom"
          disabled={saving}
        >
          {saving
            ? 'Salvando...'
            : 'Salvar configurações →'}
        </button>
      </form>
    </div>
  )
}


function StatusPill({
  status,
}) {
  const labels = {
    AVAILABLE: 'Disponível',
    RESERVED: 'Reservado',
    AWAITING_PAYMENT:
      'Aguardando Pix',
    CONFIRMED: 'Confirmado',
    CANCELLED: 'Cancelado',

    PENDING: 'Pendente',
    PAID: 'Pago',
  }

  return (
    <span
      className={
        `status-pill status-${String(
          status
        ).toLowerCase()}`
      }
    >
      {labels[status] || status}
    </span>
  )
}


function methodLabel(method) {
  if (method === 'pix') {
    return 'Somente Pix'
  }

  if (method === 'diaper') {
    return 'Fraldas'
  }

  return 'Pix + fraldas'
}


function App() {
  const admin =
    window.location.pathname
      .startsWith('/admin')

  return admin
    ? <AdminApp />
    : <PublicRaffle />
}


export default App
