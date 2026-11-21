// What the Targeted Resume Builder accepts, shared by the page and the API so
// the page can warn before a long paste is refused.

/** A job posting, in characters. Long enough for any posting with its boilerplate. */
export const POSTING_LIMIT = 30000;

/** A resume pasted for one run, in characters. */
export const PASTE_LIMIT = 40000;
