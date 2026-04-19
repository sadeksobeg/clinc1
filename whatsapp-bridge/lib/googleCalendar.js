/**
 * Placeholder Google Calendar helpers — implement OAuth + token store in Ops API or n8n.
 * @param {{ accessToken: string }} _auth
 * @param {{ timeMin: string, timeMax: string, calendarId?: string }} _range
 * @returns {Promise<{ busy: Array<{ start: string, end: string }> }>}
 */
async function listBusySlots(_auth, _range) {
  return { busy: [] };
}

/**
 * @param {{ accessToken: string }} _auth
 * @param {{ calendarId?: string, summary: string, start: string, end: string, description?: string }} _event
 * @returns {Promise<{ eventId: string | null }>}
 */
async function createEvent(_auth, _event) {
  return { eventId: null };
}

module.exports = { listBusySlots, createEvent };
