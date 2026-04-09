# Testing Strategy

The current test suite covers:

- Unit: player model, market maker, and risk engine math
- Integration: schema and backend route presence
- Regression: score-band expectations
- Performance: simulation runtime smoke test
- Safety: auto-bet bankroll cap behavior
- E2E: projection-to-slip pipeline smoke test

Run locally with:

```powershell
python -m pytest tests
```
