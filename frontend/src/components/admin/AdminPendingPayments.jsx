/* eslint-disable react/prop-types */

const pad = value =>
  String(value).padStart(2, '0')

function currency(value) {
  return Number(value || 0)
    .toLocaleString(
      'pt-BR',
      {
        style: 'currency',
        currency: 'BRL',
      }
    )
}

export default function AdminPendingPayments({
  dashboard,
  busy,
  onPaid,
}) {
  const pending =
    dashboard.participations
      .filter(
        item =>
          item.paymentId &&
          item.paymentStatus ===
            'PENDING' &&
          item.participationStatus !==
            'CANCELLED'
      )

  return (
    <div className="overview-pending-wrap">
      <section className="overview-pending">
        <div className="overview-section-head">
          <div>
            <p className="card-label">
              PAGAMENTOS PENDENTES
            </p>

            <h3>
              Aguardando confirmação
            </h3>
          </div>

          <span>
            {pending.length}
          </span>
        </div>

        {pending.length === 0 ? (
          <div className="admin-empty">
            Nenhum pagamento pendente.
          </div>
        ) : (
          <div className="admin-list">
            {pending
              .slice(0, 5)
              .map(item => (
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
                      {currency(
                        item.amount
                      )}
                    </span>

                    <small>
                      {item.phone}
                    </small>
                  </div>

                  <span className="status-pill status-pending">
                    Pendente
                  </span>

                  <div className="action-row">
                    <button
                      className="confirm-button"
                      disabled={busy}
                      onClick={() =>
                        onPaid(item)
                      }
                    >
                      ✓ Marcar como pago
                    </button>
                  </div>
                </article>
              ))}
          </div>
        )}
      </section>
    </div>
  )
}
