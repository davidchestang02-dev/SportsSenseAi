# Mobile App

The Expo client lives in `mobile/` and mirrors the main launch-critical surfaces:

- Slate
- Markets
- Risk
- AutoBet
- Admin

The mobile client reads `EXPO_PUBLIC_SSA_API_BASE` and falls back to bundled mock data when the API is unreachable.
