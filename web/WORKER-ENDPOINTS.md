# Campaign Worker Endpoints

## POST /ai/generatePost
Body: { brief, platform, pillar, tone, audience, cta, language, count, returnVariants }
Returns (count=1):
  { text: string, hashtags: string[], variants: { tiktok, facebook, instagram, linkedin } }
Returns (count=5):
  { variants: [ { text, hashtags, variants } x5 ] }

## POST /ai/generateImage
Body: { prompt, platform, pillar, size }
Returns:
  { imageBase64: string, mime: "image/png", model: string, seed: number, prompt: string }
Note: imageBase64 is a RAW base64 string (no data: prefix).

## POST /ai/suggestHashtags
Body: { topic, platform, pillar, audience }
Returns:
  { hashtags: [ string | { tag: string, trend: string, traffic: number } ] }

## POST /social/post/facebook
Body: { caption, hashtags, imageBase64, imageMime, scheduledFor, utmUrl }
Returns:
  { ok: true, postId: string, url: string } | { ok: false, error: string }

## POST /social/post/tiktok
Body: { caption, hashtags, imageBase64, imageMime, scheduledFor, utmUrl }
Returns:
  { ok: true, publishId: string, status: string } | { ok: false, error: string }

## POST /socialStats
Body: { platform, url, videoId }
Returns:
  { ok: true, views, likes, comments, shares, followers, thumbnail, title, publishedAt }

## POST /trends/rss
Body: { geo: "KE" }
Returns (either form is accepted):
  { items: [ { title, traffic, link, pubDate } ] }
  OR
  { xml: "<rss>...</rss>" }

## POST /competitor/stats
Body: { platform, handle }
Returns:
  { ok: true, followers, views, engagementRate }
