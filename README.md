# AION2 Guild Management

A web-based guild management platform for **AION2**, designed to help guild leaders manage members, track character progression, review equipment, and organize party compositions in one place.

## Features

### Dashboard
- Overview of guild statistics and member activity.
- Character class distribution.
- Top members and recent updates.

### Member Management
- Manage guild members and character profiles.
- Track Combat Power (CP) and character progression.
- Filter and search members.

### Character Profiles
- View character information and equipment.
- Inspect equipment details through interactive tooltips.
- Load item details on demand when hovering over equipment.

### Character History
- Track character changes over time.
- Review historical snapshots.
- Compare character progression and equipment changes.

### Party Builder
- Create and manage party compositions.
- Assign members to party slots.
- Filter members by character information and comments.
- Analyze party composition and roles.

### API Lab
- Explore and inspect AION2 API responses.
- View character data and API results.

## Tech Stack

| Technology | Purpose |
|---|---|
| Next.js 16 | Frontend framework |
| React 19 | UI library |
| TypeScript | Type safety |
| Tailwind CSS 4 | Styling |
| shadcn/ui | UI components |
| Supabase | Database and backend services |
| FastAPI | AION2 API service |

## Project Architecture

The project consists of two main applications:

- **Frontend:** Next.js application responsible for the user interface and application logic.
- **Backend:** Python FastAPI service responsible for communicating with AION2 APIs and providing character data.

The frontend communicates with the backend through Next.js API routes.

## Getting Started

### Prerequisites

- Node.js
- pnpm
- Supabase project
- AION2 API backend

### Installation

Clone the repository:

```bash
git clone https://github.com/devil26hours/Aion2-guild-manage.git
cd Aion2-guild-manage
```

Install dependencies:

```bash
pnpm install
```

Configure the required environment variables for Supabase and the AION2 API backend.

Start the development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Backend

The AION2 API backend is maintained separately:

[https://github.com/devil26hours/aion2_api](https://github.com/devil26hours/aion2_api)

Refer to the backend repository for installation and API configuration instructions.

## Development

Run the development server:

```bash
pnpm dev
```

Create a production build:

```bash
pnpm build
```

Run the production server:

```bash
pnpm start
```

## License

This project is maintained for AION2 guild management purposes.
