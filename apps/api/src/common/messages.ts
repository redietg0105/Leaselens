/**
 * Shown when a write is refused because the record changed after it was read (another person, or the
 * AI, acted at the same moment). Writes check the state they were based on, so two people can't
 * both act on the same old version — e.g. lower an emergency someone else just raised.
 */
export const CHANGED_BY_SOMEONE_ELSE = 'This request was just changed by someone else. Reload the page and try again.';
