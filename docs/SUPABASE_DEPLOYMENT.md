# Supabase Deployment Strategy

This document outlines the strategy for local testing and production deployment of the East vs West game using Supabase.

## 1. Project Setup & Configuration

*   **Supabase Project:** A new Supabase project will be created to host the database, authentication, and other backend services.
*   **Supabase CLI:** The Supabase CLI will be used for local development, database migrations, and deployments.
*   **Environment Variables:** The application will be configured with environment variables for the Supabase URL and anon key. `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` will be added to the configuration and `.gitignore`.

## 2. Local Development & Testing

*   **Local Supabase Instance:** The Supabase CLI will be used to run a local instance of Supabase for development and testing. This allows for isolated development without affecting the production environment.
*   **Testing:**
    *   **Unit Tests:** Unit tests will be written to test individual components and functions.
    *   **Integration Tests:** Integration tests will be written to test the interaction between the application and the local Supabase instance. Supabase services will be mocked to ensure tests are fast and reliable.

## 3. Production Deployment

*   **Production Configuration:** The production environment will be configured with the production Supabase project's URL and anon key.
*   **Configuration Sync:** Deploy local configuration to production using the Supabase CLI:
    ```bash
    # Push local config.toml to production
    npx supabase config push --project-ref <your-project-ref>
    ```
    This ensures settings like anonymous authentication, JWT expiry, rate limits, and other auth settings are synchronized between local and production environments.
*   **Security:** The Supabase project will be secured for production by:
    *   Enabling Row Level Security (RLS) on all tables.
    *   Configuring appropriate access policies.
    *   Using secure environment variable management.
