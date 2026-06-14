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

    ${calendarButton(p.calendarUrl)}

    ${p.calendarInviteAttached ? calendarInviteNote() : ''}

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
    p.calendarUrl ? `\nAdd to Google Calendar:\n${p.calendarUrl}` : '',
    p.calendarInviteAttached
      ? '\nA calendar invite (.ics) is also attached — open it to add the event (recommended so cancellations can remove it automatically).'
      : '',
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

    ${p.calendarCancelAttached ? calendarCancelNote() : ''}

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
    p.calendarCancelAttached
      ? '\nA calendar cancellation (.ics) is attached — open it to remove the workshop from your calendar if you added it from our invite.'
      : '',
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

    ${calendarButton(p.calendarUrl)}

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
    p.calendarUrl ? `\nAdd to Google Calendar:\n${p.calendarUrl}` : '',
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

    ${p.calendarCancelAttached ? calendarCancelNote() : ''}

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
    p.calendarCancelAttached
      ? '\nA calendar cancellation (.ics) is attached — open it to remove the workshop from your calendar if you added it from our invite.'
      : '',
    '',
    `We apologise for the inconvenience. Please contact us if you have any questions.`,
    '',
    `We hope to see ${p.childName} at a future workshop!`,
    `The ${BRAND.name} Team`,
  ].filter((l) => l !== undefined).join('\n')

  return { subject, html, text }
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

function calendarButton(url) {
  if (!url) return ''
  return `
  <p style="margin:20px 0 0;text-align:center">
    <a href="${esc(url)}" target="_blank" rel="noopener noreferrer" style="
      display:inline-block;
      background:${BRAND.color};
      color:#ffffff !important;
      font-size:15px;
      font-weight:600;
      text-decoration:none;
      padding:12px 28px;
      border-radius:8px;
    ">📅&nbsp; Add to Google Calendar</a>
  </p>
  <p style="margin:8px 0 0;text-align:center;font-size:12px;color:#6B7280">
    Opens Google Calendar to save this workshop to your schedule
  </p>`
}

function calendarInviteNote() {
  return `
  <p style="margin:16px 0 0;padding:12px 16px;background:#F0FDF4;border-radius:8px;font-size:13px;color:#166534">
    <strong>Tip:</strong> A calendar invite is attached to this email.
    Open <em>workshop.ics</em> to add the event — if the workshop is later cancelled,
    we'll send a matching cancellation that removes it automatically.
  </p>`
}

function calendarCancelNote() {
  return `
  <p style="margin:20px 0 0;padding:12px 16px;background:#FEF2F2;border-radius:8px;font-size:13px;color:#991B1B">
    <strong>Calendar:</strong> If you added this workshop from our calendar invite,
    open the attached <em>workshop-cancelled.ics</em> file to remove it from your calendar.
    If you used the Google Calendar button instead, please delete the event manually.
  </p>`
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
