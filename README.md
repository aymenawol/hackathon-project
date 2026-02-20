# hackathon-project

Next.js + Tailwind + shadcn/ui + Supabase starter for the hackathon.

## Getting Started

```bash
npm install
cp .env.example .env.local   # add your Supabase keys
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Supabase

```bash
npx supabase login
npx supabase link --project-ref wnxnmxllmvilofbunlvj
npx supabase db push
```

## Deploy

Deployed on Vercel. Push to `main` to auto-deploy.
