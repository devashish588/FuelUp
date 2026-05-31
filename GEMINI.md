# FuelUp App - Project Rules

## Project Context
FuelUp is a mobile-first Progressive Web App for comprehensive fitness tracking including calories, diet plans, body metrics, exercise logging, PRs, and habit tracking.

## Tech Stack
- Next.js 14 (App Router) with TypeScript
- Tailwind CSS for styling
- Shadcn UI for component library
- Recharts for charts and data visualization
- Supabase for database, auth, and real-time
- Zustand for client state management
- next-pwa for Progressive Web App features

## Code Style Rules
- Use TypeScript strict mode; no `any` types
- Use functional components with hooks only
- Use named exports for components
- Use `'use client'` directive only when needed (client-side interactivity)
- Keep Server Components as default; mark Client Components explicitly
- Follow the file naming convention: `kebab-case` for files, `PascalCase` for components
- All database queries go through dedicated service files in `/lib/services/`
- Use Zod for form validation schemas
- Error boundaries on every page

## Folder Structure
```
src/
├── app/                    # Next.js App Router pages
│   ├── (auth)/            # Auth pages (login, signup)
│   ├── (main)/            # Main app pages (with layout)
│   │   ├── dashboard/
│   │   ├── calories/
│   │   ├── diet/
│   │   ├── metrics/
│   │   ├── exercise/
│   │   ├── prs/
│   │   ├── habits/
│   │   ├── analytics/
│   │   └── settings/
│   ├── onboarding/
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── ui/                # Shadcn UI components
│   ├── charts/            # Recharts wrapper components
│   ├── forms/             # Form components
│   ├── layout/            # Header, nav, sidebar
│   └── shared/            # Reusable shared components
├── lib/
│   ├── supabase/          # Supabase client config
│   ├── services/          # Database service functions
│   ├── utils/             # Utility functions
│   ├── validators/        # Zod schemas
│   ├── constants/         # App constants
│   └── types/             # TypeScript types/interfaces
├── stores/                # Zustand stores
└── hooks/                 # Custom React hooks
```

## Design Rules
- Mobile-first: design for 375px width minimum, scale up
- Use Shadcn UI components as base; customize with Tailwind
- Color palette: Green primary (#10b981), slate neutrals, white backgrounds
- Charts use a consistent color palette: green, blue, amber, rose, purple
- Cards with subtle shadows and rounded corners (rounded-xl)
- Bottom navigation bar for mobile (5 tabs max)
- All interactive elements have hover/active states
- Loading skeletons for async content
- Toast notifications for actions (success/error)

## Data Handling Rules
- All dates stored as ISO 8601 format
- All weights in kg internally; convert for display based on user preference
- All calorie values as positive integers
- Use optimistic updates for better UX; rollback on error
- Cache frequently accessed data (food items, exercises) client-side

## Chart Rules
- Use Recharts library for all charts
- All charts must be responsive (ResponsiveContainer)
- Include tooltips on all chart data points
- Use consistent colors across the app
- Line charts for trends (weight, calories over time)
- Bar charts for comparisons (daily macros, volume)
- Pie/donut charts for composition (macro split)
- Area charts for body fat progression
- Calendar heatmaps for habits (custom component)
