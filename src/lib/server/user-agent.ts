/**
 * The User-Agent the proxy routes present to a portal.
 *
 * This is not cosmetic. Many Xtream panels filter on User-Agent as a crude
 * anti-scraping measure and answer an unrecognised client with 404 — the same
 * status as a missing path, which makes the cause invisible from the outside.
 * A portal that works in one player and 404s in another, from the same network
 * and the same credentials, is the signature of it.
 *
 * VLC is the de-facto reference IPTV client, so its User-Agent is the one
 * panels are most consistently configured to accept.
 *
 * MBAPLAYER_USER_AGENT overrides it, because the panels disagree and the person
 * running the app is the only one who can find out what theirs wants.
 */
export const PORTAL_USER_AGENT = process.env.MBAPLAYER_USER_AGENT || 'VLC/3.0.20 LibVLC/3.0.20'
