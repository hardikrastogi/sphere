# Sphere

A full-stack social media app — posts, stories, real-time chat, video/audio calling, and a private-account system, built from scratch with a Next.js frontend and a NestJS backend.

**Live demo:** [sphere-nu-eight.vercel.app](https://sphere-nu-eight.vercel.app)

![Next.js](https://img.shields.io/badge/Next.js-16-black)
![NestJS](https://img.shields.io/badge/NestJS-11-E0234E)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Prisma-336791)

## Features

- **Posts** — photo/video posts, likes, comments, double-tap-to-like, an Instagram-style explore grid
- **Stories** — 24-hour stories with seen/unseen rings, auto-advancing progress bars, and a viewer list for your own stories
- **Real-time chat** — 1:1 messaging over Socket.io, typing indicators, read receipts, online/offline presence, sharing a post directly into a conversation, and unsent drafts that survive a page reload
- **Video & audio calling** — WebRTC-based 1:1 calls with a full signaling layer (ringing, answer/reject, mute, camera toggle)
- **Follow system with private accounts** — public accounts are followed instantly; private accounts require approval, consistently enforced across the feed, explore, profile, and followers/following lists
- **Notifications** — likes, comments, follow requests/accepts, delivered in real time
- **Settings** — private account toggle, dark mode, online-activity visibility toggle, a local device-time-spent stat, logout
- **Google OAuth** alongside email/password auth, JWT in an httpOnly cookie
- Redis-backed caching on the home and explore feeds

## Tech stack

**Client** (`client/`) — Next.js 16 (App Router, Turbopack), React, TypeScript, Tailwind CSS, Redux Toolkit, TanStack React Query, Socket.io client, React Hook Form + Zod

**Server** (`server/`) — NestJS 11, Prisma ORM, PostgreSQL ([Neon](https://neon.tech)), Redis ([Upstash](https://upstash.com)), Socket.io, Passport (JWT + Google OAuth2), Cloudinary (media storage)

## Architecture

The client and server are two independent apps in one repo, deployed separately:

```
Sphere/
├── client/   Next.js app  → deployed on Vercel
└── server/   NestJS API   → deployed on Render
```

They communicate entirely over HTTP (REST) and WebSockets (Socket.io) — there's no shared runtime, which is also why they're deployed to two different platforms: Vercel's serverless functions can't host the persistent WebSocket connections chat and calling depend on, so the API runs on Render instead.

## Running it locally

**Prerequisites:** Node.js 20+, a PostgreSQL database (Neon works, or run one locally — see `docker-compose.yml`), a Redis instance (Upstash works, or run one locally), a Cloudinary account, and a Google OAuth client.

```bash
git clone https://github.com/hardikrastogi/sphere.git
cd sphere
npm install              # installs the root `concurrently` dev script
cd client && npm install && cd ..
cd server && npm install && cd ..
```

Copy each `.env.example` and fill in real values:

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env.local
```

Run the database migrations, then start both apps together from the repo root:

```bash
cd server && npx prisma migrate deploy && cd ..
npm run dev
```

This starts the NestJS API on `:4000` and the Next.js app on `:3000`.

## Project structure

```
server/src/
├── auth/          JWT + Google OAuth
├── users/         profiles, search
├── posts/         feed, explore, likes, comments
├── stories/       stories + viewer tracking
├── follow/        follow requests, followers/following lists
├── chat/          REST + Socket.io gateway
├── calls/         WebRTC call signaling + history
├── notifications/
└── redis/         feed/explore caching

client/src/
├── app/           Next.js App Router pages
├── components/    shared UI + feature components
├── hooks/         useCall, auth checks
├── lib/           API client, socket client, config
└── store/         Redux (auth state)
```

## Documentation

`docs/architecture/` has deeper write-ups of the chat, calling, notifications, and stories systems. `docs/changes/` is a running log of every feature and fix made during development, in the order they happened.
