// Google Search Console ownership file. Cloudflare Pages redirects *.html to the
// extensionless URL, which Google's verifier may not follow, so serve it directly.
export const onRequest = () =>
  new Response('google-site-verification: google67517423988a90d9.html', {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
