/**
 * Local server clock night window for muting automated /send replies.
 * Disabled if start/end env not both set to valid 0-23.
 */
function isNightMuted({ startHour, endHour }) {
  if (startHour == null || endHour == null) return false;
  if (startHour < 0 || startHour > 23 || endHour < 0 || endHour > 23) return false;
  if (startHour === endHour) return false;
  const h = new Date().getHours();
  if (startHour < endHour) return h >= startHour && h < endHour;
  return h >= startHour || h < endHour;
}

module.exports = { isNightMuted };
