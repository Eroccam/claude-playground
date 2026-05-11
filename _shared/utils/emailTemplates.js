/**
 * emailTemplates.js — Safran Events Platform
 * Reusable email draft templates for deadline reminders and follow-ups.
 * Used by deadline-tracker agent and any other notification workflows.
 */

/**
 * Generates a registration deadline reminder email.
 * @param {Object} event - Full event object from events.json
 * @param {Object} contact - Contact object from contacts.json
 * @param {number} daysRemaining - Days until the deadline
 * @returns {{ subject: string, body: string }}
 */
function registrationReminder(event, contact, daysRemaining) {
  const urgency = daysRemaining <= 1 ? 'TODAY' : daysRemaining <= 7 ? `in ${daysRemaining} days` : `in ${daysRemaining} days`;
  return {
    subject: `[ACTION REQUIRED] ${event.name} — Registration deadline ${urgency}`,
    body: `Dear ${contact.name},

This is a reminder that the registration deadline for ${event.name} is approaching.

Event Details:
  Name:     ${event.name}
  Dates:    ${event.startDate} to ${event.endDate}
  Location: ${event.location.venue ? event.location.venue + ', ' : ''}${event.location.city}, ${event.location.country}
  ${event.boothNumber ? `Booth:    ${event.boothNumber}` : ''}

Registration closes: ${urgency.toUpperCase()}

Please ensure all registration materials are submitted before the deadline.
${event.notes ? `\nNotes: ${event.notes}` : ''}

Best regards,
Safran Events Team`,
  };
}

/**
 * Generates a booth setup deadline reminder email.
 * @param {Object} event
 * @param {Object} contact
 * @param {number} daysRemaining
 * @returns {{ subject: string, body: string }}
 */
function boothSetupReminder(event, contact, daysRemaining) {
  return {
    subject: `[ACTION REQUIRED] ${event.name} — Booth setup deadline in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}`,
    body: `Dear ${contact.name},

Booth setup for ${event.name} must be completed in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}.

Event Details:
  Name:     ${event.name}
  Dates:    ${event.startDate} to ${event.endDate}
  Location: ${event.location.city}, ${event.location.country}
  ${event.boothNumber ? `Booth:    ${event.boothNumber}` : ''}

Please coordinate with the venue to confirm setup arrangements and ensure all booth materials are on-site.

Best regards,
Safran Events Team`,
  };
}

/**
 * Generates a materials submission deadline reminder.
 * @param {Object} event
 * @param {Object} contact
 * @param {number} daysRemaining
 * @returns {{ subject: string, body: string }}
 */
function materialsSubmissionReminder(event, contact, daysRemaining) {
  return {
    subject: `[ACTION REQUIRED] ${event.name} — Materials submission due in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}`,
    body: `Dear ${contact.name},

Marketing and exhibition materials for ${event.name} must be submitted in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}.

Event Details:
  Name:     ${event.name}
  Dates:    ${event.startDate} to ${event.endDate}
  Location: ${event.location.city}, ${event.location.country}

Please ensure all required materials (brochures, banners, digital assets) are finalised and submitted to the organiser.

Best regards,
Safran Events Team`,
  };
}

/**
 * Generates a payment due reminder email.
 * @param {Object} event
 * @param {Object} contact
 * @param {number} daysRemaining
 * @param {number} [amount] - Amount due in EUR (optional)
 * @returns {{ subject: string, body: string }}
 */
function paymentReminder(event, contact, daysRemaining, amount) {
  return {
    subject: `[ACTION REQUIRED] ${event.name} — Payment due in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}`,
    body: `Dear ${contact.name},

A payment is due for ${event.name} in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}.

Event Details:
  Name:     ${event.name}
  Dates:    ${event.startDate} to ${event.endDate}
  Location: ${event.location.city}, ${event.location.country}
  ${amount ? `Amount:   €${amount.toLocaleString('en-GB')}` : ''}

Please arrange payment through the appropriate procurement channel.

Best regards,
Safran Events Team`,
  };
}

/**
 * Generates an internal prep meeting reminder.
 * @param {Object} event
 * @param {Object} contact
 * @param {number} daysUntilEvent
 * @returns {{ subject: string, body: string }}
 */
function internalPrepReminder(event, contact, daysUntilEvent) {
  return {
    subject: `[REMINDER] ${event.name} — Internal prep meeting required (${daysUntilEvent} days to go)`,
    body: `Dear ${contact.name},

${event.name} is ${daysUntilEvent} days away. Please schedule an internal preparation meeting to review:

  - Booth staffing roster
  - Key messaging and talking points
  - Lead capture process
  - Logistics and travel arrangements
  - Budget status (allocated: ${event.budget ? '€' + event.budget.toLocaleString('en-GB') : 'TBC'})

Event Details:
  Dates:    ${event.startDate} to ${event.endDate}
  Location: ${event.location.city}, ${event.location.country}
  ${event.boothNumber ? `Booth:    ${event.boothNumber}` : ''}

Best regards,
Safran Events Team`,
  };
}

/**
 * Dispatches to the correct template based on deadline type.
 * @param {string} deadlineType - One of the schema deadline type enum values
 * @param {Object} event
 * @param {Object} contact
 * @param {number} daysRemaining
 * @returns {{ subject: string, body: string }}
 */
function generateEmailDraft(deadlineType, event, contact, daysRemaining) {
  switch (deadlineType) {
    case 'registration':   return registrationReminder(event, contact, daysRemaining);
    case 'booth-setup':    return boothSetupReminder(event, contact, daysRemaining);
    case 'materials':      return materialsSubmissionReminder(event, contact, daysRemaining);
    case 'payment':        return paymentReminder(event, contact, daysRemaining, event.budget);
    case 'internal-prep':  return internalPrepReminder(event, contact, daysRemaining);
    default:
      return {
        subject: `[REMINDER] ${event.name} — ${deadlineType} deadline in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}`,
        body: `Dear ${contact.name},\n\nThis is a reminder about the ${deadlineType} deadline for ${event.name} in ${daysRemaining} days.\n\nBest regards,\nSafran Events Team`,
      };
  }
}

// CommonJS export (Node.js / agents)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    registrationReminder,
    boothSetupReminder,
    materialsSubmissionReminder,
    paymentReminder,
    internalPrepReminder,
    generateEmailDraft,
  };
}
