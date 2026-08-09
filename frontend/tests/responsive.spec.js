import {
  expect,
  test,
} from '@playwright/test'


const viewports = [
  {
    name: '320x700',
    width: 320,
    height: 700,
  },
  {
    name: '360x800',
    width: 360,
    height: 800,
  },
  {
    name: '390x844',
    width: 390,
    height: 844,
  },
  {
    name: '412x915',
    width: 412,
    height: 915,
  },
  {
    name: '430x932',
    width: 430,
    height: 932,
  },
  {
    name: '768x1024',
    width: 768,
    height: 1024,
  },
  {
    name: '1024x768',
    width: 1024,
    height: 768,
  },
  {
    name: '1366x768',
    width: 1366,
    height: 768,
  },
  {
    name: '1440x900',
    width: 1440,
    height: 900,
  },
  {
    name: '1920x1080',
    width: 1920,
    height: 1080,
  },
]


const adminPages = [
  'Visão geral',
  'Números',
  'Participantes',
  'Pagamentos',
  'Fraldas',
  'Sorteio',
  'Configurações',
]


async function assertNoHorizontalOverflow(
  page,
  context
) {
  const metrics =
    await page.evaluate(() => ({
      viewport:
        window.innerWidth,

      document:
        document
          .documentElement
          .scrollWidth,

      body:
        document.body
          .scrollWidth,
    }))

  expect(
    metrics.document,
    `${context}: document possui overflow horizontal`
  ).toBeLessThanOrEqual(
    metrics.viewport + 1
  )

  expect(
    metrics.body,
    `${context}: body possui overflow horizontal`
  ).toBeLessThanOrEqual(
    metrics.viewport + 1
  )
}


async function assertModalFits(
  page,
  selector,
  viewport,
  context
) {
  const element =
    page.locator(selector)

  await expect(
    element
  ).toBeVisible()

  const metrics =
    await element.evaluate(
      node => {
        const rect =
          node
            .getBoundingClientRect()

        return {
          top:
            rect.top,

          bottom:
            rect.bottom,

          left:
            rect.left,

          right:
            rect.right,

          width:
            rect.width,

          clientWidth:
            node.clientWidth,

          scrollWidth:
            node.scrollWidth,

          clientHeight:
            node.clientHeight,

          scrollHeight:
            node.scrollHeight,
        }
      }
    )

  expect(
    metrics.left,
    `${context}: modal saiu pela esquerda`
  ).toBeGreaterThanOrEqual(-1)

  expect(
    metrics.right,
    `${context}: modal saiu pela direita`
  ).toBeLessThanOrEqual(
    viewport.width + 1
  )

  expect(
    metrics.top,
    `${context}: modal saiu pelo topo`
  ).toBeGreaterThanOrEqual(-1)

  expect(
    metrics.bottom,
    `${context}: modal saiu pela parte inferior`
  ).toBeLessThanOrEqual(
    viewport.height + 1
  )

  expect(
    metrics.scrollWidth,
    `${context}: modal possui overflow horizontal interno`
  ).toBeLessThanOrEqual(
    metrics.clientWidth + 1
  )
}


async function configureTestEvent(
  request
) {
  const password =
    process.env.ADMIN_PASSWORD

  if (!password) {
    throw new Error(
      'ADMIN_PASSWORD não carregada.'
    )
  }

  const login =
    await request.post(
      '/api/auth-login',
      {
        data: {
          password,
        },
      }
    )

  expect(
    login.ok()
  ).toBeTruthy()

  const publicResponse =
    await request.get(
      '/api/public-event'
    )

  expect(
    publicResponse.ok()
  ).toBeTruthy()

  const {
    event,
  } =
    await publicResponse.json()

  const settings =
    await request.post(
      '/api/admin-settings',
      {
        data: {
          name:
            event.name,

          babyName:
            event.babyName,

          message:
            event.message,

          prize:
            event.prize,

          drawDate:
            event.drawDate,

          drawTime:
            event.drawTime,

          numberCount:
            event.numberCount,

          numberPrice:
            event.numberPrice,

          pixKey:
            'responsivo.teste@example.com',

          pixRecipientName:
            'Malu',

          pixCity:
            'SAO PAULO',

          whatsapp:
            '11999999999',

          deliveryAddress:
            'Endereço de teste responsivo',

          allowPix:
            true,

          allowDiaper:
            true,

          reservationTtlMinutes:
            120,
        },
      }
    )

  expect(
    settings.ok()
  ).toBeTruthy()
}


test.beforeAll(
  async ({
    request,
  }) => {
    await configureTestEvent(
      request
    )
  }
)


for (
  const viewport of
  viewports
) {
  test(
    `responsividade completa ${viewport.name}`,
    async ({
      page,
    }) => {
      await page.setViewportSize({
        width:
          viewport.width,

        height:
          viewport.height,
      })


      const uniqueName =
        `Responsivo ${viewport.name}`

      const uniquePhone =
        '1199' +
        String(
          viewport.width
        ).padStart(4, '0') +
        String(
          viewport.height
        ).slice(-3)


      /*
       * PÁGINA PÚBLICA
       */

      await page.goto('/')

      await expect(
        page.getByRole(
          'heading',
          {
            name:
              /Um número, um carinho/i,
          }
        )
      ).toBeVisible()

      await assertNoHorizontalOverflow(
        page,
        `${viewport.name} - página pública`
      )


      /*
       * SELEÇÃO DE NÚMERO
       */

      const availableNumber =
        page.locator(
          '.number:not(:disabled)'
        ).first()

      await expect(
        availableNumber
      ).toBeVisible()

      const numberText =
        (
          await availableNumber
            .textContent()
        ).trim()

      const selectedNumber =
        Number(numberText)

      await availableNumber.click()

      await page
        .getByRole(
          'button',
          {
            name:
              /Continuar/i,
          }
        )
        .click()


      /*
       * FORMULÁRIO
       */

      await assertModalFits(
        page,
        '.modal form',
        viewport,
        `${viewport.name} - formulário`
      )

      await assertNoHorizontalOverflow(
        page,
        `${viewport.name} - formulário`
      )

      await page
        .getByLabel(
          'Seu nome'
        )
        .fill(
          uniqueName
        )

      await page
        .getByLabel(
          'WhatsApp'
        )
        .fill(
          uniquePhone
        )

      await page
        .getByRole(
          'radio',
          {
            name:
              /Somente Pix/i,
          }
        )
        .check()

      await page
        .getByRole(
          'button',
          {
            name:
              /Revisar dados e pagar/i,
          }
        )
        .click()


      /*
       * REVISÃO
       */

      await expect(
        page.getByText(
          'Reserva temporária'
        )
      ).toBeVisible()

      await assertModalFits(
        page,
        '.success.review',
        viewport,
        `${viewport.name} - revisão`
      )

      await assertNoHorizontalOverflow(
        page,
        `${viewport.name} - revisão`
      )

      await page
        .getByRole(
          'button',
          {
            name:
              /Confirmar dados e gerar Pix/i,
          }
        )
        .click()


      /*
       * QR CODE / MODAL FINAL
       */

      await expect(
        page.getByRole(
          'heading',
          {
            name:
              /Participação registrada/i,
          }
        )
      ).toBeVisible()

      await expect(
        page.locator(
          '.reservation-timer'
        )
      ).toBeVisible()

      await expect(
        page.locator(
          '.pix-payment img'
        )
      ).toBeVisible()

      await expect(
        page.locator(
          '.whatsapp-public-button'
        )
      ).toBeVisible()

      await assertModalFits(
        page,
        '.modal > .success',
        viewport,
        `${viewport.name} - QR Code`
      )

      await assertNoHorizontalOverflow(
        page,
        `${viewport.name} - QR Code`
      )


      const qrMetrics =
        await page
          .locator(
            '.pix-payment img'
          )
          .evaluate(
            image => {
              const rect =
                image
                  .getBoundingClientRect()

              return {
                left:
                  rect.left,

                right:
                  rect.right,

                width:
                  rect.width,
              }
            }
          )

      expect(
        qrMetrics.left
      ).toBeGreaterThanOrEqual(0)

      expect(
        qrMetrics.right
      ).toBeLessThanOrEqual(
        viewport.width + 1
      )


      /*
       * LOGIN ADMIN PELO CONTEXTO DO NAVEGADOR
       */

      const login =
        await page.request.post(
          '/api/auth-login',
          {
            data: {
              password:
                process
                  .env
                  .ADMIN_PASSWORD,
            },
          }
        )

      expect(
        login.ok()
      ).toBeTruthy()


      const dashboardResponse =
        await page.request.get(
          '/api/admin-dashboard'
        )

      expect(
        dashboardResponse.ok()
      ).toBeTruthy()

      const dashboard =
        await dashboardResponse
          .json()

      const participation =
        dashboard.participations
          .find(
            item =>
              item.name ===
              uniqueName
          )

      expect(
        participation
      ).toBeTruthy()

      expect(
        participation.number
      ).toBe(
        selectedNumber
      )


      /*
       * ADMIN
       */

      await page.goto('/admin')

      await expect(
        page.getByRole(
          'heading',
          {
            name:
              'Visão geral',
            exact:
              true,
          }
        )
      ).toBeVisible()

      await assertNoHorizontalOverflow(
        page,
        `${viewport.name} - admin inicial`
      )


      const mobileAdmin =
        viewport.width <= 900


      async function navigateAdmin(
        pageName
      ) {
        if (mobileAdmin) {
          await page
            .locator(
              '.admin-menu-toggle'
            )
            .click()

          await expect(
            page.locator(
              '.admin-shell'
            )
          ).toHaveClass(
            /drawer-open/
          )

          const drawer =
            page.locator(
              '.admin-shell aside'
            )

          await expect(
            drawer
          ).toBeVisible()

          /*
           * O drawer possui transição CSS.
           * Esperamos até ele realmente terminar
           * de entrar no viewport antes de medir.
           */
          await page.waitForFunction(
            () => {
              const element =
                document.querySelector(
                  '.admin-shell aside'
                )

              if (!element) {
                return false
              }

              const rect =
                element
                  .getBoundingClientRect()

              return (
                rect.width > 0 &&
                rect.height > 0 &&
                rect.left >= -1 &&
                rect.right > 0
              )
            }
          )

          const box =
            await drawer.evaluate(
              element => {
                const rect =
                  element
                    .getBoundingClientRect()

                return {
                  x: rect.x,
                  width: rect.width,
                  left: rect.left,
                  right: rect.right,
                }
              }
            )

          expect(
            box.left
          ).toBeGreaterThanOrEqual(-1)

          expect(
            box.right
          ).toBeLessThanOrEqual(
            viewport.width + 1
          )
        }

        await page
          .getByRole(
            'button',
            {
              name:
                pageName,
              exact:
                true,
            }
          )
          .click()

        if (mobileAdmin) {
          await expect(
            page.locator(
              '.admin-shell'
            )
          ).not.toHaveClass(
            /drawer-open/
          )
        }

        await expect(
          page.getByRole(
            'heading',
            {
              name:
                pageName,
              exact:
                true,
            }
          )
        ).toBeVisible()

        await assertNoHorizontalOverflow(
          page,
          `${viewport.name} - admin ${pageName}`
        )
      }


      for (
        const pageName of
        adminPages
      ) {
        if (
          pageName !==
          'Visão geral'
        ) {
          await navigateAdmin(
            pageName
          )
        }

        else {
          await assertNoHorizontalOverflow(
            page,
            `${viewport.name} - admin Visão geral`
          )
        }


        /*
         * BOTÃO DE PAGAMENTO
         */

        if (
          pageName ===
          'Pagamentos'
        ) {
          const paidButton =
            page.getByRole(
              'button',
              {
                name:
                  /Marcar como pago/i,
              }
            ).first()

          await expect(
            paidButton
          ).toBeVisible()

          const buttonBox =
            await paidButton
              .boundingBox()

          expect(
            buttonBox.width
          ).toBeGreaterThanOrEqual(
            44
          )

          if (
            viewport.width <=
            520
          ) {
            expect(
              buttonBox.height
            ).toBeGreaterThanOrEqual(
              44
            )
          }
        }
      }


      /*
       * LIBERAR RESERVA DE TESTE
       * Não deixa lixo entre os viewports.
       */

      const release =
        await page.request.post(
          '/api/admin-release',
          {
            data: {
              participationId:
                participation
                  .participationId,
            },
          }
        )

      expect(
        release.ok()
      ).toBeTruthy()
    }
  )
}
