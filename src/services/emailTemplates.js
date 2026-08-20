/**
 * ============================================================
 *  EMAIL TEMPLATES  — edit this file to change any email design
 * ============================================================
 *
 * Each template is a plain function that receives a data object
 * and returns { subject, html, text }.
 *
 * Shared helpers (styles, header, footer) are at the bottom of
 * the file so you can rebrand everything from one spot.
 * ============================================================
 */

// ─── Shared brand values ────────────────────────────────────
const BRAND = {
  name: 'Steamoji Workshop',
  color: '#4F46E5',       // primary button / accent colour
  colorLight: '#EEF2FF',  // light tint used for backgrounds
  logo: '',               // optional: URL to your logo image
  website: '',            // optional: your public site URL
  supportEmail: '',       // optional: reply-to / help address
}

// ─── 1. Registration confirmation ───────────────────────────

/**
 * Sent to the parent when a child is successfully registered
 * for a session.
 *
 * @param {Object} p
 * @param {string} p.parentName      - Parent / guardian full name
 * @param {string} p.childName       - Child's full name
 * @param {string} p.sessionTopic    - Workshop topic  e.g. "Public Speaking"
 * @param {string} p.sessionDate     - Human-readable date  e.g. "Friday, May 16 2026"
 * @param {string} p.sessionTime     - Human-readable time  e.g. "10:00 AM"
 * @param {string} p.branchName      - Branch / location name
 * @param {string} [p.branchAddress] - Branch address (optional)
 * @param {string} [p.registrationId]- Registration reference ID (optional)
 * @param {string} [p.calendarUrl]   - Google Calendar add-event URL (optional)
 */
export function registrationConfirmationTemplate(p) {
  const subject = `You're registered! ${p.sessionTopic} on ${p.sessionDate}`

  const html = layout(
    subject,
    `
    ${badge('Registration Confirmed', BRAND.color)}

    <p style="margin:0 0 16px">Hi ${esc(p.parentName)},</p>

    <p style="margin:0 0 16px">
      Great news — <strong>${esc(p.childName)}</strong> is all set for the upcoming
      workshop. Here are the details:
    </p>

    ${sessionCard(p)}

    ${p.registrationId ? `
    <p style="margin:16px 0 0;font-size:13px;color:#6B7280">
      Reference&nbsp;ID: <code style="background:#F3F4F6;padding:2px 6px;border-radius:4px">${esc(p.registrationId)}</code>
    </p>` : ''}

    <p style="margin:24px 0 0">
      If you have any questions or need to make changes, please contact us as soon
      as possible.
    </p>

    <p style="margin:24px 0 0">See you there!<br>The ${esc(BRAND.name)} Team</p>
    `
  )

  const text = [
    `Hi ${p.parentName},`,
    '',
    `${p.childName} has been successfully registered for:`,
    `  Workshop: ${p.sessionTopic}`,
    `  Date:     ${p.sessionDate}`,
    `  Time:     ${p.sessionTime}`,
    `  Location: ${p.branchName}${p.branchAddress ? ', ' + p.branchAddress : ''}`,
    p.registrationId ? `  Reference: ${p.registrationId}` : '',
    '',
    `If you have any questions, please get in touch.`,
    '',
    `See you there!`,
    `The ${BRAND.name} Team`,
  ].filter((l) => l !== undefined).join('\n')

  return { subject, html, text }
}

// ─── 2. Cancellation confirmation ───────────────────────────

/**
 * Sent to the parent when a registration is cancelled.
 *
 * @param {Object} p
 * @param {string} p.parentName   - Parent / guardian full name
 * @param {string} p.childName    - Child's full name
 * @param {string} p.sessionTopic - Workshop topic
 * @param {string} p.sessionDate  - Human-readable date
 * @param {string} p.sessionTime  - Human-readable time
 * @param {string} p.branchName   - Branch / location name
 */
export function cancellationConfirmationTemplate(p) {
  const subject = `Registration cancelled — ${p.sessionTopic} on ${p.sessionDate}`

  const html = layout(
    subject,
    `
    ${badge('Registration Cancelled', '#DC2626')}

    <p style="margin:0 0 16px">Hi ${esc(p.parentName)},</p>

    <p style="margin:0 0 16px">
      We've cancelled <strong>${esc(p.childName)}</strong>'s registration for the
      following session:
    </p>

    ${sessionCard(p)}

    <p style="margin:24px 0 0">
      If this was a mistake, or you'd like to register again, please visit our
      website or contact us directly.
    </p>

    <p style="margin:24px 0 0">
      We hope to see ${esc(p.childName)} at a future workshop!<br>
      The ${esc(BRAND.name)} Team
    </p>
    `
  )

  const text = [
    `Hi ${p.parentName},`,
    '',
    `The registration for ${p.childName} has been cancelled:`,
    `  Workshop: ${p.sessionTopic}`,
    `  Date:     ${p.sessionDate}`,
    `  Time:     ${p.sessionTime}`,
    `  Location: ${p.branchName}`,
    '',
    `If this was a mistake, please contact us.`,
    '',
    `We hope to see ${p.childName} at a future workshop!`,
    `The ${BRAND.name} Team`,
  ].join('\n')

  return { subject, html, text }
}

// ─── 3. Session reminder (day-before) ───────────────────────

/**
 * Sent at 10 AM the day before a registered session.
 *
 * @param {Object} p
 * @param {string} p.parentName      - Parent / guardian full name
 * @param {string} p.childName       - Child's full name
 * @param {string} p.sessionTopic    - Workshop topic
 * @param {string} p.sessionDate     - Human-readable date
 * @param {string} p.sessionTime     - Human-readable time
 * @param {string} p.branchName      - Branch / location name
 * @param {string} [p.branchAddress] - Branch address (optional)
 * @param {string} [p.calendarUrl]   - Google Calendar add-event URL (optional)
 */
export function sessionReminderTemplate(p) {
  const subject = `Reminder: ${p.sessionTopic} is tomorrow at ${p.sessionTime}!`

  const html = layout(
    subject,
    `
    ${badge('Session Reminder — Tomorrow!', '#D97706')}

    <p style="margin:0 0 16px">Hi ${esc(p.parentName)},</p>

    <p style="margin:0 0 16px">
      Just a friendly reminder that <strong>${esc(p.childName)}</strong>'s workshop
      is <strong>tomorrow</strong>. We can't wait to see them!
    </p>

    ${sessionCard(p)}

    <p style="margin:24px 0 8px"><strong>What to bring:</strong></p>
    <ul style="margin:0 0 16px;padding-left:20px;color:#374151">
      <li>Comfortable clothes</li>
      <li>Water bottle</li>
      <li>A great attitude!</li>
    </ul>

    <p style="margin:24px 0 0">
      If you have any last-minute questions, don't hesitate to reach out.<br>
      See you tomorrow!<br>
      The ${esc(BRAND.name)} Team
    </p>
    `
  )

  const text = [
    `Hi ${p.parentName},`,
    '',
    `Just a reminder that ${p.childName}'s workshop is TOMORROW:`,
    `  Workshop: ${p.sessionTopic}`,
    `  Date:     ${p.sessionDate}`,
    `  Time:     ${p.sessionTime}`,
    `  Location: ${p.branchName}${p.branchAddress ? ', ' + p.branchAddress : ''}`,
    '',
    `See you tomorrow!`,
    `The ${BRAND.name} Team`,
  ].join('\n')

  return { subject, html, text }
}

// ─── 4. Session deleted notification ────────────────────────

/**
 * Sent to every registered member when an admin deletes a session.
 *
 * @param {Object} p
 * @param {string} p.parentName      - Parent / guardian full name
 * @param {string} p.childName       - Child's full name
 * @param {string} p.sessionTopic    - Workshop topic
 * @param {string} p.sessionDate     - Human-readable date
 * @param {string} p.sessionTime     - Human-readable time
 * @param {string} p.branchName      - Branch / location name
 * @param {string} [p.branchAddress] - Branch address (optional)
 * @param {string} [p.reason]        - Admin-provided reason for cancellation
 */
export function sessionDeletedTemplate(p) {
  const subject = `Session cancelled — ${p.sessionTopic} on ${p.sessionDate}`

  const reasonBlock = p.reason
    ? `
    <div style="
      margin:20px 0;
      padding:16px;
      background:#FEF2F2;
      border-left:4px solid #DC2626;
      border-radius:0 8px 8px 0;
    ">
      <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#991B1B;text-transform:uppercase;letter-spacing:.4px">
        Reason for cancellation
      </p>
      <p style="margin:0;font-size:15px;color:#374151">${esc(p.reason)}</p>
    </div>`
    : ''

  const html = layout(
    subject,
    `
    ${badge('Session Cancelled', '#DC2626')}

    <p style="margin:0 0 16px">Hi ${esc(p.parentName)},</p>

    <p style="margin:0 0 16px">
      We're sorry to let you know that the following session, for which
      <strong>${esc(p.childName)}</strong> was registered, has been cancelled:
    </p>

    ${sessionCard(p)}

    ${reasonBlock}

    <p style="margin:24px 0 0">
      We apologise for the inconvenience. If you have any questions, please
      reach out to us and we'll do our best to help.
    </p>

    <p style="margin:24px 0 0">
      We hope to see ${esc(p.childName)} at a future workshop!<br>
      The ${esc(BRAND.name)} Team
    </p>
    `
  )

  const text = [
    `Hi ${p.parentName},`,
    '',
    `We're sorry — the following session for ${p.childName} has been cancelled:`,
    `  Workshop: ${p.sessionTopic}`,
    `  Date:     ${p.sessionDate}`,
    `  Time:     ${p.sessionTime}`,
    `  Location: ${p.branchName}${p.branchAddress ? ', ' + p.branchAddress : ''}`,
    p.reason ? `\nReason: ${p.reason}` : '',
    '',
    `We apologise for the inconvenience. Please contact us if you have any questions.`,
    '',
    `We hope to see ${p.childName} at a future workshop!`,
    `The ${BRAND.name} Team`,
  ].filter((l) => l !== undefined).join('\n')

  return { subject, html, text }
}

// ─── 5. Payment pending (complete your payment) ────────────

/**
 * Sent when a registration is saved but payment has not been completed.
 * Includes a link to the Square checkout page.
 */
export function paymentPendingTemplate(p) {
  const amountLabel = p.priceLabel || formatMoney(p.priceAmount, p.currency)
  const subject = `Action required: Complete payment for ${p.sessionTopic}`

  const html = layout(
    subject,
    `
    ${badge('Payment Required', '#D97706')}

    <p style="margin:0 0 16px">Hi ${esc(p.parentName)},</p>

    <p style="margin:0 0 16px">
      <strong>${esc(p.childName)}</strong> has been registered for the workshop below,
      but <strong>payment is still required</strong> to confirm their spot.
      Your registration is not complete until payment is received.
    </p>

    ${sessionCard(p)}

    ${gstInvoiceRows(p, 'Total due')}

    ${p.checkoutUrl ? ctaButton('Complete Payment', p.checkoutUrl) : ''}

    ${p.checkoutUrl ? `
    <p style="margin:24px 0 0;font-size:14px;color:#6B7280">
      If you have already paid, you can ignore this email — confirmation may take a few minutes.
      If the button above does not work, copy and paste this link into your browser:<br>
      <a href="${esc(p.checkoutUrl)}" style="color:${BRAND.color};word-break:break-all">${esc(p.checkoutUrl)}</a>
    </p>` : ''}

    <p style="margin:24px 0 0">Thank you!<br>The ${esc(BRAND.name)} Team</p>
    `
  )

  const text = [
    `Hi ${p.parentName},`,
    '',
    `${p.childName} has been registered for ${p.sessionTopic}, but payment is still required.`,
    '',
    `  Workshop: ${p.sessionTopic}`,
    `  Date:     ${p.sessionDate}`,
    `  Time:     ${p.sessionTime}`,
    `  Location: ${p.branchName}${p.branchAddress ? ', ' + p.branchAddress : ''}`,
    Number(p.taxAmount) > 0
      ? `  Subtotal: ${p.subtotalLabel || formatMoney(p.priceAmount, p.currency)}`
      : '',
    Number(p.taxAmount) > 0 ? `  GST (5%): ${p.taxLabel || formatMoney(p.taxAmount, p.currency)}` : '',
    `  Total due: ${amountLabel}`,
    '',
    p.checkoutUrl ? `Complete payment here: ${p.checkoutUrl}` : '',
    '',
    `Thank you!`,
    `The ${BRAND.name} Team`,
  ].filter(Boolean).join('\n')

  return { subject, html, text }
}

// ─── 6. Payment receipt (paid confirmation) ────────────────

/**
 * Sent after Square confirms payment. Includes amount paid and registration details.
 */
export function paymentReceiptTemplate(p) {
  const amountLabel = p.priceLabel || formatMoney(p.priceAmount, p.currency)
  const subject = `Payment received — ${p.sessionTopic} on ${p.sessionDate}`

  const html = layout(
    subject,
    `
    ${badge('Payment Received', '#059669')}

    <p style="margin:0 0 16px">Hi ${esc(p.parentName)},</p>

    <p style="margin:0 0 16px">
      Thank you! We've received your payment and
      <strong>${esc(p.childName)}</strong>'s registration is now confirmed.
    </p>

    ${sessionCard(p)}

    ${gstInvoiceRows(p, 'Total paid')}

    ${p.registrationId ? `
    <p style="margin:16px 0 0;font-size:13px;color:#6B7280">
      Reference&nbsp;ID: <code style="background:#F3F4F6;padding:2px 6px;border-radius:4px">${esc(p.registrationId)}</code>
    </p>` : ''}

    <p style="margin:24px 0 0">
      We look forward to seeing ${esc(p.childName)} at the workshop!
      If you have any questions, please contact us.
    </p>

    <p style="margin:24px 0 0">See you there!<br>The ${esc(BRAND.name)} Team</p>
    `
  )

  const text = [
    `Hi ${p.parentName},`,
    '',
    `Payment received — ${p.childName}'s registration is confirmed:`,
    `  Workshop: ${p.sessionTopic}`,
    `  Date:     ${p.sessionDate}`,
    `  Time:     ${p.sessionTime}`,
    `  Location: ${p.branchName}${p.branchAddress ? ', ' + p.branchAddress : ''}`,
    Number(p.taxAmount) > 0
      ? `  Subtotal: ${p.subtotalLabel || formatMoney(p.priceAmount, p.currency)}`
      : '',
    Number(p.taxAmount) > 0 ? `  GST (5%): ${p.taxLabel || formatMoney(p.taxAmount, p.currency)}` : '',
    `  Total paid: ${amountLabel}`,
    p.registrationId ? `  Reference: ${p.registrationId}` : '',
    '',
    `See you there!`,
    `The ${BRAND.name} Team`,
  ].filter((l) => l !== undefined).join('\n')

  return { subject, html, text }
}

// ─── 7. Admin payment notification (internal) ────────────────

const ADMIN_EVENT_META = {
  payment_received: { label: 'Payment Completed', color: '#059669', badge: 'Payment Received' },
  payment_abandoned: { label: 'Payment Abandoned', color: '#D97706', badge: 'Payment Not Completed' },
  payment_reminder: { label: 'Payment Reminder Sent', color: '#2563EB', badge: 'Reminder Sent' },
}

/**
 * Internal notice to branch admins when a payment-related email is sent or payment completes.
 */
export function adminPaymentNotificationTemplate(p) {
  const meta = ADMIN_EVENT_META[p.eventType] || ADMIN_EVENT_META.payment_abandoned
  const amountLabel = p.priceLabel || (p.priceAmount != null ? formatMoney(p.priceAmount, p.currency) : '')
  const subject = `[Admin] ${meta.label} — ${p.childName} / ${p.sessionTopic}`

  const reminderLine = p.daysBefore
    ? `<p style="margin:0 0 16px"><strong>${esc(String(p.daysBefore))} days</strong> before the workshop — a payment reminder was emailed to the parent.</p>`
    : ''

  const html = layout(
    subject,
    `
    ${badge(meta.badge, meta.color)}

    <p style="margin:0 0 16px">${esc(meta.label)}</p>

    ${reminderLine}

    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:8px;margin:0 0 16px">
      <tbody>
        ${adminRow('Child', p.childName)}
        ${adminRow('Parent', p.parentName)}
        ${adminRow('Parent email', p.parentEmail)}
        ${adminRow('Workshop', p.sessionTopic)}
        ${adminRow('Date', p.sessionDate)}
        ${adminRow('Time', p.sessionTime)}
        ${Number(p.taxAmount) > 0 ? adminRow('Subtotal', p.subtotalLabel || formatMoney(p.priceAmount, p.currency)) : ''}
        ${Number(p.taxAmount) > 0 ? adminRow('GST (5%)', p.taxLabel || formatMoney(p.taxAmount, p.currency)) : ''}
        ${amountLabel ? adminRow(p.eventType === 'payment_received' ? 'Total paid' : 'Total due', amountLabel) : ''}
        ${p.registrationId ? adminRow('Registration ID', p.registrationId) : ''}
        ${p.branchName ? adminRow('Branch', p.branchName) : ''}
      </tbody>
    </table>

    <p style="margin:0;font-size:14px;color:#6B7280">
      This is an automated admin notification from ${esc(BRAND.name)}.
    </p>
    `
  )

  const text = [
    `[Admin] ${meta.label}`,
    p.daysBefore ? `${p.daysBefore} days before workshop — reminder sent to parent.` : '',
    '',
    `Child:          ${p.childName}`,
    `Parent:         ${p.parentName}`,
    `Parent email:   ${p.parentEmail}`,
    `Workshop:       ${p.sessionTopic}`,
    `Date:           ${p.sessionDate}`,
    `Time:           ${p.sessionTime}`,
    amountLabel ? `${p.eventType === 'payment_received' ? 'Amount paid' : 'Amount due'}: ${amountLabel}` : '',
    p.registrationId ? `Registration ID: ${p.registrationId}` : '',
    p.branchName ? `Branch: ${p.branchName}` : '',
  ].filter(Boolean).join('\n')

  return { subject, html, text }
}

function adminRow(label, value) {
  return `
    <tr>
      <td style="padding:10px 16px;font-size:13px;font-weight:600;color:#6B7280;white-space:nowrap;vertical-align:top;width:130px">${esc(label)}</td>
      <td style="padding:10px 16px 10px 0;font-size:15px;color:#111827;vertical-align:top">${esc(value)}</td>
    </tr>
    <tr><td colspan="2" style="padding:0"><hr style="margin:0;border:none;border-top:1px solid #F3F4F6"></td></tr>`
}

// ────────────────────────────────────────────────────────────
//  Shared HTML helpers  (edit here to rebrand all emails)
// ────────────────────────────────────────────────────────────

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatMoney(amount, currency = 'CAD') {
  const n = Number(amount)
  if (!Number.isFinite(n)) return String(amount ?? '')
  try {
    return new Intl.NumberFormat('en-CA', { style: 'currency', currency: currency || 'CAD' }).format(n)
  } catch {
    return `$${n.toFixed(2)}`
  }
}

function paymentSummaryRow(label, value) {
  return `
  <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 8px">
    <tr>
      <td style="
        padding:14px 16px;
        background:#F9FAFB;
        border:1px solid #E5E7EB;
        border-radius:8px;
      ">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="font-size:14px;font-weight:600;color:#374151">${esc(label)}</td>
            <td align="right" style="font-size:20px;font-weight:800;color:${BRAND.color}">${esc(value)}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`
}

function gstInvoiceRows(p, totalLabel = 'Total') {
  const tax = Number(p.taxAmount || 0)
  if (tax <= 0) {
    return paymentSummaryRow(totalLabel, p.priceLabel || formatMoney(p.priceAmount, p.currency))
  }
  return `
    ${paymentSummaryRow('Subtotal', p.subtotalLabel || formatMoney(p.priceAmount, p.currency))}
    ${paymentSummaryRow('GST (5%)', p.taxLabel || formatMoney(tax, p.currency))}
    ${paymentSummaryRow(totalLabel, p.priceLabel || formatMoney(p.totalAmount, p.currency))}
  `
}

function ctaButton(label, url) {
  if (!url) return ''
  return `
  <p style="margin:24px 0 0;text-align:center">
    <a href="${esc(url)}" style="
      display:inline-block;
      background:${BRAND.color};
      color:#FFFFFF;
      font-size:16px;
      font-weight:700;
      text-decoration:none;
      padding:14px 28px;
      border-radius:8px;
    ">${esc(label)}</a>
  </p>`
}

function badge(label, color) {
  return `
  <p style="margin:0 0 24px">
    <span style="
      display:inline-block;
      background:${color};
      color:#fff;
      font-size:13px;
      font-weight:600;
      letter-spacing:.5px;
      text-transform:uppercase;
      padding:4px 12px;
      border-radius:9999px;
    ">${label}</span>
  </p>`
}

function sessionCard(p) {
  const rows = [
    ['Workshop', p.sessionTopic],
    ['Date',     p.sessionDate],
    ['Time',     p.sessionTime],
    ['Location', p.branchAddress
      ? `${esc(p.branchName)}<br><span style="font-size:13px;color:#6B7280">${esc(p.branchAddress)}</span>`
      : esc(p.branchName)],
  ]

  const rowsHtml = rows.map(([label, value]) => `
    <tr>
      <td style="
        padding:10px 16px;
        font-size:13px;
        font-weight:600;
        color:#6B7280;
        white-space:nowrap;
        vertical-align:top;
        width:100px;
      ">${label}</td>
      <td style="
        padding:10px 16px 10px 0;
        font-size:15px;
        color:#111827;
        vertical-align:top;
      ">${value}</td>
    </tr>
    <tr><td colspan="2" style="padding:0"><hr style="margin:0;border:none;border-top:1px solid #F3F4F6"></td></tr>
  `).join('')

  return `
  <table width="100%" cellpadding="0" cellspacing="0" style="
    border:1px solid #E5E7EB;
    border-radius:8px;
    overflow:hidden;
    margin:0 0 8px;
  ">
    <thead>
      <tr>
        <td colspan="2" style="
          background:${BRAND.colorLight};
          padding:10px 16px;
          font-size:13px;
          font-weight:700;
          color:${BRAND.color};
          letter-spacing:.3px;
          text-transform:uppercase;
        ">Session Details</td>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>`
}

function layout(previewText, bodyHtml) {
  const year = new Date().getFullYear()
  const logoHtml = BRAND.logo
    ? `<img src="${BRAND.logo}" alt="${esc(BRAND.name)}" height="40" style="display:block;margin-bottom:8px">`
    : ''
  const footerLinks = [
    BRAND.website     && `<a href="${BRAND.website}" style="color:#9CA3AF;text-decoration:none">Website</a>`,
    BRAND.supportEmail && `<a href="mailto:${BRAND.supportEmail}" style="color:#9CA3AF;text-decoration:none">Contact Us</a>`,
  ].filter(Boolean).join(' &nbsp;·&nbsp; ')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${esc(previewText)}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background:#F9FAFB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">

  <!-- Preview text (hidden) -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all">
    ${esc(previewText)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>

  <!-- Outer wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F9FAFB;padding:32px 16px">
    <tr>
      <td align="center">

        <!-- Card -->
        <table width="560" cellpadding="0" cellspacing="0" style="
          max-width:560px;
          width:100%;
          background:#FFFFFF;
          border-radius:12px;
          border:1px solid #E5E7EB;
          overflow:hidden;
        ">

          <!-- Header bar -->
          <tr>
            <td style="background:${BRAND.color};padding:24px 32px">
              ${logoHtml}
              <span style="
                display:block;
                font-size:20px;
                font-weight:700;
                color:#FFFFFF;
                line-height:1.2;
              ">${esc(BRAND.name)}</span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 32px 24px;color:#374151;font-size:15px;line-height:1.6">
              ${bodyHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="
              background:#F9FAFB;
              border-top:1px solid #E5E7EB;
              padding:20px 32px;
              text-align:center;
              font-size:12px;
              color:#9CA3AF;
              line-height:1.6;
            ">
              ${footerLinks ? `<p style="margin:0 0 8px">${footerLinks}</p>` : ''}
              <p style="margin:0">&copy; ${year} ${esc(BRAND.name)}. All rights reserved.</p>
            </td>
          </tr>

        </table>
        <!-- /Card -->

      </td>
    </tr>
  </table>
</body>
</html>`
}
