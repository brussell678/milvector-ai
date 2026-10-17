export const GA_MEASUREMENT_ID = "G-NH8RKDGNC2";

// Analytics covers the public pages only. The signed-in workspace, auth flow, and
// redirect-only routes are never measured.
const PRIVATE_PATH = /^\/(app|auth|login|welcome|dashboard|tools|api|message-board)(\/|$)/;

// Sign-in links land with one-time codes in the query string; never send those to Google.
const AUTH_PARAMS = /[?&](code|token_hash|token|access_token|refresh_token|error_description)=/;

export function shouldDisableAnalytics(pathname: string, search: string) {
  return PRIVATE_PATH.test(pathname) || AUTH_PARAMS.test(search);
}

// Runs in <head> before hydration so the disable flag is set before gtag sends anything.
export const gaInitScript = `(function(){var id='${GA_MEASUREMENT_ID}';if(${PRIVATE_PATH}.test(location.pathname)||${AUTH_PARAMS}.test(location.search)){window['ga-disable-'+id]=true;}window.dataLayer=window.dataLayer||[];window.gtag=function(){window.dataLayer.push(arguments);};window.gtag('js',new Date());window.gtag('config',id);})();`;
