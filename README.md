This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Abuse protection for `/api/translate`

The translate endpoint now has lightweight server-side limits backed by Upstash Redis:

- 10 requests per minute per IP
- 200 requests per day per IP
- 2000 requests per day globally

When exceeded, the API returns:

- HTTP `429`
- JSON: `{ "error": "rate_limited", "message": "<short human message>" }`
- `Retry-After` header (minute limit and daily limits)

### Required environment variables

Set these in local `.env.local` and in Vercel project settings:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

OpenAI is still required:

- `OPENAI_API_KEY`

### Vercel configuration checklist

1. In Vercel, open your project.
2. Go to `Settings` -> `Environment Variables`.
3. Add:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
   - `OPENAI_API_KEY`
4. Apply to Production (and Preview if needed).
5. Redeploy.

### Quick local verification with curl

Use localhost dev server:

```bash
curl -i -X POST "http://localhost:3000/api/translate" \
  -H "Content-Type: application/json" \
  -d '{"text":"test tweet"}'
```

Minute limit test (expect `429` after ~10 requests in 1 minute):

```bash
for i in {1..12}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST "http://localhost:3000/api/translate" \
    -H "Content-Type: application/json" \
    -d '{"text":"load test"}'
done
```

You can inspect headers when limited:

```bash
curl -i -X POST "http://localhost:3000/api/translate" \
  -H "Content-Type: application/json" \
  -d '{"text":"load test"}'
```
